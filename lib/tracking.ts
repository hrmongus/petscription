import type Stripe from 'stripe';
import { posthogCapture, type Capture } from './analytics';
import type { FulfillmentEvents, Order } from './fulfillment';
import { linkOrder, supabaseQuizStore, type QuizStore } from './quiz';

/*
 * P7: čo sa po spracovaní Stripe webhooku deje pre dotazník a analytiku (lib/fulfillment.ts → deps.events).
 *   orderCreated  → quiz_sessions.order_id + PostHog order_completed (prvý nákup / jednorazový)
 *   renewed       → PostHog order_completed (renewal) + subscription_renewed
 *   renewalFailed → PostHog subscription_payment_failed
 *   cancelled     → PostHog subscription_cancelled
 * Súhlas pre profil v PostHogu: Stripe metadata ph = 1 (z checkoutu; nesie ho Session aj predplatné).
 * Všetko je mimo hlavného toku: chyba sa zaloguje, objednávka, FHB aj emaily bežia ďalej.
 */

export type TrackingDeps = {
  capture: Capture;
  quiz: QuizStore;
  /** počet objednávok zákazníka (nový / opakovaný zákazník, poradie obnovenia) */
  orderCounts(customerId: string, subscriptionId: string | null): Promise<{ customer: number; renewals: number }>;
};

const CARRIER: Record<string, string> = { packeta_point: 'packeta', dpd_pickup: 'dpd', sps_courier: 'sps' };
const deliveryOf = (o: Order) => {
  const m = (o.ship_to as { delivery_method?: string } | null)?.delivery_method ?? null;
  return { delivery_method: m, carrier: m ? CARRIER[m] ?? null : null };
};
const recipeOf = (o: Order) => {
  const sku = (o.items as { sku?: string }[] | null)?.[0]?.sku ?? '';
  const m = /^GRAN-(.+)-(4|9|18)$/.exec(sku);
  return { recipe: m?.[1] ?? null, bag: m?.[2] ?? null };
};
const eur = (cents: number) => Math.round(cents) / 100;
const consentOf = (md: Stripe.Metadata | null | undefined) => md?.ph === '1';

export function trackingEvents(d: TrackingDeps): FulfillmentEvents {
  return {
    async orderCreated({ order, customer, metadata }) {
      await linkOrder(metadata.quiz_session, order.id, d.quiz).catch((e) => console.error('[tracking] quiz_sessions', e));
      const counts = await d.orderCounts(customer.id, null);
      await d.capture({
        event: 'order_completed',
        key: `order:${order.id}`,
        customerId: customer.id,
        consent: consentOf(metadata),
        properties: {
          order_kind: order.kind,
          plan: metadata.plan ?? (order.kind === 'one_off' ? 'raz' : 'mesiac'),
          recipe: metadata.product_id ?? recipeOf(order).recipe,
          bag: metadata.bag_id ?? recipeOf(order).bag,
          ...deliveryOf(order),
          revenue: eur(order.amount_cents),
          shipping: metadata.ship_cents ? eur(Number(metadata.ship_cents)) : null,
          currency: 'EUR',
          days_per_bag: metadata.days ? Number(metadata.days) : null,
          is_first_order: counts.customer <= 1,
          customer_type: counts.customer <= 1 ? 'new' : 'returning',
          quiz_session_id: metadata.quiz_session ?? null,
        },
      });
    },

    async renewed({ order, customer, subscription, invoice }) {
      const md = invoice.parent?.subscription_details?.metadata ?? null;
      const counts = await d.orderCounts(customer.id, subscription.id);
      const base = {
        ...deliveryOf(order),
        recipe: subscription.product_id,
        bag: subscription.bag_id,
        plan: 'mesiac',
        revenue: eur(order.amount_cents),
        currency: 'EUR',
        days_per_bag: subscription.days_per_bag,
        renewal_number: counts.renewals,
      };
      const consent = consentOf(md);
      await d.capture({ event: 'order_completed', key: `order:${order.id}`, customerId: customer.id, consent, properties: { ...base, order_kind: 'renewal', is_first_order: false, customer_type: 'returning' } });
      await d.capture({ event: 'subscription_renewed', key: `renewal:${order.id}`, customerId: customer.id, consent, properties: base });
    },

    async renewalFailed({ subscription, invoice }) {
      const md = invoice.parent?.subscription_details?.metadata ?? null;
      await d.capture({
        event: 'subscription_payment_failed',
        key: `invoice-failed:${invoice.id}:${invoice.attempt_count ?? 1}`,
        customerId: subscription.customer_id,
        consent: consentOf(md),
        properties: { recipe: subscription.product_id, bag: subscription.bag_id, attempt: invoice.attempt_count ?? 1, amount: eur(invoice.amount_due ?? 0), currency: 'EUR' },
      });
    },

    async cancelled({ subscription, stripeSubscription: s, atPeriodEnd }) {
      const counts = await d.orderCounts(subscription.customer_id, subscription.id);
      const lifetimeDays = Math.max(0, Math.round((Date.now() - new Date(subscription.created_at).getTime()) / 86_400_000));
      await d.capture({
        event: 'subscription_cancelled',
        key: `cancel:${subscription.id}:${atPeriodEnd ? 'request' : 'ended'}`,
        customerId: subscription.customer_id,
        consent: consentOf(s.metadata),
        properties: {
          at_period_end: atPeriodEnd,
          reason: s.cancellation_details?.reason ?? null,
          feedback: s.cancellation_details?.feedback ?? null,
          recipe: subscription.product_id,
          bag: subscription.bag_id,
          days_per_bag: subscription.days_per_bag,
          renewals: counts.renewals,
          lifetime_days: Number.isFinite(lifetimeDays) ? lifetimeDays : null,
        },
      });
    },
  };
}

export async function fulfillmentEvents(): Promise<FulfillmentEvents> {
  const { db } = await import('./db');
  return trackingEvents({
    capture: posthogCapture(),
    quiz: await supabaseQuizStore(),
    async orderCounts(customerId, subscriptionId) {
      const c = await db().from('orders').select('id', { count: 'exact', head: true }).eq('customer_id', customerId);
      const r = subscriptionId
        ? await db().from('orders').select('id', { count: 'exact', head: true }).eq('subscription_id', subscriptionId).eq('kind', 'renewal')
        : { count: 0 };
      return { customer: c.count ?? 0, renewals: r.count ?? 0 };
    },
  });
}
