import type Stripe from 'stripe';
import { answersAt } from './checkout';
import type { Json, Tables, TablesInsert, TablesUpdate } from './database.types';
import { quote } from './engine-server';
import type { ShipTo } from './fhb/build-order';
import { skuItems, type BagId } from './engine-server';
import { idOf } from './stripe';
import type { Mail, Mailer } from './email';
import { orderConfirmationEmail, paymentFailedEmail } from './emails';
import { notifyFhbError } from './notify';
import { addDays, changePlan, chargeTime, estimatedDelivery, firstRenewal, type CycleParams } from './subscription-schedule';
import { productIdFor, SHIPPING_PRODUCT_ID } from './checkout';

/*
 * Spracovanie overených Stripe webhookov (SPEC P1). Objednávka vzniká IBA tu (SPEC §0).
 * Idempotencia: orders.stripe_ref a subscriptions.stripe_subscription_id sú unikátne, druhé spracovanie toho
 * istého eventu nič nezduplikuje; webhook navyše eventy eviduje v stripe_events.
 *
 *   checkout.session.completed            → predplatné (DB) + trial_end na prvé obnovenie + objednávka first/one_off → FHB
 *   invoice.paid (subscription_cycle)     → prepočet D (šteňatá) → objednávka renewal → FHB
 *   invoice.payment_failed                → predplatné past_due
 *   customer.subscription.updated/deleted → stav predplatného a dátum ďalšej platby
 */

export type Customer = Tables<'customers'>;
export type Dog = Tables<'dogs'>;
export type Address = Tables<'addresses'>;
export type Subscription = Tables<'subscriptions'>;
export type Order = Tables<'orders'>;

export type Store = {
  getCustomer(id: string): Promise<Customer | null>;
  getDog(id: string): Promise<Dog | null>;
  getAddress(id: string): Promise<Address | null>;
  findSubscriptionByStripeId(stripeSubId: string): Promise<Subscription | null>;
  /** vloží alebo vráti existujúce (podľa stripe_subscription_id) */
  insertSubscription(row: TablesInsert<'subscriptions'>): Promise<Subscription>;
  updateSubscription(id: string, patch: TablesUpdate<'subscriptions'>): Promise<void>;
  /** vloží alebo vráti existujúcu (podľa stripe_ref) */
  insertOrder(row: TablesInsert<'orders'>): Promise<{ order: Order; created: boolean }>;
  /** stopa v audit_log (rovnaký action + entity_id sa zapíše iba raz) */
  audit(row: TablesInsert<'audit_log'>): Promise<void>;
};

/** P7: analytika a dotazník (lib/tracking.ts). Volá sa iba pri prvom spracovaní, chyba nikdy neprerušuje webhook. */
export type FulfillmentEvents = {
  orderCreated?(ctx: { order: Order; customer: Customer; session: Stripe.Checkout.Session; metadata: Stripe.Metadata }): Promise<void>;
  renewed?(ctx: { order: Order; customer: Customer; subscription: Subscription; invoice: Stripe.Invoice }): Promise<void>;
  renewalFailed?(ctx: { subscription: Subscription; invoice: Stripe.Invoice }): Promise<void>;
  cancelled?(ctx: { subscription: Subscription; stripeSubscription: Stripe.Subscription; atPeriodEnd: boolean }): Promise<void>;
};

export type Deps = {
  store: Store;
  events?: FulfillmentEvents;
  stripe: Stripe;
  /** odoslanie do FHB (lib/fhb/send.ts); chyba neprerušuje webhook, objednávka ostane paid/fhb_error */
  sendToFhb?: (orderId: string) => Promise<unknown>;
  cycle: CycleParams;
  now?: () => Date;
  /** transakčné emaily (lib/email.ts); bez neho sa neposielajú */
  mail?: Mailer;
  siteUrl?: string;
  /** interné upozornenia (ADMIN_EMAIL) */
  adminTo?: string | null;
};

const nowOf = (d: Deps) => (d.now ? d.now() : new Date());

async function emit(deps: Deps, name: keyof FulfillmentEvents, fn: (e: FulfillmentEvents) => Promise<void> | undefined) {
  if (!deps.events?.[name]) return;
  try {
    await fn(deps.events);
  } catch (e) {
    console.error(`[fulfillment] events.${name} zlyhalo`, e);
  }
}

/** ship_to snapshot z adresy a zákazníka: street/city/zip = adresa zákazníka (aj pri výdajnom mieste), point_* = miesto */
export function shipToOf(c: Customer, a: Address): ShipTo {
  const pickup = a.delivery_method !== 'sps_courier';
  return {
    name: a.name,
    email: c.email,
    phone: c.phone ?? '',
    country: a.country,
    delivery_method: a.delivery_method as ShipTo['delivery_method'],
    street: a.street,
    city: a.city,
    zip: a.zip,
    ...(pickup
      ? { point_id: a.point_id, point_label: a.point_label, point_address: a.point_street && a.point_city && a.point_zip ? { street: a.point_street, city: a.point_city, zip: a.point_zip } : null }
      : {}),
  };
}

