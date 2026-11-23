import type Stripe from 'stripe';
import { checkoutModel, deliverables, orderPacks, renewalPack, upsellPacks, type UpsellId } from './checkout';
import { packsOwnedBy, recordPurchase } from './db';
import { sendOrderEmail, sendRenewalEmail, sendStudioEmail, sendUpsellEmail } from './email';
import { studioPacksFor, upsellIntent } from './payment';
import { grantStudioPacks, hasStudio, LOGIN_LINK_TTL, revokeStudio, studioLoginUrl } from './studio';
import { siteUrl } from './site';
import { paidPacks } from './studio-packs';
import { accountEmail, buyerEmails, isStudioSale, STUDIO_SUB_DESCRIPTION } from './studio-sale';
import { STUDIO_EMAIL_KEY, studioUpsellSubscription } from './studio-subscription';
import { flowLabel, flowOf, idOf, orderFromMetadata, paidOrder, stripe } from './stripe';

const setupUrl = async (sessionId: string) => `${await siteUrl()}/access?session_id=${encodeURIComponent(sessionId)}`;

/*
 * Each email goes out once per purchase, however often Stripe redelivers the event or the buyer reloads.
 * Two guards: a permanent `emailed_at` stamp in the purchase's Stripe metadata (PaymentIntent, Subscription or,
 * for a renewal, Invoice), checked before sending; and Resend's idempotency key, which covers two deliveries
 * racing past that check within 24 hours.
 */
type Purchase = { kind: 'payment_intent' | 'subscription' | 'invoice'; id: string };

const purchaseApi = (kind: Purchase['kind'] | undefined) =>
  kind === 'subscription' ? stripe().subscriptions : kind === 'invoice' ? stripe().invoices : stripe().paymentIntents;

async function sendOnce(purchase: Purchase | null, label: string, deliver: () => Promise<boolean>) {
  const api = purchaseApi(purchase?.kind);
  if (purchase) {
    const { metadata } = await api.retrieve(purchase.id);
    if (metadata?.emailed_at) return console.info(`[fulfillment] ${label} email already sent`, purchase.id, metadata.emailed_at);
  } else {
    // e.g. a $0 order through a 100% promo code has no PaymentIntent; only the idempotency key guards it.
    console.warn(`[fulfillment] ${label}: no PaymentIntent or Subscription to stamp`);
  }
  // Stamp only real sends, so an email skipped for missing Resend config still goes out on a later retry.
  if ((await deliver()) && purchase) await api.update(purchase.id, { metadata: { emailed_at: new Date().toISOString() } });
}

function orderPurchase(session: Stripe.Checkout.Session): Purchase | null {
  const sub = idOf(session.subscription);
  if (sub) return { kind: 'subscription', id: sub };
  const pi = idOf(session.payment_intent);
  return pi ? { kind: 'payment_intent', id: pi } : null;
}

/**
 * Runs once Stripe confirms payment (from the webhook). Stripe retries webhooks, so anything added here
 * must be idempotent — key it on session.id, or go through sendOnce.
 *
 * Every buyer gets the links for this order on /access and by email. A failed send throws, so the webhook
 * answers 500 and Stripe retries it. This is also the place to add them to a mailing list or decrement pack stock.
 */
