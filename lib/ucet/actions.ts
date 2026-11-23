import type { Json, Tables, TablesInsert, TablesUpdate } from '../database.types';
import { boxesAllowed, shippingPrice, type DeliveryMethod } from '../carriers';
import { CheckoutError, productIdFor, SHIPPING_PRODUCT_ID, type PreparedCheckout } from '../checkout';
import type { Mailer } from '../email';
import { subscriptionChangeEmail, type SubscriptionChangeKind } from '../emails';
import { serverParams, skuItems, type BagId } from '../engine-server';
import { buildFhbOrder, fhbOrderId, type BuildOrderOptions, type ShipTo } from '../fhb/build-order';
import type { FhbOrder, FhbOrderUpdate } from '../fhb/client';
import { addDays, chargeTime, estimatedDelivery, nextChargeAfterChange, type CycleParams, type PlanChange } from '../subscription-schedule';
import { computePlan, PlanError, productName, type PlanResult } from './plan';

/*
 * Akcie zákazníka v /ucet (SPEC P4). Volajú ich /api/ucet/predplatne/<id>/<akcia>. Vlastníctvo sa kontroluje tu
 * (sub.customer_id = prihlásený zákazník), zápisy service rolou. Stripe iba cez lib/subscription-schedule.
 *
 *   posunut   ďalšia platba a odoslanie v zvolený deň (zajtra … +120 dní)
 *   preskocit ďalšia platba o D dní neskôr
 *   pauza / obnovit
 *   vaha      { kg, preview } → prepočet dávky, D, ceny (náhľad pred potvrdením)
 *   plan      { productId, bagId, preview } → iba vhodné receptúry podľa engine
 *   dorucenie { delivery } → rovnaké overenie ako checkout; otvorená objednávka vo FHB iba v stave pending
 *   zrusit    { reason } → ku koncu obdobia (Stripe cancel_at_period_end); zrusit-spat → odvolať
 * Zmena D/ceny: next_charge = posledné doručenie + D_nové − LEAD (SPEC §1), jeden changePlan s trial_end.
 */

type Sub = Tables<'subscriptions'>;
type Order = Tables<'orders'>;
type Customer = Tables<'customers'>;

export class ActionError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

export type ActionDeps = {
  store: {
    getSubscription(id: string): Promise<Sub | null>;
    getDog(id: string): Promise<Tables<'dogs'> | null>;
    getAddress(id: string): Promise<Tables<'addresses'> | null>;
    ordersOfSubscription(id: string): Promise<Order[]>;
    updateSubscription(id: string, patch: TablesUpdate<'subscriptions'>): Promise<void>;
    updateDog(id: string, patch: TablesUpdate<'dogs'>): Promise<void>;
    updateCustomer(id: string, patch: TablesUpdate<'customers'>): Promise<void>;
    insertAddress(row: TablesInsert<'addresses'>): Promise<Tables<'addresses'>>;
    updateOrder(id: string, patch: TablesUpdate<'orders'>): Promise<void>;
    audit(row: TablesInsert<'audit_log'>): Promise<void>;
  };
  stripe: {
    move(stripeSubId: string, at: Date): Promise<unknown>;
    pause(stripeSubId: string): Promise<unknown>;
    resume(stripeSubId: string, at: Date): Promise<unknown>;
    changePlan(stripeSubId: string, c: PlanChange): Promise<unknown>;
    cancelAtPeriodEnd(stripeSubId: string, on: boolean): Promise<unknown>;
    ensureProduct(id: string, name: string): Promise<unknown>;
  };
  fhb: { getOrder(id: string): Promise<FhbOrder | null>; updateOrder(id: string, body: FhbOrderUpdate): Promise<unknown> } | null;
  fhbOptions: BuildOrderOptions | null;
  /** rovnaké overenie doručenia ako checkout (prepareCheckout): miesto vo FHB, boxy, telefón */
  prepareDelivery(input: { answers: unknown; bag: string; delivery: unknown }): Promise<Pick<PreparedCheckout, 'shipTo' | 'point' | 'shippingCents' | 'customer'>>;
  /** je výdajné miesto box? (pri zmene na balenie bez boxov) */
  isBox(method: DeliveryMethod, pointId: string): Promise<boolean>;
  cycle: CycleParams;
  mail?: Mailer;
  siteUrl: string;
  now?: () => Date;
};

