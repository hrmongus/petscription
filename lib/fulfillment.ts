import type Stripe from 'stripe';
import { answersAt } from './checkout';
import type { Json, Tables, TablesInsert, TablesUpdate } from './database.types';
import { quote } from './engine-server';
import type { ShipTo } from './fhb/build-order';
import { skuItems, type BagId } from './engine-server';
import { idOf } from './stripe';
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

export type Deps = {
  store: Store;
  stripe: Stripe;
  /** odoslanie do FHB (lib/fhb/send.ts); chyba neprerušuje webhook, objednávka ostane paid/fhb_error */
  sendToFhb?: (orderId: string) => Promise<unknown>;
  cycle: CycleParams;
  now?: () => Date;
};

const nowOf = (d: Deps) => (d.now ? d.now() : new Date());

/** ship_to snapshot z adresy a zákazníka (pri výdajnom mieste sú ulica/PSČ/mesto adresou miesta) */
export function shipToOf(c: Customer, a: Address): ShipTo {
  const pickup = a.delivery_method !== 'sps_courier';
  return {
    name: a.name,
    email: c.email,
    phone: c.phone ?? '',
    country: a.country,
    delivery_method: a.delivery_method as ShipTo['delivery_method'],
    ...(pickup
      ? { point_id: a.point_id, point_label: a.point_label, point_address: a.street && a.city && a.zip ? { street: a.street, city: a.city, zip: a.zip } : null }
      : { street: a.street, city: a.city, zip: a.zip }),
  };
}

async function sendSafely(deps: Deps, order: Order) {
  if (!deps.sendToFhb || !['paid', 'fhb_error'].includes(order.status)) return;
  try {
    await deps.sendToFhb(order.id);
  } catch (e) {
    // sieť / 5xx: objednávka ostáva paid, odoslanie zopakuje cron (krok 5) alebo admin
    console.error('[fulfillment] FHB odoslanie zlyhalo', order.id, e);
  }
}

const unixDate = (s: number | null | undefined) => (s ? new Date(s * 1000) : null);

export async function handleCheckoutCompleted(session: Stripe.Checkout.Session, deps: Deps): Promise<Order | null> {
  if (session.payment_status === 'unpaid') return null; // napr. oneskorená platba; príde async_payment_succeeded
  const md = session.metadata ?? {};
  const [customer, dog, address] = await Promise.all([deps.store.getCustomer(md.customer_id), deps.store.getDog(md.dog_id), deps.store.getAddress(md.address_id)]);
  if (!customer || !dog || !address) throw new Error(`checkout ${session.id}: chýba draft (customer/dog/address)`);
  const bag = md.bag_id as BagId;
  const days = Number(md.days);
  const now = nowOf(deps);

  let subscriptionId: string | null = null;
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
    await deps.stripe.subscriptions.update(stripeSubId, { trial_end: Math.floor(next.getTime() / 1000), proration_behavior: 'none' });
  }

  const { order } = await deps.store.insertOrder({
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
  if (sub) await deps.store.updateSubscription(sub.id, { status: 'past_due' });
  // email zákazníkovi: krok 5
}

/** Stripe stav → náš: trialing/active → active, past_due/unpaid → past_due, pauza → paused, canceled → cancelled */
export function statusOf(s: Stripe.Subscription): Subscription['status'] {
  if (s.status === 'canceled' || s.status === 'incomplete_expired') return 'cancelled';
  if (s.pause_collection) return 'paused';
  if (s.status === 'past_due' || s.status === 'unpaid') return 'past_due';
  return 'active';
}

export async function handleSubscriptionChanged(s: Stripe.Subscription, deps: Deps) {
  const sub = await deps.store.findSubscriptionByStripeId(s.id);
  if (!sub) return; // ešte nevzniklo (checkout.session.completed príde neskôr) alebo cudzie
  const next = s.status === 'trialing' ? unixDate(s.trial_end) : unixDate(s.items?.data?.[0]?.current_period_end);
  await deps.store.updateSubscription(sub.id, { status: statusOf(s), ...(next && s.status !== 'canceled' ? { next_charge_at: next.toISOString() } : {}) });
}
