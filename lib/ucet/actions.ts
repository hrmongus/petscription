import type { Json, Tables, TablesInsert, TablesUpdate } from '../database.types';
import { boxesAllowed, shippingPrice, type DeliveryMethod } from '../carriers';
import { CheckoutError, type DeliveryInput } from '../checkout';
import type { DeliveryPoint } from '../delivery-points';
import type { Mail, Mailer } from '../email';
import type { EmailDog } from '../emails';
import { subscriptionCancelledEmail, subscriptionChangedEmail, subscriptionPauseEmail } from '../emails-admin';
import { serverParams, type BagId } from '../engine-server';
import type { ShipTo } from '../fhb/build-order';
import { OrderActionError } from '../order-actions';
import { PlanChangeError, type PlanChangeInput, type PlanPreview as SharedPreview } from '../subscription-actions';
import { addDays, chargeTime, skippedCharge, type CycleParams } from '../subscription-schedule';
import { chooseProduct, eligibleProducts, PlanError, productName, type Eligible } from './plan';

/*
 * Akcie zákazníka v /ucet (SPEC P4, §10.36). Volajú ich /api/ucet/predplatne/<id>/<akcia>. Vlastníctvo sa kontroluje tu
 * (sub.customer_id = prihlásený zákazník), zápisy service rolou.
 *
 * Jedna verzia s adminom (P3): prepočet a zmena predplatného = lib/subscription-actions.ts (previewPlanChange,
 * applyPlanChange, syncShipping), overenie doručenia = resolveDelivery (lib/checkout.ts), úprava objednávky vo FHB =
 * updateOrderDelivery (lib/order-actions.ts), e-maily = lib/emails-admin.ts. Tu je iba to, čo platí len pre zákazníka:
 * iba vhodné receptúry, kontrola boxu pri balení bez boxov, limity dátumov, povinný dôvod zrušenia.
 *
 *   posunut   ďalšia platba a odoslanie v zvolený deň (zajtra … +120 dní)
 *   preskocit ďalšia platba o D dní neskôr (skippedCharge)
 *   pauza / obnovit
 *   vaha      { kg, preview } → prepočet dávky, D, ceny (náhľad pred potvrdením)
 *   plan      { productId, bagId, preview } → iba vhodné receptúry podľa engine
 *   dorucenie { delivery } → rovnaké overenie ako checkout; otvorená objednávka vo FHB iba v stave pending
 *   zrusit    { reason } → ku koncu obdobia (Stripe cancel_at_period_end); zrusit-spat → odvolať
 * Zmena D: next_charge = posledné doručenie + D_nové − LEAD (SPEC §1); rovnaké D → dátum ostáva (§10.30).
 */

type Sub = Tables<'subscriptions'>;
type Order = Tables<'orders'>;
type Customer = Tables<'customers'>;
type Dog = Tables<'dogs'>;

export class ActionError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