export type ActionResult = { ok: true; message: string; preview?: unknown };

const QUEUED = new Set(['pending', 'new', 'imported', 'b2b_new']);
const MAX_MOVE_DAYS = 120;

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

async function audit(deps: ActionDeps, customer: Customer, action: string, sub: Sub, after: unknown, before?: unknown) {
  await deps.store
    .audit({ actor: 'customer', action, entity: 'subscription', entity_id: sub.id, before: (before ?? null) as Json, after: { ...(after as object), customer_id: customer.id } as Json })
    .catch((e) => console.error('[ucet] audit zlyhal', action, e));
}

async function mail(deps: ActionDeps, customer: Customer, sub: Sub, kind: SubscriptionChangeKind, date: Date | null) {
  if (!deps.mail) return;
  const dog = await deps.store.getDog(sub.dog_id).catch(() => null);
  const now = deps.now?.() ?? new Date();
  await deps
    .mail(subscriptionChangeEmail({ kind, key: `sub-${kind}:${sub.id}:${now.getTime()}`, to: customer.email, name: customer.name, dog: dog ? { name: dog.name, sex: (dog.answers as { sex?: string })?.sex ?? null } : null, siteUrl: deps.siteUrl, date }))
    .catch((e) => console.error('[ucet] email zlyhal', kind, e));
}

/** deň posledného (alebo odhadovaného) doručenia: od neho sa počíta ďalšia platba po zmene D (SPEC §1) */
async function lastDelivery(deps: ActionDeps, sub: Sub): Promise<Date> {
  if (sub.last_delivered_at) return new Date(sub.last_delivered_at);
  const orders = await deps.store.ordersOfSubscription(sub.id);
  const last = orders.filter((o) => o.status !== 'cancelled').sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  return estimatedDelivery(last ? new Date(last.created_at) : new Date(sub.created_at), deps.cycle);
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
  const at = addDays(new Date(sub.next_charge_at), sub.days_per_bag);
  const charge = chargeTime(at);
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
  await mail(deps, customer, sub, 'paused', null);
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
  await mail(deps, customer, sub, 'resumed', at);
  return { ok: true, message: `Predplatné opäť beží. Ďalšie vrece pošleme ${dateSkShort(at)}.` };
}

/* ---------------------------------------------------------------- váha, receptúra, balenie */

export type PlanPreview = {
  before: { productId: string; productName: string; bagId: string; gramsPerDay: number; daysPerBag: number; unitAmountCents: number; shippingCents: number; nextChargeAt: string | null };
  after: { productId: string; productName: string; bagId: string; gramsPerDay: number; daysPerBag: number; unitAmountCents: number; shippingCents: number; totalCents: number; nextChargeAt: string; kg: number };
  productSwitched: boolean;
  products: PlanResult['products'];
};

async function planContext(deps: ActionDeps, customer: Customer, subId: string) {
  const sub = await own(deps, customer, subId);
  requireStatus(sub, ['active', 'paused']);
  requireNotCancelling(sub);
  const [dog, address] = await Promise.all([deps.store.getDog(sub.dog_id), deps.store.getAddress(sub.address_id)]);
  if (!dog || !address) throw new ActionError('Chýbajú údaje o psovi alebo doručení. Napíš nám na podpora@granula.sk.', 409);
  return { sub, dog, address };
}