async function sendSafely(deps: Deps, order: Order) {
  if (!deps.sendToFhb || !['paid', 'fhb_error'].includes(order.status)) return;
  try {
    const r = (await deps.sendToFhb(order.id)) as { state?: string; error?: unknown } | undefined;
    if (r?.state === 'fhb_error') await notifyFhbError(deps, order, r.error);
  } catch (e) {
    // sieť / 5xx: objednávka ostáva paid, odoslanie zopakuje cron (krok 5) alebo admin
    console.error('[fulfillment] FHB odoslanie zlyhalo', order.id, e);
  }
}

const unixDate = (s: number | null | undefined) => (s ? new Date(s * 1000) : null);

/** Email zákazníkovi: chyba emailu NIKDY neprerušuje webhook (objednávka je hotová), ostane stopa v audit_log. */
async function mailSafely(deps: Deps, mail: Mail, entity: { type: string; id: string }) {
  if (!deps.mail) return;
  try {
    await deps.mail(mail);
  } catch (e) {
    console.error('[fulfillment] email zlyhal', mail.key, e);
    await deps.store.audit({ actor: 'system', action: 'email.failed', entity: entity.type, entity_id: mail.key, after: { [entity.type]: entity.id, kind: mail.kind, error: String((e as Error).message ?? e).slice(0, 500) } as Json }).catch(() => {});
  }
}

const dogOf = (dog: Dog | null) => (dog ? { name: dog.name, sex: (dog.answers as { sex?: string } | null)?.sex ?? null } : null);

async function sendConfirmation(
  deps: Deps,
  order: Order,
  customer: Customer,
  dog: Dog | null,
  sub: { days: number; nextChargeAt: Date | null } | null,
  prices: { foodCents: number; shippingCents: number } | null,
) {
  if (!deps.mail || !deps.siteUrl) return;
  await mailSafely(deps, orderConfirmationEmail({ order, to: customer.email, name: customer.name, dog: dogOf(dog), siteUrl: deps.siteUrl, subscription: sub, prices }), { type: 'order', id: order.id });
}

export async function handleCheckoutCompleted(session: Stripe.Checkout.Session, deps: Deps): Promise<Order | null> {
  if (session.payment_status === 'unpaid') return null; // napr. oneskorená platba; príde async_payment_succeeded
  const md = session.metadata ?? {};
  const [customer, dog, address] = await Promise.all([deps.store.getCustomer(md.customer_id), deps.store.getDog(md.dog_id), deps.store.getAddress(md.address_id)]);
  if (!customer || !dog || !address) throw new Error(`checkout ${session.id}: chýba draft (customer/dog/address)`);
  const bag = md.bag_id as BagId;
  const days = Number(md.days);
  const now = nowOf(deps);

  let subscriptionId: string | null = null;
  let subInfo: { days: number; nextChargeAt: Date } | null = null;
  if (session.mode === 'subscription') {
    const stripeSubId = idOf(session.subscription);
    if (!stripeSubId) throw new Error(`checkout ${session.id}: chýba subscription`);
    // prvé obnovenie = odhad doručenia + D − LEAD (prepočíta sa podľa delivered_at z FHB, krok 5)
    const next = firstRenewal({ deliveredAt: estimatedDelivery(now, deps.cycle), days, ...deps.cycle, now });
    const sub = await deps.store.insertSubscription({
      customer_id: customer.id,
      dog_id: dog.id,
      address_id: address.id,
      stripe_subscription_id: stripeSubId,
      status: 'active',
      product_id: md.product_id,
      bag_id: bag,
      grams_per_day: Number(md.grams),
      days_per_bag: days,
      unit_amount_cents: Number(md.unit_cents),
      plan: 'mesiac',
      next_charge_at: next.toISOString(),
      engine_snapshot: { answers: dog.answers, product_id: md.product_id, bag_id: bag, grams: Number(md.grams), days, at: now.toISOString() } as Json,
    });
    subscriptionId = sub.id;
    subInfo = { days, nextChargeAt: next };
    await deps.stripe.subscriptions.update(stripeSubId, { trial_end: Math.floor(next.getTime() / 1000), proration_behavior: 'none' });
  }

  const { order, created } = await deps.store.insertOrder({
    customer_id: customer.id,
    subscription_id: subscriptionId,
    kind: session.mode === 'subscription' ? 'first' : 'one_off',
    stripe_ref: session.id,
    amount_cents: session.amount_total ?? 0,
    items: skuItems(md.product_id, bag) as unknown as Json,
    ship_to: shipToOf(customer, address) as unknown as Json,
    status: 'paid',
  });
  await sendSafely(deps, order);
  const shipCents = Number(md.ship_cents);
  const prices = Number.isFinite(shipCents) && md.ship_cents ? { shippingCents: shipCents, foodCents: (session.amount_total ?? 0) - shipCents } : null;
  await sendConfirmation(deps, order, customer, dog, subInfo, prices);
  if (created) await emit(deps, 'orderCreated', (e) => e.orderCreated?.({ order, customer, session, metadata: md }));
  return order;
}