export async function fulfillOrder(session: Stripe.Checkout.Session) {
  const order = orderFromMetadata(session.metadata);
  const { orderName, monthly, total } = checkoutModel(order);
  const email = session.customer_details?.email;
  console.info('[fulfillment] paid', { session: session.id, email, order: orderName, monthly, amount: session.amount_total });

  if (!email) return console.error('[fulfillment] no email on session', session.id);
  await recordPurchase({
    kind: 'order',
    stripeRef: session.id,
    email,
    name: session.customer_details?.name,
    customerId: idOf(session.customer),
    checkoutSessionId: session.id,
    paymentIntentId: idOf(session.payment_intent),
    invoiceId: idOf(session.invoice),
    subscriptionId: idOf(session.subscription),
    plan: order.plan,
    description: (monthly ? `${orderName} · monthly` : orderName) + flowLabel(flowOf(session.metadata)),
    amountCents: session.amount_total ?? 0,
    currency: session.currency ?? 'usd',
    // No paid-at on a Checkout Session; the first delivery of the webhook is within seconds of it.
    paidAt: null,
    packs: orderPacks(order),
  });

  const { shown } = deliverables(order, false);
  const url = await setupUrl(session.id);
  await sendOnce(orderPurchase(session), 'order', () =>
    sendOrderEmail({ to: email, idempotencyKey: `order-${session.id}`, orderName, slugs: shown, monthly, total, setupUrl: url }),
  );
}

/**
 * Runs once an upsell is paid, whichever one it is (fulfillMorePacks, fulfillStudio). Resolves to the packs the
 * studio unlocked, for the studio; nothing for the packs upsell.
 */
export async function fulfillUpsell(orderSessionId: string, paymentId: string, id: UpsellId): Promise<string[] | void> {
  if (id === 'studio') return fulfillStudio(orderSessionId, paymentId);
  await fulfillMorePacks(orderSessionId, paymentId);
}

/**
 * Runs once the more_packs upsell is paid — from the one-click charge, or from the webhook when the buyer
 * paid through the fallback Checkout. Emails whatever it unlocked: the four-pack folder for one-off buyers,
 * the other three packs for subscribers.
 */
async function fulfillMorePacks(orderSessionId: string, paymentId: string) {
  const { session, order } = await paidOrder(orderSessionId);
  if (!order) return;
  const email = session.customer_details?.email;
  console.info('[fulfillment] upsell paid', { session: session.id, payment: paymentId, email });

  if (!email) return console.error('[fulfillment] no email on session', session.id);
  const pi = await upsellIntent(session, 'more_packs');
  if (pi) {
    await recordPurchase({
      kind: 'upsell',
      stripeRef: pi.id,
      email,
      name: session.customer_details?.name,
      customerId: idOf(pi.customer),
      checkoutSessionId: session.id,
      paymentIntentId: pi.id,
      description: pi.description ?? 'Upsell',
      amountCents: pi.amount_received,
      currency: pi.currency,
      paidAt: pi.created,
      packs: upsellPacks(order).map((p) => p.slug),
    });
  } else {
    console.error('[fulfillment] upsell paid but no PaymentIntent found — not recorded', session.id, paymentId);
  }

  const before = deliverables(order, false).shown;
  const after = deliverables(order, true);
  const unlocked = [...after.shown, ...after.emailed].filter((slug) => !before.includes(slug));
  if (!unlocked.length) return;
  const url = await setupUrl(session.id);
  await sendOnce(pi ? { kind: 'payment_intent', id: pi.id } : null, 'upsell', () =>
    sendUpsellEmail({ to: email, idempotencyKey: `upsell-${orderSessionId}`, slugs: unlocked, setupUrl: url }),
  );
}

/** The first invoice of a subscription: what its first month charged, and when. */
async function firstInvoice(sub: Stripe.Subscription) {
  const { data } = await stripe().invoices.list({ subscription: sub.id, status: 'paid', limit: 100 });
  return data.find((i) => i.billing_reason === 'subscription_create') ?? data.at(-1) ?? null;
}

/**
 * Runs once the studio upsell is paid — from the one-click subscription on /studio-offer, or from the webhook (which
 * also retries it). Records the first month, creates the buyer's studio account with their packs unlocked, and emails
 * them the one-click login. Throws when the studio can't be provisioned, so the webhook answers 500 and Stripe
 * retries. A one-time studio upsell from before the subscription is still fulfilled from its PaymentIntent.
 */