async function previewOf(deps: ActionDeps, ctx: Awaited<ReturnType<typeof planContext>>, change: { kg?: number; productId?: string; bagId?: string }): Promise<{ plan: PlanResult; preview: PlanPreview; next: Date }> {
  const { sub, dog, address } = ctx;
  const now = deps.now?.() ?? new Date();
  let plan: PlanResult;
  try {
    plan = computePlan({ answers: dog.answers, birthDate: dog.birth_date, now, current: { productId: sub.product_id, bagId: sub.bag_id }, method: address.delivery_method as DeliveryMethod, ...change });
  } catch (e) {
    if (e instanceof PlanError) throw new ActionError(e.message);
    throw e;
  }
  if (plan.bagId !== sub.bag_id && address.point_id && !boxesAllowed(address.delivery_method as DeliveryMethod, plan.bagId) && (await deps.isBox(address.delivery_method as DeliveryMethod, address.point_id)))
    throw new ActionError(`Pri balení ${plan.bagId} kg sa nedá doručiť do boxu. Najprv zmeň výdajné miesto na odberné miesto.`);
  const next = nextChargeAfterChange({ lastDeliveredAt: await lastDelivery(deps, sub), days: plan.daysPerBag, now, ...deps.cycle });
  const cur = currentShippingCents(address.delivery_method as DeliveryMethod, sub.bag_id);
  return {
    plan,
    next,
    preview: {
      before: { productId: sub.product_id, productName: productName(sub.product_id), bagId: sub.bag_id, gramsPerDay: sub.grams_per_day, daysPerBag: sub.days_per_bag, unitAmountCents: sub.unit_amount_cents, shippingCents: cur, nextChargeAt: sub.next_charge_at },
      after: { productId: plan.productId, productName: plan.productName, bagId: plan.bagId, gramsPerDay: plan.gramsPerDay, daysPerBag: plan.daysPerBag, unitAmountCents: plan.unitAmountCents, shippingCents: plan.shippingCents, totalCents: plan.totalCents, nextChargeAt: next.toISOString(), kg: plan.answers.kg },
      productSwitched: plan.productSwitched,
      products: plan.products,
    },
  };
}

/** súčasná cena dopravy (spôsob doručenia × súčasné balenie, plán predplatné) */
export function currentShippingCents(method: DeliveryMethod, bagId: string): number {
  return Math.round(shippingPrice(method, bagId as BagId, serverParams().shipping, 'mesiac') * 100);
}

async function applyPlan(deps: ActionDeps, customer: Customer, ctx: Awaited<ReturnType<typeof planContext>>, r: { plan: PlanResult; next: Date }, action: string) {
  const { sub, dog } = ctx;
  const { plan, next } = r;
  const sku = skuItems(plan.productId, plan.bagId as BagId)[0].sku;
  const stripeProduct = productIdFor(sku);
  await deps.stripe.ensureProduct(stripeProduct, `Granula! ${plan.productName} ${plan.bagId} kg`);
  await deps.stripe.changePlan(sub.stripe_subscription_id!, {
    productId: stripeProduct,
    unitAmountCents: plan.unitAmountCents,
    days: plan.daysPerBag,
    shippingCents: plan.shippingCents,
    shippingProductId: SHIPPING_PRODUCT_ID,
    nextCharge: next,
  });
  const now = deps.now?.() ?? new Date();
  const patch: TablesUpdate<'subscriptions'> = {
    product_id: plan.productId,
    bag_id: plan.bagId,
    grams_per_day: plan.gramsPerDay,
    days_per_bag: plan.daysPerBag,
    unit_amount_cents: plan.unitAmountCents,
    next_charge_at: next.toISOString(),
    engine_snapshot: { answers: plan.answers, product_id: plan.productId, bag_id: plan.bagId, grams: plan.gramsPerDay, days: plan.daysPerBag, shipping_cents: plan.shippingCents, at: now.toISOString(), source: action } as unknown as Json,
  };
  await deps.store.updateSubscription(sub.id, patch);
  // odpovede psa: nová váha (a vlastná voľba receptúry), vek ostáva z dátumu narodenia
  const answers = { ...(dog.answers as object), kg: plan.answers.kg, recipe: plan.productId === plan.recommendedId ? '' : plan.productId, recipeFor: plan.productId === plan.recommendedId ? '' : plan.recommendedId };
  await deps.store.updateDog(dog.id, { weight_kg: plan.answers.kg, answers: answers as unknown as Json });
  await audit(deps, customer, action, sub, patch, { product_id: sub.product_id, bag_id: sub.bag_id, grams_per_day: sub.grams_per_day, days_per_bag: sub.days_per_bag, unit_amount_cents: sub.unit_amount_cents, next_charge_at: sub.next_charge_at, kg: dog.weight_kg });
}

