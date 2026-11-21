import type Stripe from 'stripe';
import { checkoutModel, studioPacks, upsellIdOf, upsellPacks, upsellPrice, type Order, type UpsellId } from './checkout';
import { PACKS } from './data';
import { APP_METADATA, cents, checkoutBase, customerOf, flowLabel, flowOf, idOf, orderMetadata, stripe, type Flow } from './stripe';
import { STUDIO_EMAIL_KEY, STUDIO_PRODUCT_NAME, STUDIO_SUB_KEY, studioPriceId, studioUpsellSubscription } from './studio-subscription';

/* One-time payments: single packs and the bundle, plus the post-purchase upsell. Nothing here renews. */

export function paymentSessionParams(order: Order, siteUrl: string, flow: Flow): Stripe.Checkout.SessionCreateParams {
  const m = checkoutModel(order);
  const metadata = orderMetadata(order, flow);
  const name = `FanpageKit — ${m.orderName}`;
  return {
    ...checkoutBase(order, siteUrl, flow),
    mode: 'payment',
    line_items: [{
      quantity: 1,
      price_data: {
        currency: 'usd',
        unit_amount: cents(m.dueToday),
        product_data: {
          name,
          description: m.isBundleOrder
            ? '120 finished videos, 448 raw clips, editing guides and the posting playbook.'
            : '30 finished videos, 112 raw clips, editing guides and the posting playbook.',
        },
      },
    }],
    customer_creation: 'always',
    invoice_creation: { enabled: true, invoice_data: { metadata } },
    // Keep the card on the customer so the post-purchase upsell is one click. Without a description the
    // dashboard lists the payment by its PaymentIntent id.
    payment_intent_data: { description: name + flowLabel(flow), metadata, setup_future_usage: 'off_session' },
  };
}

/* ---------- post-purchase upsells ---------- */

/*
 * Two upsells follow the order, one page each: more_packs on /upsell, then studio on /studio-offer, then /access.
 * Both are on the order's customer, charged in one click to the card just used, or paid through an embedded Checkout
 * when the bank wants the buyer. more_packs is one PaymentIntent; the studio is a monthly Subscription
 * (lib/studio-subscription.ts; before that it was a PaymentIntent too, still honoured). Each carries `upsell_for`
 * (the order's Checkout Session) and `upsell` (its UpsellId) in its metadata.
 */

/** The page after each upsell, for this order's Checkout Session. */
export function afterUpsell(id: UpsellId, sessionId: string) {
  return `${id === 'more_packs' ? '/studio-offer' : '/access'}?session_id=${encodeURIComponent(sessionId)}`;
}

/**
 * The paid PaymentIntent for this upsell of the order's Checkout Session (one-click or by card), if any. For the
 * studio, only a one-time purchase from before the subscription: use upsellBought.
 */
export async function upsellIntent(session: Stripe.Checkout.Session, id: UpsellId = 'more_packs') {
  const customer = customerOf(session);
  if (!customer) return undefined;
  const intents = await stripe().paymentIntents.list({ customer, limit: 20 });
  return intents.data.find((pi) => pi.metadata?.upsell_for === session.id && pi.status === 'succeeded' && upsellIdOf(pi.metadata) === id);
}

/**
 * What paid for this upsell of the order's Checkout Session: its PaymentIntent, or for the studio its Subscription
 * (or the PaymentIntent of a one-time studio purchase from before). Undefined until paid.
 */
export async function upsellBought(session: Stripe.Checkout.Session, id: UpsellId = 'more_packs'): Promise<Stripe.PaymentIntent | Stripe.Subscription | undefined> {
  if (id !== 'studio') return upsellIntent(session, id);
  return (await studioUpsellSubscription(session)) ?? (await upsellIntent(session, id));
}

/** True once this upsell for the order's Checkout Session has been paid. */
export async function upsellPaid(session: Stripe.Checkout.Session, id: UpsellId = 'more_packs') {
  return Boolean(await upsellBought(session, id));
}

/** The card the buyer just paid with: saved for off-session use, or the subscription's default. */
export async function savedPaymentMethod(session: Stripe.Checkout.Session) {
  if (session.mode === 'subscription') {
    const sub = idOf(session.subscription);
    return sub ? idOf((await stripe().subscriptions.retrieve(sub)).default_payment_method) : null;
  }
  const pi = idOf(session.payment_intent);
  return pi ? idOf((await stripe().paymentIntents.retrieve(pi)).payment_method) : null;
}

const packNames = (slugs: string[]) => slugs.map((s) => PACKS.find((p) => p.slug === s)?.name ?? s).join(', ');

/**
 * What the buyer sees for the upsell on their receipt and in Checkout, and what the dashboard lists it as.
 * `studioPackSlugs`: the packs the studio unlocks (the studio upsell only).
 */
function upsellProduct(id: UpsellId, order: Order, studioPackSlugs: string[]) {
  if (id === 'studio') {
    return {
      name: STUDIO_PRODUCT_NAME,
      description: `Monthly access to studio.fanpagekit.com: unlimited lyric videos from your songs, with ${packNames(studioPackSlugs)} unlocked. $${upsellPrice('studio')} a month, cancel any time.`,
    };
  }
  return { name: `FanpageKit — ${upsellPacks(order).map((p) => p.name).join(', ')}`, description: undefined };
}