export type ActionDeps = {
  store: {
    getSubscription(id: string): Promise<Sub | null>;
    getDog(id: string): Promise<Dog | null>;
    getAddress(id: string): Promise<Tables<'addresses'> | null>;
    ordersOfSubscription(id: string): Promise<Order[]>;
    updateSubscription(id: string, patch: TablesUpdate<'subscriptions'>): Promise<void>;
    updateCustomer(id: string, patch: TablesUpdate<'customers'>): Promise<void>;
    insertAddress(row: TablesInsert<'addresses'>): Promise<Tables<'addresses'>>;
    audit(row: TablesInsert<'audit_log'>): Promise<void>;
  };
  stripe: {
    move(stripeSubId: string, at: Date): Promise<unknown>;
    pause(stripeSubId: string): Promise<unknown>;
    resume(stripeSubId: string, at: Date): Promise<unknown>;
    cancelAtPeriodEnd(stripeSubId: string, on: boolean): Promise<unknown>;
  };
  /** spoločné s adminom: lib/subscription-actions.ts */
  plan: {
    preview(ctx: { sub: Sub; dog: Dog; address: { delivery_method: string }; lastOrderAt?: Date | null; cycle: CycleParams; now?: Date }, input: PlanChangeInput): SharedPreview;
    apply(ctx: { sub: Sub; dog: Dog }, p: SharedPreview): Promise<void>;
    syncShipping(sub: Sub, method: DeliveryMethod): Promise<{ before: number; after: number; changed: boolean }>;
  };
  /** spoločné s adminom: resolveDelivery (lib/checkout.ts) a updateOrderDelivery (lib/order-actions.ts) */
  resolveDelivery(d: DeliveryInput, bagId: BagId): Promise<{ point: DeliveryPoint | null; shipTo: ShipTo }>;
  updateOrderDelivery(orderId: string, shipTo: ShipTo): Promise<{ mode: 'local' | 'fhb' | 'none' }>;
  /** je výdajné miesto box? (pri zmene na balenie bez boxov) */
  isBox(method: DeliveryMethod, pointId: string): Promise<boolean>;
  cycle: CycleParams;
  mail?: Mailer;
  siteUrl: string;
  now?: () => Date;
};

export type ActionResult = { ok: true; message: string; preview?: unknown };

const MAX_MOVE_DAYS = 120;
const OPEN = ['paid', 'fhb_error', 'sent_to_fhb', 'confirmed'];

/* ---------------------------------------------------------------- spoločné */

async function own(deps: ActionDeps, customer: Customer, subId: string) {
  const sub = await deps.store.getSubscription(subId);
  if (!sub || sub.customer_id !== customer.id) throw new ActionError('Predplatné sme nenašli.', 404);
  if (!sub.stripe_subscription_id) throw new ActionError('Predplatné ešte nie je aktívne.', 409);
  return sub as Sub & { stripe_subscription_id: string };
}

function requireStatus(sub: Sub, allowed: Sub['status'][], msg?: string) {
  if (allowed.includes(sub.status)) return;
  const m: Record<string, string> = {
    cancelled: 'Predplatné je zrušené.',
    paused: 'Predplatné je pozastavené. Najprv ho obnov.',
    past_due: 'Posledná platba neprešla. Najprv zmeň kartu v časti Karta a faktúry.',
  };
  throw new ActionError(msg ?? m[sub.status] ?? 'Túto zmenu teraz nemôžeš urobiť.', 409);
}

function requireNotCancelling(sub: Sub) {
  if (sub.cancel_at) throw new ActionError('Predplatné je zrušené ku koncu obdobia. Ak ho chceš ďalej, najprv zrušenie odvolaj.', 409);
}

const ymd = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Bratislava' }).format(d);
const dateSkShort = (d: Date) => new Intl.DateTimeFormat('sk-SK', { timeZone: 'Europe/Bratislava', day: 'numeric', month: 'numeric', year: 'numeric' }).format(d).replace(/\s/g, ' ');
const dogOf = (d: Dog | null): EmailDog => (d ? { name: d.name, sex: (d.answers as { sex?: string })?.sex ?? null } : null);

async function audit(deps: ActionDeps, customer: Customer, action: string, sub: Sub, after: unknown, before?: unknown) {
  await deps.store
    .audit({ actor: 'customer', action, entity: 'subscription', entity_id: sub.id, before: (before ?? null) as Json, after: { ...(after as object), customer_id: customer.id } as Json })
    .catch((e) => console.error('[ucet] audit zlyhal', action, e));
}

/** súčasná cena dopravy (spôsob doručenia × balenie, plán predplatné) */
export function currentShippingCents(method: DeliveryMethod, bagId: string): number {
  return Math.round(shippingPrice(method, bagId as BagId, serverParams().shipping, 'mesiac') * 100);
}