export async function changeWeight(deps: ActionDeps, customer: Customer, subId: string, body: { kg?: unknown; preview?: unknown }): Promise<ActionResult> {
  const kg = Number(String(body.kg ?? '').replace(',', '.'));
  if (!Number.isFinite(kg)) throw new ActionError('Zadaj váhu psa v kg.');
  const ctx = await planContext(deps, customer, subId);
  const r = await previewOf(deps, ctx, { kg });
  if (body.preview !== false) return { ok: true, message: 'Náhľad', preview: r.preview };
  await applyPlan(deps, customer, ctx, r, 'ucet.weight');
  return { ok: true, message: `Uložené. Nová dávka ${r.plan.gramsPerDay} g denne, ďalšie vrece pošleme ${dateSkShort(r.next)}.` };
}

export async function changeRecipeOrBag(deps: ActionDeps, customer: Customer, subId: string, body: { productId?: unknown; bagId?: unknown; preview?: unknown }): Promise<ActionResult> {
  const productId = typeof body.productId === 'string' && body.productId ? body.productId : undefined;
  const bagId = typeof body.bagId === 'string' && body.bagId ? body.bagId : undefined;
  const ctx = await planContext(deps, customer, subId);
  const r = await previewOf(deps, ctx, { productId: productId ?? ctx.sub.product_id, bagId });
  if (body.preview !== false) return { ok: true, message: 'Náhľad', preview: r.preview };
  await applyPlan(deps, customer, ctx, r, 'ucet.plan');
  return { ok: true, message: `Uložené. Od ďalšieho vreca ${r.plan.productName}, ${r.plan.bagId} kg. Pošleme ho ${dateSkShort(r.next)}.` };
}

/* ---------------------------------------------------------------- doručenie */