async function fulfillStudio(orderSessionId: string, paymentId: string) {
  const { session, order } = await paidOrder(orderSessionId);
  if (!order) return;
  const email = session.customer_details?.email;
  console.info('[fulfillment] studio paid', { session: session.id, payment: paymentId, email });

  if (!email) return console.error('[fulfillment] no email on session', session.id);
  const packs = await studioPacksFor(session, order);
  const sub = await studioUpsellSubscription(session);
  const legacy = sub ? undefined : await upsellIntent(session, 'studio');
  if (!sub && !legacy) throw new Error(`studio paid but no subscription found for ${session.id} (${paymentId})`);

  if (sub) {
    const invoice = await firstInvoice(sub);
    await recordPurchase({
      kind: 'upsell',
      stripeRef: sub.id,
      email,
      name: session.customer_details?.name,
      customerId: idOf(sub.customer),
      checkoutSessionId: session.id,
      invoiceId: invoice?.id ?? null,
      subscriptionId: sub.id,
      plan: 'monthly',
      description: sub.description ?? 'FanpageKit Studio',
      amountCents: invoice?.amount_paid ?? 0,
      currency: invoice?.currency ?? sub.currency,
      paidAt: invoice?.status_transitions?.paid_at ?? sub.start_date,
      // No packs: the studio unlocks ones the buyer already owns.
      packs: [],
    });
    // Unlocks keyed on the subscription: deleted when it ends (endStudio).
    await grantStudioPacks({ email, packs, ref: sub.id, livemode: sub.livemode });
  } else if (legacy) {
    await recordPurchase({
      kind: 'upsell',
      stripeRef: legacy.id,
      email,
      name: session.customer_details?.name,
      customerId: idOf(legacy.customer),
      checkoutSessionId: session.id,
      paymentIntentId: legacy.id,
      description: legacy.description ?? 'FanpageKit Studio',
      amountCents: legacy.amount_received,
      currency: legacy.currency,
      paidAt: legacy.created,
      packs: [],
    });
    await grantStudioPacks({ email, packs, ref: legacy.id, paymentIntentId: legacy.id, livemode: legacy.livemode });
  }

  const url = await setupUrl(session.id);
  const purchase: Purchase = sub ? { kind: 'subscription', id: sub.id } : { kind: 'payment_intent', id: legacy!.id };
  await sendOnce(purchase, 'studio', () =>
    sendStudioEmail({ to: email, idempotencyKey: `studio-${orderSessionId}`, slugs: packs, loginUrl: studioLoginUrl(email, LOGIN_LINK_TTL.email), setupUrl: url, monthly: Boolean(sub) }),
  );
  return packs;
}

/**
 * The studio subscription bought on its own from an email link (/studio, lib/studio-sale.ts): creates the studio
 * account under the link's email (else the one paid with), unlocks every pack either address bought here, records the
 * first month and emails the one-click login. From the webhook, and from /studio when the buyer returns (whichever is
 * first; every step is idempotent). Resolves to the account email and the packs unlocked. Throws when the studio can't
 * be provisioned, so the webhook answers 500 and Stripe retries.
 */
