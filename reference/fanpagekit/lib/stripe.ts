import Stripe from 'stripe';
import { checkoutModel, parseOrder, type Order } from './checkout';
import { PACKS } from './data';

/*
 * Server-only Stripe helpers shared by one-time payments (lib/payment.ts) and subscriptions
 * (lib/subscription.ts). Never import these from a client component.
 */

let client: Stripe | null = null;

export function stripeConfigured() {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

export function stripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('STRIPE_SECRET_KEY is not set');
  client ??= new Stripe(key, { appInfo: { name: 'FanpageKit' } });
  return client;
}

export const cents = (dollars: number) => dollars * 100;

export const idOf = (v: string | { id: string } | null | undefined) => (typeof v === 'string' ? v : v?.id ?? null);

export const customerOf = (session: Stripe.Checkout.Session) => idOf(session.customer);

/** Marks every Stripe object this site creates: the Stripe account is shared with another project, and its events reach this webhook too. */
export const APP_METADATA = { app: 'fanpagekit' };

/**
 * Whether a Stripe object belongs to this site. Objects from before APP_METADATA are recognised by their own
 * metadata: a known pack and plan, or the upsell link (fulfillment re-checks the order that one points to).
 */
export function isOurs(metadata: Stripe.Metadata | null | undefined) {
  if (metadata?.app) return metadata.app === APP_METADATA.app;
  if (metadata?.upsell_for) return true;
  return PACKS.some((p) => p.slug === metadata?.pack) && (metadata?.plan === 'once' || metadata?.plan === 'monthly');
}

/** Where a payment came from: the Fanpage Blueprint results page, or the main site. */
export type Flow = 'blueprint' | 'site';

/** Orders from before `flow` was stored count as the main site. */
export const flowOf = (metadata: Stripe.Metadata | null | undefined): Flow => (metadata?.flow === 'blueprint' ? 'blueprint' : 'site');

/** Added to internal payment descriptions, so the Stripe dashboard shows a payment's flow. */
export const flowLabel = (flow: Flow) => (flow === 'blueprint' ? ' · Blueprint' : '');

/** The order as stored on Checkout Sessions, PaymentIntents and Subscriptions. */
export function orderMetadata(order: Order, flow: Flow) {
  const m = checkoutModel(order);
  return { ...APP_METADATA, flow, pack: m.sel.slug, bundle: m.bundleUp ? '1' : '0', plan: order.plan, full: m.full ? '1' : '0' };
}

export function orderFromMetadata(metadata: Stripe.Metadata | null | undefined) {
  return parseOrder({ pack: metadata?.pack, bundle: metadata?.bundle, plan: metadata?.plan, full: metadata?.full });
}

/** What every order's Checkout Session shares, whichever plan it is. */
export function checkoutBase(order: Order, siteUrl: string, flow: Flow) {
  return {
    ui_mode: 'embedded_page',
    // Paid → the one-click upsell, which forwards to /access.
    return_url: `${siteUrl}/upsell?session_id={CHECKOUT_SESSION_ID}`,
    metadata: orderMetadata(order, flow),
    allow_promotion_codes: true,
  } satisfies Partial<Stripe.Checkout.SessionCreateParams>;
}

/** Reads a completed Checkout Session back into the order it paid for, or null if it isn't paid. */
export async function paidOrder(sessionId: string) {
  const session = await stripe().checkout.sessions.retrieve(sessionId);
  // Orders carry no `kind`; every other Checkout of ours does (upsell, the studio sold on its own and its pack offer),
  // and none of them is an order. Another project's session is no order of ours.
  if (session.status !== 'complete' || session.payment_status === 'unpaid' || session.metadata?.kind || !isOurs(session.metadata)) {
    return { session, order: null };
  }
  return { session, order: orderFromMetadata(session.metadata) };
}