async function send(deps: ActionDeps, sub: Sub, what: string, build: (dog: EmailDog) => Mail) {
  if (!deps.mail) return;
  const dog = await deps.store.getDog(sub.dog_id).catch(() => null);
  await deps.mail(build(dogOf(dog))).catch((e) => console.error('[ucet] email zlyhal', what, e));
}

async function pauseMail(deps: ActionDeps, customer: Customer, sub: Sub, kind: 'paused' | 'resumed' | 'cancel_revoked', nextCharge: Date | null) {
  const a = await deps.store.getAddress(sub.address_id).catch(() => null);
  const shippingCents = a ? currentShippingCents(a.delivery_method as DeliveryMethod, sub.bag_id) : 0;
  const at = deps.now?.() ?? new Date();
  await send(deps, sub, kind, (dog) => subscriptionPauseEmail({ to: customer.email, name: customer.name, dog, siteUrl: deps.siteUrl, sub, kind, at, nextCharge, shippingCents }));
}

/** posledná (nezrušená) objednávka predplatného: od nej sa odhadne doručenie, kým FHB nepošle delivered_at */
async function lastOrderAt(deps: ActionDeps, sub: Sub): Promise<Date | null> {
  const orders = await deps.store.ordersOfSubscription(sub.id);
  const last = orders.filter((o) => o.status !== 'cancelled').sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  return last ? new Date(last.created_at) : null;
}