export async function fulfillStudioSale(session: Stripe.Checkout.Session) {
  const email = accountEmail(session);
  const subId = idOf(session.subscription);
  if (!email || !subId) throw new Error(`studio sale ${session.id} has no email or subscription`);
  // The packs owned at the first run, kept on the Subscription: later runs (a reload, a redelivery) unlock the same
  // ones, never packs bought afterwards, which are unlocked under their own payment so a refund takes back the right ones.
  const sub = await stripe().subscriptions.retrieve(subId);
  // `none`, not '': Stripe deletes a metadata key set to an empty string.
  const kept = sub.metadata?.studio_unlocked;
  let packs = kept ? (kept === 'none' ? [] : kept.split(',')) : null;
  if (!packs || sub.metadata?.[STUDIO_EMAIL_KEY] !== email) {
    packs ??= await packsOwnedBy(buyerEmails(session));
    // The account email, so renewals, cancellation and the "already has the studio" check find it.
    await stripe().subscriptions.update(subId, { metadata: { studio_unlocked: packs.join(',') || 'none', [STUDIO_EMAIL_KEY]: email } });
  }
  console.info('[fulfillment] studio sale paid', { session: session.id, subscription: subId, email, packs });

  await recordPurchase({
    kind: 'order',
    stripeRef: session.id,
    email,
    name: session.customer_details?.name,
    customerId: idOf(session.customer),
    checkoutSessionId: session.id,
    invoiceId: idOf(session.invoice),
    subscriptionId: subId,
    plan: 'monthly',
    description: STUDIO_SUB_DESCRIPTION,
    amountCents: session.amount_total ?? 0,
    currency: session.currency ?? 'usd',
    paidAt: session.created,
    // No packs: the studio unlocks ones the buyer already owns.
    packs: [],
  });
  // Unlocks keyed on the subscription: deleted when it ends (endStudio).
  await grantStudioPacks({ email, packs, ref: subId, livemode: session.livemode });
  const manageUrl = `${await siteUrl()}/studio?paid=${encodeURIComponent(session.id)}`;
  await sendOnce({ kind: 'subscription', id: subId }, 'studio', () =>
    sendStudioEmail({ to: email, idempotencyKey: `studio-${session.id}`, slugs: packs, loginUrl: studioLoginUrl(email, LOGIN_LINK_TTL.email), manageUrl, monthly: true }),
  );
  return { email, packs };
}

/**
 * The packs bought after the studio on /studio (lib/studio-packs.ts), one PaymentIntent either way (one click or the
 * fallback Checkout): records them, unlocks them in the buyer's studio and emails their Drive folders. From the
 * webhook, and from /studio right after the one-click charge (every step is idempotent). Resolves to the account
 * email and the packs. Throws when it can't, so the webhook answers 500 and Stripe retries.
 */
export async function fulfillStudioPacks(pi: Stripe.PaymentIntent) {
  const session = await stripe().checkout.sessions.retrieve(pi.metadata.studio_packs_for ?? '');
  const email = accountEmail(session);
  const packs = paidPacks(pi.metadata);
  if (!isStudioSale(session) || !email || !packs.length) throw new Error(`studio packs ${pi.id}: no studio sale, email or packs`);
  console.info('[fulfillment] studio packs paid', { session: session.id, payment: pi.id, email, packs });

  await recordPurchase({
    kind: 'upsell',
    stripeRef: pi.id,
    email,
    name: session.customer_details?.name,
    customerId: idOf(pi.customer),
    checkoutSessionId: session.id,
    paymentIntentId: pi.id,
    description: pi.description ?? 'FanpageKit packs',
    amountCents: pi.amount_received,
    currency: pi.currency,
    paidAt: pi.created,
    packs,
  });
  await grantStudioPacks({ email, packs, ref: pi.id, paymentIntentId: pi.id, livemode: pi.livemode });
  await sendOnce({ kind: 'payment_intent', id: pi.id }, 'studio packs', () =>
    sendUpsellEmail({ to: email, idempotencyKey: `studio-packs-${pi.id}`, slugs: packs }),
  );
  return { email, packs, session };
}

/** Which renewal this invoice is for its subscription (1 = the first). Read from Stripe, so a redelivered webhook gets the same answer. */
async function renewalNumber(subscription: string, invoice: Stripe.Invoice) {
  const { data } = await stripe().invoices.list({ subscription, status: 'paid', limit: 100 });
  return Math.max(1, data.filter((i) => i.billing_reason === 'subscription_cycle' && i.created <= invoice.created).length);
}

/**
 * Runs on every monthly renewal the subscription pays for (not the first month — that's fulfillOrder).
 * Records the payment and emails this month's pack. Resolves to the pack sent, if any.
 */