export async function changeDelivery(deps: ActionDeps, customer: Customer, subId: string, delivery: unknown): Promise<ActionResult> {
  const ctx = await planContext(deps, customer, subId);
  const { sub, dog, address } = ctx;
  let p;
  try {
    // rovnaké overenie ako checkout; e-mail sa nemení (je to prihlasovací e-mail účtu)
    p = await deps.prepareDelivery({ answers: dog.answers, bag: sub.bag_id, delivery: { ...(delivery as object), email: customer.email } });
  } catch (e) {
    if (e instanceof CheckoutError) throw new ActionError(e.message);
    throw e;
  }
  const s = p.shipTo;
  const pickup = s.delivery_method !== 'sps_courier';
  const newAddress = await deps.store.insertAddress({
    customer_id: customer.id,
    name: s.name,
    street: pickup ? p.point!.street : s.street!,
    city: pickup ? p.point!.city : s.city!,
    zip: pickup ? p.point!.zip : s.zip!,
    country: 'SK',
    carrier: s.delivery_method === 'packeta_point' ? 'packeta' : s.delivery_method === 'dpd_pickup' ? 'dpd' : 'sps',
    delivery_method: s.delivery_method,
    point_id: s.point_id ?? null,
    point_label: s.point_label ?? null,
  });
  await deps.store.updateSubscription(sub.id, { address_id: newAddress.id });
  await deps.store.updateCustomer(customer.id, { name: s.name, phone: s.phone });

  // cena dopravy sa môže zmeniť (výdajné miesto zadarmo vs. kuriér): nové položky, dátum ďalšej platby ostáva
  const oldMethod = address.delivery_method as DeliveryMethod;
  const plan = computePlan({ answers: dog.answers, birthDate: dog.birth_date, now: deps.now?.() ?? new Date(), current: { productId: sub.product_id, bagId: sub.bag_id }, method: s.delivery_method as DeliveryMethod, productId: sub.product_id });
  const oldPlan = oldMethod === s.delivery_method ? null : computePlan({ answers: dog.answers, birthDate: dog.birth_date, now: deps.now?.() ?? new Date(), current: { productId: sub.product_id, bagId: sub.bag_id }, method: oldMethod, productId: sub.product_id });
  if (oldPlan && oldPlan.shippingCents !== plan.shippingCents && sub.next_charge_at) {
    const sku = skuItems(sub.product_id, sub.bag_id as BagId)[0].sku;
    await deps.stripe.changePlan(sub.stripe_subscription_id!, {
      productId: productIdFor(sku),
      unitAmountCents: sub.unit_amount_cents,
      days: sub.days_per_bag,
      shippingCents: plan.shippingCents,
      shippingProductId: SHIPPING_PRODUCT_ID,
      nextCharge: new Date(sub.next_charge_at),
    });
  }

  // otvorená objednávka: vo FHB iba v stave pending, inak „už sa balí“
  const notes: string[] = [];
  const open = (await deps.store.ordersOfSubscription(sub.id)).filter((o) => ['paid', 'fhb_error', 'sent_to_fhb', 'confirmed'].includes(o.status));
  for (const o of open) {
    const shipTo: ShipTo = { ...s, email: (o.ship_to as ShipTo)?.email ?? s.email };
    if (o.status === 'paid' || o.status === 'fhb_error') {
      await deps.store.updateOrder(o.id, { ship_to: shipTo as unknown as Json });
      continue;
    }
    const f = deps.fhb ? await deps.fhb.getOrder(fhbOrderId(o.number)).catch(() => null) : null;
    if (f && QUEUED.has(String(f.status ?? '').toLowerCase()) && deps.fhb && deps.fhbOptions) {
      try {
        const body = buildFhbOrder({ id: o.id, number: o.number, items: o.items as { sku: string; qty: number }[], amountCents: o.amount_cents, shipTo }, deps.fhbOptions);
        const { id: _id, ...update } = body as typeof body & { id?: string };
        await deps.fhb.updateOrder(fhbOrderId(o.number), update as FhbOrderUpdate);
        await deps.store.updateOrder(o.id, { ship_to: shipTo as unknown as Json });
        notes.push(`Zmenili sme aj objednávku č. ${o.number}, ktorá ešte čaká v sklade.`);
        continue;
      } catch (e) {
        console.error('[ucet] FHB úprava zlyhala', o.number, e);
        notes.push(`Objednávku č. ${o.number} sa v sklade nepodarilo zmeniť, príde ešte na pôvodné miesto. Ak ti to nevyhovuje, napíš nám na podpora@granula.sk.`);
        continue;
      }
    }
    notes.push(`Objednávka č. ${o.number} sa už balí, príde ešte na pôvodné miesto. Nové doručenie platí od ďalšieho vreca.`);
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
  await mail(deps, customer, sub, 'cancel_requested', end);
  return { ok: true, message: 'Predplatné sme zrušili. Ďalšie platby ani dodávky už nebudú.' };
}

export async function revokeCancel(deps: ActionDeps, customer: Customer, subId: string): Promise<ActionResult> {
  const sub = await own(deps, customer, subId);
  if (!sub.cancel_at || sub.status === 'cancelled') throw new ActionError('Predplatné nie je zrušené ku koncu obdobia.', 409);
  await deps.stripe.cancelAtPeriodEnd(sub.stripe_subscription_id, false);
  await deps.store.updateSubscription(sub.id, { cancel_at: null, cancel_requested_at: null, cancel_reason: null });
  await audit(deps, customer, 'ucet.cancel_revoke', sub, { cancel_at: null }, { cancel_at: sub.cancel_at, cancel_reason: sub.cancel_reason });
  await mail(deps, customer, sub, 'cancel_revoked', sub.next_charge_at ? new Date(sub.next_charge_at) : null);
  return { ok: true, message: 'Zrušenie sme odvolali, predplatné pokračuje.' };
}