export async function handleInvoicePaid(invoice: Stripe.Invoice, deps: Deps): Promise<Order | null> {
  if (invoice.billing_reason !== 'subscription_cycle') return null; // prvá platba sa spracuje z checkout.session.completed
  const stripeSubId = idOf(invoice.parent?.subscription_details?.subscription);
  if (!stripeSubId || !invoice.id) return null;
  const sub = await deps.store.findSubscriptionByStripeId(stripeSubId);
  if (!sub) {
    // Zaplatené obnovenie Granuly bez predplatného v DB nesmie zmiznúť bez stopy: varovanie do konzoly + audit_log.
    // Bez draftu z checkoutu (napr. predplatné vytvorené mimo checkoutu) sa v DB nikdy neobjaví → 200 so stopou.
    // S draftom ešte nebol spracovaný checkout.session.completed → stopa + 500, Stripe zopakuje.
    const md = invoice.parent?.subscription_details?.metadata ?? {};
    const fromCheckout = !!md.customer_id;
    const action = fromCheckout ? 'stripe.invoice_paid.subscription_pending' : 'stripe.invoice_paid.subscription_missing';
    console.warn(`[webhook] ${action}: invoice ${invoice.id}, predplatné ${stripeSubId}, ${invoice.amount_paid / 100} €`);
    await deps.store.audit({
      actor: 'system',
      action,
      entity: 'stripe_invoice',
      entity_id: invoice.id,
      after: { invoice: invoice.id, subscription: stripeSubId, amount_paid: invoice.amount_paid, customer: idOf(invoice.customer), metadata: md } as Json,
    });
    if (fromCheckout) throw new Error(`invoice ${invoice.id}: predplatné ${stripeSubId} nie je v DB`);
    return null;
  }
  const [customer, dog, address] = await Promise.all([deps.store.getCustomer(sub.customer_id), deps.store.getDog(sub.dog_id), deps.store.getAddress(sub.address_id)]);
  if (!customer || !dog || !address) throw new Error(`invoice ${invoice.id}: chýba zákazník, pes alebo adresa`);
  const now = nowOf(deps);

  // prepočet D podľa aktuálneho veku (šteňatá), vždy s predvolenými PARAMS
  const answers = dog.birth_date ? answersAt(dog.answers as never, dog.birth_date, now) : dog.answers;
  const q = quote({ answers, plan: 'mesiac', bagId: sub.bag_id });
  const changed = q.daysPerBag !== sub.days_per_bag || q.unitAmountCents !== sub.unit_amount_cents || q.productId !== sub.product_id;

  const { order, created } = await deps.store.insertOrder({
    customer_id: customer.id,
    subscription_id: sub.id,
    kind: 'renewal',
    stripe_ref: invoice.id,
    amount_cents: invoice.amount_paid,
    items: skuItems(sub.product_id, sub.bag_id as BagId) as unknown as Json,
    ship_to: shipToOf(customer, address) as unknown as Json,
    status: 'paid',
  });

  if (created) {
    // bez zmeny: Stripe naplánuje ďalšiu platbu o D dní; pri zmene D: dnešná platba + D_nové (nové vrece sa začne
    // používať o LEAD dní, keď sa minie predošlé, a vydrží D_nové)
    const next = chargeTime(addDays(now, changed ? q.daysPerBag : sub.days_per_bag));
    if (changed) {
      await changePlan(stripeSubId, {
        productId: productIdFor(skuItems(sub.product_id, sub.bag_id as BagId)[0].sku),
        unitAmountCents: q.unitAmountCents,
        days: q.daysPerBag,
        shippingCents: shippingCentsOf(invoice, sub),
        shippingProductId: SHIPPING_PRODUCT_ID,
        nextCharge: next,
      }, deps.stripe);
    }
    await deps.store.updateSubscription(sub.id, {
      status: 'active',
      next_charge_at: next.toISOString(),
      ...(changed ? { days_per_bag: q.daysPerBag, grams_per_day: q.gramsPerDay, unit_amount_cents: q.unitAmountCents, engine_snapshot: { answers, product_id: sub.product_id, bag_id: sub.bag_id, grams: q.gramsPerDay, days: q.daysPerBag, at: now.toISOString() } as Json } : {}),
    });
  }
  await sendSafely(deps, order);
  const fresh = await deps.store.findSubscriptionByStripeId(stripeSubId);
  const ship = shippingCentsOf(invoice, sub);
  await sendConfirmation(deps, order, customer, dog, { days: fresh?.days_per_bag ?? sub.days_per_bag, nextChargeAt: fresh?.next_charge_at ? new Date(fresh.next_charge_at) : null }, { shippingCents: ship, foodCents: invoice.amount_paid - ship });
  if (created) await emit(deps, 'renewed', (e) => e.renewed?.({ order, customer, subscription: fresh ?? sub, invoice }));
  return order;
}

