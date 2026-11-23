import type Stripe from 'stripe';
import {
  trackOrderPaid, trackPaymentFailed, trackRenewal, trackStudioCancelled, trackStudioPacksPaid, trackStudioRenewal, trackStudioSalePaid,
  trackStudioUpsellPaid, trackSubscriptionCancelled, trackUpsellPaid,
} from '@/lib/analytics/server';
import { upsellIdOf } from '@/lib/checkout';
import { endStudio, fulfillOrder, fulfillRenewal, fulfillStudioPacks, fulfillStudioRenewal, fulfillStudioSale, fulfillUpsell } from '@/lib/fulfillment';
import { klaviyoOrderPaid, klaviyoStudioPacksPaid, klaviyoStudioSalePaid, klaviyoStudioUpsellPaid, klaviyoUpsellPaid } from '@/lib/klaviyo';
import { paidPacks, STUDIO_PACKS_KIND } from '@/lib/studio-packs';
import { isStudioSale } from '@/lib/studio-sale';
import { isStudioSubscription } from '@/lib/studio-subscription';
import { idOf, isOurs, stripe } from '@/lib/stripe';

export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const signature = req.headers.get('stripe-signature');
  if (!secret || !signature) return new Response('Webhook not configured', { status: 400 });

  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(await req.text(), signature, secret);
  } catch (err) {
    console.error('[webhook] signature verification failed', err);
    return new Response('Invalid signature', { status: 400 });
  }

  // The Stripe account is shared, so every project's events arrive here. 200 so Stripe doesn't retry them.
  const metadata = event.type.startsWith('invoice.')
    ? (event.data.object as Stripe.Invoice).parent?.subscription_details?.metadata
    : (event.data.object as { metadata?: Stripe.Metadata | null }).metadata;
  if (!isOurs(metadata)) return Response.json({ received: true, ignored: true });

  try {
    switch (event.type) {
      case 'checkout.session.completed':
      case 'checkout.session.async_payment_succeeded': {
        const session = event.data.object;
        if (session.payment_status === 'unpaid') break;
        // The pack offer after /studio: fulfilled from its PaymentIntent below, whichever way it was paid.
        if (session.metadata?.kind === STUDIO_PACKS_KIND) break;
        if (session.metadata?.kind === 'upsell') await fulfillUpsell(session.metadata.upsell_for ?? '', session.id, upsellIdOf(session.metadata));
        else if (isStudioSale(session)) {
          // The studio bought on its own from an email link (/studio). PostHog and Klaviyo only, never Meta.
          const { email, packs } = await fulfillStudioSale(session);
          if (!(await trackStudioSalePaid(session, packs, email))) throw new Error('analytics not delivered');
          await klaviyoStudioSalePaid(session, packs);
        } else {
          await fulfillOrder(session);
          // After fulfillment, so a failed run that Stripe retries isn't counted twice.
          if (!(await trackOrderPaid(session))) throw new Error('analytics not delivered');
          // Marks the buyer in Klaviyo so drop-off flows skip them. Idempotent; a failure throws so Stripe retries.
          await klaviyoOrderPaid(session);
        }
        break;
      }
      case 'payment_intent.succeeded': {
        // A one-click upsell charge has no Checkout Session. /upsell and /studio-offer fulfill it right away; this
        // retries it if that failed. `upsell` says which one it is (more_packs or studio).
        if (event.data.object.metadata?.kind === STUDIO_PACKS_KIND) {
          // The packs bought after the studio on /studio. PostHog and Klaviyo only, never Meta.
          const pi = event.data.object;
          const { email, session } = await fulfillStudioPacks(pi);
          if (!(await trackStudioPacksPaid(pi, paidPacks(pi.metadata), email))) throw new Error('analytics not delivered');
          await klaviyoStudioPacksPaid(pi, session, paidPacks(pi.metadata));
          break;
        }
        const upsellFor = event.data.object.metadata?.upsell_for;
        if (upsellFor) {
          const studioPacks = await fulfillUpsell(upsellFor, event.data.object.id, upsellIdOf(event.data.object.metadata));
          // Every upsell (one-click or by card) ends here exactly once; upsell Checkout Sessions aren't counted.
          if (!(await trackUpsellPaid(event.data.object, studioPacks ?? []))) throw new Error('analytics not delivered');
          await klaviyoUpsellPaid(event.data.object);
        }
        break;
      }
      case 'invoice.paid': {
        const invoice = event.data.object;
        const details = invoice.parent?.subscription_details;
        if (isStudioSubscription(details?.metadata)) {
          // The studio subscription (lib/studio-subscription.ts). Its first month: the upsell's is fulfilled and
          // counted here, whichever way it was paid (the /studio sale's is from checkout.session.completed).
          if (invoice.billing_reason === 'subscription_create' && details?.metadata?.upsell_for) {
            const sub = await stripe().subscriptions.retrieve(idOf(details.subscription) ?? '');
            const studioPacks = await fulfillUpsell(details.metadata.upsell_for, invoice.id ?? sub.id, 'studio');
            if (!(await trackStudioUpsellPaid(sub, invoice, studioPacks ?? []))) throw new Error('analytics not delivered');
            await klaviyoStudioUpsellPaid(sub, invoice);
          } else if (invoice.billing_reason === 'subscription_cycle') {
            const email = await fulfillStudioRenewal(invoice);
            if (email && !(await trackStudioRenewal(invoice, email))) throw new Error('analytics not delivered');
          }
          break;
        }
        // The monthly pack plan. The first month is fulfilled from checkout.session.completed; this covers every renewal after it.
        if (invoice.billing_reason === 'subscription_cycle') {
          const deliveredPack = await fulfillRenewal(event.data.object);
          if (!(await trackRenewal(event.data.object, deliveredPack))) throw new Error('analytics not delivered');
        }
        break;
      }
      case 'invoice.payment_failed':
        console.warn('[webhook]', event.type, event.data.object.id);
        await trackPaymentFailed(event.data.object);
        break;
      case 'customer.subscription.deleted': {
        console.warn('[webhook]', event.type, event.data.object.id);
        const sub = event.data.object;
        if (isStudioSubscription(sub.metadata)) {
          // The studio ended: its unlocks are taken back. Throws so Stripe retries a failed revoke.
          const email = await endStudio(sub);
          await trackStudioCancelled(sub, email);
        } else {
          await trackSubscriptionCancelled(sub);
        }
        break;
      }
      case 'checkout.session.async_payment_failed':
        console.warn('[webhook]', event.type, event.data.object.id);
        break;
    }
  } catch (err) {
    // 500 makes Stripe retry: fulfillment is idempotent and sendEventOnce skips events already sent. The signature is already verified, so the reason is safe to show in the dashboard.
    console.error('[webhook] fulfillment failed', event.type, event.id, err);
    return new Response(`Fulfillment failed: ${(err as Error).message}`, { status: 500 });
  }

  return Response.json({ received: true });
}