export async function fulfillRenewal(invoice: Stripe.Invoice) {
  const details = invoice.parent?.subscription_details;
  const order = orderFromMetadata(details?.metadata);
  const subscription = idOf(details?.subscription);
  const { orderName } = checkoutModel(order);
  console.info('[fulfillment] renewal paid', {
    invoice: invoice.id,
    subscription,
    email: invoice.customer_email,
    plan: orderName,
    amount: invoice.amount_paid,
  });

  if (!invoice.id || !invoice.customer_email || !subscription) {
    console.error('[fulfillment] no email or subscription on invoice', invoice.id);
    return null;
  }
  const pack = renewalPack(order.pack, await renewalNumber(subscription, invoice));
  await recordPurchase({
    kind: 'renewal',
    stripeRef: invoice.id,
    email: invoice.customer_email,
    name: invoice.customer_name,
    customerId: idOf(invoice.customer),
    invoiceId: invoice.id,
    subscriptionId: subscription,
    plan: 'monthly',
    description: `${orderName} · monthly renewal`,
    amountCents: invoice.amount_paid,
    currency: invoice.currency,
    paidAt: invoice.status_transitions?.paid_at,
    packs: [pack],
  });

  // Studio buyers get each new pack unlocked in the studio too, keyed on the invoice so a retry adds nothing.
  if (await hasStudio(invoice.customer_email)) {
    await grantStudioPacks({ email: invoice.customer_email, packs: [pack], ref: invoice.id, livemode: invoice.livemode });
  }

  const { id, customer_email: to } = invoice;
  await sendOnce({ kind: 'invoice', id }, 'renewal', () => sendRenewalEmail({ to, idempotencyKey: `renewal-${id}`, slug: pack }));
  return pack;
}

/** The studio account a studio subscription unlocks: its `studio_email`, else its customer's email. */
async function studioEmailOf(sub: Pick<Stripe.Subscription, 'metadata' | 'customer'>) {
  const meta = sub.metadata?.[STUDIO_EMAIL_KEY];
  if (meta) return meta;
  const customer = await stripe().customers.retrieve(idOf(sub.customer) ?? '').catch(() => null);
  return customer && !customer.deleted ? customer.email?.trim().toLowerCase() ?? null : null;
}

/**
 * Each month the studio subscription renews (not the first: that's fulfillStudio or fulfillStudioSale): records the
 * payment. Nothing to send: the studio simply stays unlocked. Resolves to the studio account email.
 */
export async function fulfillStudioRenewal(invoice: Stripe.Invoice) {
  const details = invoice.parent?.subscription_details;
  const subscription = idOf(details?.subscription);
  const email = details?.metadata?.[STUDIO_EMAIL_KEY] ?? invoice.customer_email;
  console.info('[fulfillment] studio renewal paid', { invoice: invoice.id, subscription, email, amount: invoice.amount_paid });
  if (!invoice.id || !email || !subscription) {
    console.error('[fulfillment] no email or subscription on studio invoice', invoice.id);
    return null;
  }
  await recordPurchase({
    kind: 'renewal',
    stripeRef: invoice.id,
    email,
    name: invoice.customer_name,
    customerId: idOf(invoice.customer),
    invoiceId: invoice.id,
    subscriptionId: subscription,
    plan: 'monthly',
    description: 'FanpageKit Studio · monthly renewal',
    amountCents: invoice.amount_paid,
    currency: invoice.currency,
    paidAt: invoice.status_transitions?.paid_at,
    packs: [],
  });
  return email;
}

/**
 * The studio subscription ended (cancelled, or unpaid after Stripe's retries): the studio unlocks it gave are taken
 * back (revokeStudio), unless another studio subscription for the same account is still live. Resolves to the email.
 */
export async function endStudio(sub: Stripe.Subscription) {
  const email = await studioEmailOf(sub);
  if (!email) {
    console.error('[fulfillment] studio ended but no email for', sub.id);
    return null;
  }
  await revokeStudio(email, sub.start_date);
  return email;
}