/** cena dopravy z faktúry (riadok s produktom dopravy), inak rozdiel sumy a ceny vreca */
function shippingCentsOf(invoice: Stripe.Invoice, sub: Subscription): number {
  const line = invoice.lines?.data.find((l) => {
    const p = l.pricing?.price_details?.product;
    return (typeof p === 'string' ? p : null) === SHIPPING_PRODUCT_ID;
  });
  return line ? line.amount : Math.max(0, invoice.amount_paid - sub.unit_amount_cents);
}

export async function handlePaymentFailed(invoice: Stripe.Invoice, deps: Deps) {
  const stripeSubId = idOf(invoice.parent?.subscription_details?.subscription);
  if (!stripeSubId) return;
  const sub = await deps.store.findSubscriptionByStripeId(stripeSubId);
  if (!sub) return;
  await deps.store.updateSubscription(sub.id, { status: 'past_due' });
  await emit(deps, 'renewalFailed', (e) => e.renewalFailed?.({ subscription: sub, invoice }));
  const [customer, dog] = await Promise.all([deps.store.getCustomer(sub.customer_id), deps.store.getDog(sub.dog_id)]);
  if (!customer || !invoice.id || !deps.siteUrl) return;
  const line = invoice.lines?.data.find((l) => {
    const p = l.pricing?.price_details?.product;
    return (typeof p === 'string' ? p : null) === SHIPPING_PRODUCT_ID;
  });
  await mailSafely(
    deps,
    paymentFailedEmail({
      invoiceId: invoice.id,
      attempt: invoice.attempt_count ?? 1,
      to: customer.email,
      name: customer.name,
      dog: dogOf(dog),
      siteUrl: deps.siteUrl,
      product: { productId: sub.product_id, bagId: sub.bag_id, days: sub.days_per_bag },
      totalCents: invoice.amount_due,
      shippingCents: line ? line.amount : Math.max(0, invoice.amount_due - sub.unit_amount_cents),
      payUrl: invoice.hosted_invoice_url,
      nextAttempt: unixDate(invoice.next_payment_attempt),
    }),
    { type: 'subscription', id: sub.id },
  );
}

/** Stripe stav → náš: trialing/active → active, past_due/unpaid → past_due, pauza → paused, canceled → cancelled */
export function statusOf(s: Stripe.Subscription): Subscription['status'] {
  if (s.status === 'canceled' || s.status === 'incomplete_expired') return 'cancelled';
  if (s.pause_collection) return 'paused';
  if (s.status === 'past_due' || s.status === 'unpaid') return 'past_due';
  return 'active';
}

export async function handleSubscriptionChanged(s: Stripe.Subscription, deps: Deps, previous?: Partial<Stripe.Subscription> | null) {
  const sub = await deps.store.findSubscriptionByStripeId(s.id);
  if (!sub) return; // ešte nevzniklo (checkout.session.completed príde neskôr) alebo cudzie
  const next = s.status === 'trialing' ? unixDate(s.trial_end) : unixDate(s.items?.data?.[0]?.current_period_end);
  const status = statusOf(s);
  const before = sub.status;
  await deps.store.updateSubscription(sub.id, { status, ...(next && s.status !== 'canceled' ? { next_charge_at: next.toISOString() } : {}) });
  // P7 subscription_cancelled: raz pri žiadosti o zrušenie ku koncu obdobia, alebo pri okamžitom zrušení bez nej
  const requested = (x: Partial<Stripe.Subscription> | null | undefined) => !!(x?.cancel_at_period_end || x?.cancel_at);
  const hadRequest = previous && ('cancel_at_period_end' in previous || 'cancel_at' in previous) ? requested(previous) : requested(s);
  if (status !== 'cancelled' && requested(s) && !hadRequest) {
    await emit(deps, 'cancelled', (e) => e.cancelled?.({ subscription: sub, stripeSubscription: s, atPeriodEnd: true }));
  } else if (status === 'cancelled' && before !== 'cancelled' && !requested(s)) {
    await emit(deps, 'cancelled', (e) => e.cancelled?.({ subscription: sub, stripeSubscription: s, atPeriodEnd: false }));
  }
}