/** zvolený deň „YYYY-MM-DD“ → platba o 06:00 UTC v ten deň; zajtra … +120 dní */
export function parseChargeDay(day: unknown, now: Date): Date {
  if (typeof day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new ActionError('Vyber dátum.');
  const at = chargeTime(new Date(`${day}T00:00:00Z`));
  const min = chargeTime(addDays(new Date(`${ymd(now)}T00:00:00Z`), 1));
  const max = chargeTime(addDays(new Date(`${ymd(now)}T00:00:00Z`), MAX_MOVE_DAYS));
  if (Number.isNaN(at.getTime()) || at < min) throw new ActionError('Najskôr sa dá zajtra.');
  if (at > max) throw new ActionError(`Najneskôr o ${MAX_MOVE_DAYS} dní. Ak potrebuješ dlhšiu prestávku, predplatné pozastav.`);
  return at;
}

/* ---------------------------------------------------------------- dátum ďalšej dodávky */

export async function moveDelivery(deps: ActionDeps, customer: Customer, subId: string, day: unknown): Promise<ActionResult> {
  const sub = await own(deps, customer, subId);
  requireStatus(sub, ['active']);
  requireNotCancelling(sub);
  const at = parseChargeDay(day, deps.now?.() ?? new Date());
  await deps.stripe.move(sub.stripe_subscription_id, at);
  await deps.store.updateSubscription(sub.id, { next_charge_at: at.toISOString() });
  await audit(deps, customer, 'ucet.move', sub, { next_charge_at: at.toISOString() }, { next_charge_at: sub.next_charge_at });
  return { ok: true, message: `Ďalšie vrece pošleme ${dateSkShort(at)}.` };
}

export async function skipDelivery(deps: ActionDeps, customer: Customer, subId: string): Promise<ActionResult> {
  const sub = await own(deps, customer, subId);
  requireStatus(sub, ['active']);
  requireNotCancelling(sub);
  if (!sub.next_charge_at) throw new ActionError('Ďalšia dodávka ešte nie je naplánovaná.', 409);
  const charge = skippedCharge(new Date(sub.next_charge_at), sub.days_per_bag);
  await deps.stripe.move(sub.stripe_subscription_id, charge);
  await deps.store.updateSubscription(sub.id, { next_charge_at: charge.toISOString() });
  await audit(deps, customer, 'ucet.skip', sub, { next_charge_at: charge.toISOString() }, { next_charge_at: sub.next_charge_at });
  return { ok: true, message: `Dodávku sme preskočili. Ďalšie vrece pošleme ${dateSkShort(charge)}.` };
}

/* ---------------------------------------------------------------- pauza */

export async function pauseSubscription(deps: ActionDeps, customer: Customer, subId: string): Promise<ActionResult> {
  const sub = await own(deps, customer, subId);
  requireStatus(sub, ['active']);
  requireNotCancelling(sub);
  await deps.stripe.pause(sub.stripe_subscription_id);
  await deps.store.updateSubscription(sub.id, { status: 'paused' });
  await audit(deps, customer, 'ucet.pause', sub, { status: 'paused' }, { status: sub.status });
  await pauseMail(deps, customer, sub, 'paused', null);
  return { ok: true, message: 'Predplatné je pozastavené. Kým ho neobnovíš, nič nepošleme ani neúčtujeme.' };
}

export async function resumeSubscription(deps: ActionDeps, customer: Customer, subId: string, day?: unknown): Promise<ActionResult> {
  const sub = await own(deps, customer, subId);
  requireStatus(sub, ['paused'], 'Predplatné nie je pozastavené.');
  const now = deps.now?.() ?? new Date();
  let at: Date;
  if (day) at = parseChargeDay(day, now);
  else {
    const tomorrow = chargeTime(addDays(now, 1));
    const planned = sub.next_charge_at ? new Date(sub.next_charge_at) : tomorrow;
    at = planned > tomorrow ? planned : tomorrow;
  }
  await deps.stripe.resume(sub.stripe_subscription_id, at);
  await deps.store.updateSubscription(sub.id, { status: 'active', next_charge_at: at.toISOString() });
  await audit(deps, customer, 'ucet.resume', sub, { status: 'active', next_charge_at: at.toISOString() }, { status: sub.status });
  await pauseMail(deps, customer, sub, 'resumed', at);
  return { ok: true, message: `Predplatné opäť beží. Ďalšie vrece pošleme ${dateSkShort(at)}.` };
}

/* ---------------------------------------------------------------- váha, receptúra, balenie */

/** náhľad pre stránku /ucet (tabuľka „Teraz / Po zmene“) */
export type PlanPreview = {
  before: { productId: string; productName: string; bagId: string; gramsPerDay: number; daysPerBag: number; unitAmountCents: number; shippingCents: number; nextChargeAt: string | null };
  after: { productId: string; productName: string; bagId: string; gramsPerDay: number; daysPerBag: number; unitAmountCents: number; shippingCents: number; totalCents: number; nextChargeAt: string; kg: number };
  productSwitched: boolean;
  products: Eligible['products'];
};

async function planContext(deps: ActionDeps, customer: Customer, subId: string) {
  const sub = await own(deps, customer, subId);
  requireStatus(sub, ['active', 'paused']);
  requireNotCancelling(sub);
  const [dog, address] = await Promise.all([deps.store.getDog(sub.dog_id), deps.store.getAddress(sub.address_id)]);
  if (!dog || !address) throw new ActionError('Chýbajú údaje o psovi alebo doručení. Napíš nám na podpora@granula.sk.', 409);
  return { sub, dog, address };
}

async function previewOf(deps: ActionDeps, ctx: Awaited<ReturnType<typeof planContext>>, change: { kg?: number; productId?: string; bagId?: string }) {
  const { sub, dog, address } = ctx;
  const now = deps.now?.() ?? new Date();
  const method = address.delivery_method as DeliveryMethod;
  let shared: SharedPreview, eligible: Eligible, switched: boolean;
  try {
    if (change.kg != null && !(change.kg >= 0.5 && change.kg <= 90)) throw new PlanError('Zadaj váhu psa od 0,5 do 90 kg.');
    // iba vhodné receptúry (zákazník); admin smie aj menej vhodnú
    eligible = eligibleProducts({ answers: dog.answers, birthDate: dog.birth_date, now, kg: change.kg });
    const choice = chooseProduct(eligible, sub.product_id, change.productId);
    switched = choice.switched;
    shared = deps.plan.preview(
      { sub, dog, address, lastOrderAt: await lastOrderAt(deps, sub), cycle: deps.cycle, now },
      { productId: choice.productId, bagId: (change.bagId ?? sub.bag_id) as BagId, kg: change.kg ?? null },
    );
  } catch (e) {
    if (e instanceof PlanError || e instanceof PlanChangeError) throw new ActionError(e.message);
    if ((e as Error).name === 'ZodError') throw new ActionError('Neznáme balenie alebo receptúra.');
    throw e;
  }
  const q = shared.quote;
  if (q.bagId !== sub.bag_id && address.point_id && !boxesAllowed(method, q.bagId) && (await deps.isBox(method, address.point_id)))
    throw new ActionError(`Pri balení ${q.bagId} kg sa nedá doručiť do boxu. Najprv zmeň výdajné miesto na odberné miesto.`);
  const preview: PlanPreview = {
    before: { productId: sub.product_id, productName: productName(sub.product_id), bagId: sub.bag_id, gramsPerDay: sub.grams_per_day, daysPerBag: sub.days_per_bag, unitAmountCents: sub.unit_amount_cents, shippingCents: currentShippingCents(method, sub.bag_id), nextChargeAt: sub.next_charge_at },
    after: { productId: q.productId, productName: productName(q.productId), bagId: q.bagId, gramsPerDay: q.gramsPerDay, daysPerBag: q.daysPerBag, unitAmountCents: q.unitAmountCents, shippingCents: shared.shippingCents, totalCents: q.unitAmountCents + shared.shippingCents, nextChargeAt: shared.nextCharge.toISOString(), kg: shared.answers.kg },
    productSwitched: switched,
    products: eligible.products,
  };
  return { shared, preview };
}

async function applyPlan(deps: ActionDeps, customer: Customer, ctx: Awaited<ReturnType<typeof planContext>>, shared: SharedPreview, action: string) {
  const { sub, dog } = ctx;
  await deps.plan.apply({ sub, dog }, shared);
  const q = shared.quote;
  await audit(deps, customer, action, sub, { product_id: q.productId, bag_id: q.bagId, grams_per_day: q.gramsPerDay, days_per_bag: q.daysPerBag, unit_amount_cents: q.unitAmountCents, next_charge_at: shared.nextCharge.toISOString(), kg: shared.answers.kg }, { product_id: sub.product_id, bag_id: sub.bag_id, grams_per_day: sub.grams_per_day, days_per_bag: sub.days_per_bag, unit_amount_cents: sub.unit_amount_cents, next_charge_at: sub.next_charge_at, kg: dog.weight_kg });
  const after = { ...sub, product_id: q.productId, bag_id: q.bagId, grams_per_day: q.gramsPerDay, days_per_bag: q.daysPerBag, unit_amount_cents: q.unitAmountCents };
  await send(deps, sub, 'subscription_changed', (d) => subscriptionChangedEmail({ to: customer.email, name: customer.name, dog: d, siteUrl: deps.siteUrl, sub: after, shippingCents: shared.shippingCents, nextCharge: shared.nextCharge }));
}

export async function changeWeight(deps: ActionDeps, customer: Customer, subId: string, body: { kg?: unknown; preview?: unknown }): Promise<ActionResult> {
  const kg = Math.round(Number(String(body.kg ?? '').replace(',', '.')) * 10) / 10;
  if (!Number.isFinite(kg) || !String(body.kg ?? '').trim()) throw new ActionError('Zadaj váhu psa v kg.');
  const ctx = await planContext(deps, customer, subId);
  const r = await previewOf(deps, ctx, { kg });
  if (body.preview !== false) return { ok: true, message: 'Náhľad', preview: r.preview };
  await applyPlan(deps, customer, ctx, r.shared, 'ucet.weight');
  return { ok: true, message: `Uložené. Nová dávka ${r.shared.quote.gramsPerDay} g denne, ďalšie vrece pošleme ${dateSkShort(r.shared.nextCharge)}.` };
}

export async function changeRecipeOrBag(deps: ActionDeps, customer: Customer, subId: string, body: { productId?: unknown; bagId?: unknown; preview?: unknown }): Promise<ActionResult> {
  const productId = typeof body.productId === 'string' && body.productId ? body.productId : undefined;
  const bagId = typeof body.bagId === 'string' && body.bagId ? body.bagId : undefined;
  const ctx = await planContext(deps, customer, subId);
  const r = await previewOf(deps, ctx, { productId, bagId });
  if (body.preview !== false) return { ok: true, message: 'Náhľad', preview: r.preview };
  await applyPlan(deps, customer, ctx, r.shared, 'ucet.plan');
  return { ok: true, message: `Uložené. Od ďalšieho vreca ${productName(r.shared.quote.productId)}, ${r.shared.quote.bagId} kg. Pošleme ho ${dateSkShort(r.shared.nextCharge)}.` };
}

/* ---------------------------------------------------------------- doručenie */

type DeliveryBody = { method?: DeliveryMethod; firstName?: string; lastName?: string; name?: string; phone?: string; point?: { id: string } | null; address?: { street: string; zip: string; city: string } | null };

export async function changeDelivery(deps: ActionDeps, customer: Customer, subId: string, delivery: unknown): Promise<ActionResult> {
  const ctx = await planContext(deps, customer, subId);
  const { sub } = ctx;
  const d = (delivery ?? {}) as DeliveryBody;
  const name = (d.name || `${d.firstName ?? ''} ${d.lastName ?? ''}`).trim();
  let s: ShipTo, point: DeliveryPoint | null;
  try {
    // rovnaké overenie ako checkout; e-mail sa nemení (je to prihlasovací e-mail účtu)
    ({ shipTo: s, point } = await deps.resolveDelivery({ method: d.method as DeliveryMethod, name, email: customer.email, phone: d.phone ?? '', point: d.point ?? null, address: d.address ?? null }, sub.bag_id as BagId));
  } catch (e) {
    if (e instanceof CheckoutError) throw new ActionError(e.message);
    throw e;
  }
  const pickup = s.delivery_method !== 'sps_courier';
  const newAddress = await deps.store.insertAddress({
    customer_id: customer.id,
    name: s.name,
    street: pickup ? point!.street : s.street!,
    city: pickup ? point!.city : s.city!,
    zip: pickup ? point!.zip : s.zip!,
    country: 'SK',
    carrier: s.delivery_method === 'packeta_point' ? 'packeta' : s.delivery_method === 'dpd_pickup' ? 'dpd' : 'sps',
    delivery_method: s.delivery_method,
    point_id: s.point_id ?? null,
    point_label: s.point_label ?? null,
  });
  await deps.store.updateSubscription(sub.id, { address_id: newAddress.id });
  await deps.store.updateCustomer(customer.id, { name: s.name, phone: s.phone });

  // cena dopravy sa môže zmeniť (výdajné miesto zadarmo vs. kuriér): iba riadok dopravy, dátum ďalšej platby ostáva
  const notes: string[] = [];
  try {
    await deps.plan.syncShipping(sub, s.delivery_method as DeliveryMethod);
  } catch (e) {
    console.error('[ucet] syncShipping', e);
    notes.push('Cenu dopravy sa nepodarilo upraviť, napíš nám prosím na podpora@granula.sk.');
  }

  // otvorená objednávka: vo FHB iba v stave pending (updateOrderDelivery), inak „už sa balí“
  const open = (await deps.store.ordersOfSubscription(sub.id)).filter((o) => OPEN.includes(o.status));
  for (const o of open) {
    const shipTo: ShipTo = { ...s, email: (o.ship_to as ShipTo)?.email ?? s.email };
    try {
      const r = await deps.updateOrderDelivery(o.id, shipTo);
      if (r.mode === 'fhb') notes.push(`Zmenili sme aj objednávku č. ${o.number}, ktorá ešte čaká v sklade.`);
    } catch (e) {
      if (!(e instanceof OrderActionError)) console.error('[ucet] úprava objednávky', o.number, e);
      notes.push(
        e instanceof OrderActionError && /neodpovedá/.test(e.message)
          ? `Objednávku č. ${o.number} sa teraz v sklade nepodarilo zmeniť, príde ešte na pôvodné miesto. Ak ti to nevyhovuje, napíš nám na podpora@granula.sk.`
          : `Objednávka č. ${o.number} sa už balí, príde ešte na pôvodné miesto. Nové doručenie platí od ďalšieho vreca.`,
      );
    }
  }
  await audit(deps, customer, 'ucet.delivery', sub, { address_id: newAddress.id, delivery_method: s.delivery_method, point_id: s.point_id ?? null }, { address_id: sub.address_id });
  return { ok: true, message: ['Doručenie sme zmenili.', ...notes].join(' ') };
}

/* ---------------------------------------------------------------- zrušenie */

export async function cancelSubscription(deps: ActionDeps, customer: Customer, subId: string, reason: unknown): Promise<ActionResult> {
  const sub = await own(deps, customer, subId);
  requireStatus(sub, ['active', 'paused', 'past_due']);
  if (sub.cancel_at) return { ok: true, message: 'Predplatné už je zrušené ku koncu obdobia.' };
  const why = typeof reason === 'string' ? reason.trim().slice(0, 500) : '';
  if (!why) throw new ActionError('Napíš prosím krátko, prečo predplatné rušíš.');
  const now = deps.now?.() ?? new Date();
  await deps.stripe.cancelAtPeriodEnd(sub.stripe_subscription_id, true);
  const end = sub.next_charge_at ? new Date(sub.next_charge_at) : now;
  await deps.store.updateSubscription(sub.id, { cancel_at: end.toISOString(), cancel_requested_at: now.toISOString(), cancel_reason: why });
  await audit(deps, customer, 'ucet.cancel', sub, { cancel_at: end.toISOString(), cancel_reason: why });
  await send(deps, sub, 'subscription_cancelled', (dog) =>
    subscriptionCancelledEmail({
      to: customer.email, name: customer.name, dog, siteUrl: deps.siteUrl, sub, mode: 'period_end',
      key: `subscription-cancelled:${sub.id}:${now.getTime()}`,
      outro: `Ak si to rozmyslíš, do ${dateSkShort(end)} predplatné v účte obnovíš jedným klikom. Zrušenie predplatného nie je odstúpenie od zmluvy.`,
    }),
  );
  return { ok: true, message: 'Predplatné sme zrušili. Ďalšie platby ani dodávky už nebudú.' };
}

export async function revokeCancel(deps: ActionDeps, customer: Customer, subId: string): Promise<ActionResult> {
  const sub = await own(deps, customer, subId);
  if (!sub.cancel_at || sub.status === 'cancelled') throw new ActionError('Predplatné nie je zrušené ku koncu obdobia.', 409);
  await deps.stripe.cancelAtPeriodEnd(sub.stripe_subscription_id, false);
  await deps.store.updateSubscription(sub.id, { cancel_at: null, cancel_requested_at: null, cancel_reason: null });
  await audit(deps, customer, 'ucet.cancel_revoke', sub, { cancel_at: null }, { cancel_at: sub.cancel_at, cancel_reason: sub.cancel_reason });
  await pauseMail(deps, customer, sub, 'cancel_revoked', sub.next_charge_at ? new Date(sub.next_charge_at) : null);
  return { ok: true, message: 'Zrušenie sme odvolali, predplatné pokračuje.' };
}