/** The packs the studio upsell unlocks for this order, read from Stripe (the more_packs upsell adds the rest). */
export async function studioPacksFor(session: Stripe.Checkout.Session, order: Order) {
  return studioPacks(order, await upsellPaid(session, 'more_packs'));
}

function upsellMetadata(session: Stripe.Checkout.Session, id: UpsellId) {
  return { ...APP_METADATA, flow: flowOf(session.metadata), upsell_for: session.id, upsell: id };
}

/**
 * Charges the upsell to the saved card. Resolves true when paid; false when the card can't be charged
 * without the buyer (3-D Secure, no saved card, decline) and they need to pay through Checkout instead.
 */
export async function chargeUpsell(session: Stripe.Checkout.Session, order: Order, id: UpsellId = 'more_packs') {
  const customer = customerOf(session);
  const paymentMethod = customer ? await savedPaymentMethod(session) : null;
  if (!customer || !paymentMethod) return false;
  if (id === 'studio') return subscribeStudio(session, customer, paymentMethod);
  const product = upsellProduct(id, order, []);
  try {
    const pi = await stripe().paymentIntents.create(
      {
        amount: cents(upsellPrice(id)),
        currency: 'usd',
        customer,
        payment_method: paymentMethod,
        off_session: true,
        confirm: true,
        description: product.name + flowLabel(flowOf(session.metadata)),
        metadata: upsellMetadata(session, id),
      },
      // A double click must not charge twice. The first upsell keeps its original key.
      { idempotencyKey: id === 'more_packs' ? `upsell-${session.id}` : `upsell-${id}-${session.id}` },
    );
    return pi.status === 'succeeded';
  } catch (err) {
    console.warn(`[upsell] ${id}: one-click charge failed, falling back to checkout`, (err as Error).message);
    return false;
  }
}

/** The studio subscription's metadata on an upsell: the upsell link, the studio flag and the account it unlocks. */
function studioSubMetadata(session: Stripe.Checkout.Session) {
  const email = session.customer_details?.email?.trim().toLowerCase();
  return { ...upsellMetadata(session, 'studio'), [STUDIO_SUB_KEY]: '1', ...(email && { [STUDIO_EMAIL_KEY]: email }) };
}

/**
 * The studio upsell in one click: a monthly Subscription on the order's customer and card, its first month charged
 * now. True when it's paid; false when the card needs the buyer (no subscription is left behind), so they go through
 * Checkout instead.
 */
async function subscribeStudio(session: Stripe.Checkout.Session, customer: string, paymentMethod: string) {
  try {
    const sub = await stripe().subscriptions.create(
      {
        customer,
        default_payment_method: paymentMethod,
        items: [{ price: await studioPriceId(), quantity: 1 }],
        off_session: true,
        // Fails outright instead of leaving an unpaid subscription when the bank wants the buyer.
        payment_behavior: 'error_if_incomplete',
        description: STUDIO_PRODUCT_NAME + flowLabel(flowOf(session.metadata)),
        metadata: studioSubMetadata(session),
      },
      // A double click must not subscribe twice.
      { idempotencyKey: `upsell-studio-sub-${session.id}` },
    );
    return sub.status === 'active' || sub.status === 'trialing';
  } catch (err) {
    console.warn('[upsell] studio: one-click subscription failed, falling back to checkout', (err as Error).message);
    return false;
  }
}

/**
 * Embedded Checkout for an upsell, used when the one-click charge can't go through. Returns to the next page.
 * The studio's is a subscription Checkout. `studioPackSlugs`: for the studio, the packs it unlocks (studioPacksFor),
 * named in its description.
 */
export async function upsellSessionParams(
  session: Stripe.Checkout.Session, order: Order, siteUrl: string, id: UpsellId = 'more_packs', studioPackSlugs: string[] = [],
): Promise<Stripe.Checkout.SessionCreateParams> {
  const metadata = upsellMetadata(session, id);
  const product = upsellProduct(id, order, studioPackSlugs);
  if (id === 'studio') {
    return {
      ui_mode: 'embedded_page',
      mode: 'subscription',
      customer: customerOf(session) ?? undefined,
      line_items: [{ price: await studioPriceId(), quantity: 1 }],
      metadata: { ...metadata, kind: 'upsell' },
      subscription_data: {
        description: product.name + flowLabel(flowOf(session.metadata)),
        // `checkout`: tells the paid event it went through the card form, not one click.
        metadata: { ...studioSubMetadata(session), checkout: '1' },
      },
      return_url: `${siteUrl}${afterUpsell(id, session.id)}`,
    };
  }
  return {
    ui_mode: 'embedded_page',
    mode: 'payment',
    customer: customerOf(session) ?? undefined,
    line_items: [{
      quantity: 1,
      price_data: { currency: 'usd', unit_amount: cents(upsellPrice(id)), product_data: { name: product.name, ...(product.description && { description: product.description }) } },
    }],
    metadata: { ...metadata, kind: 'upsell' },
    payment_intent_data: { description: product.name + flowLabel(flowOf(session.metadata)), metadata: { ...metadata, kind: 'upsell' } },
    return_url: `${siteUrl}${afterUpsell(id, session.id)}`,
  };
}
