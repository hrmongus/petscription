import type Stripe from 'stripe';
import { handleCheckoutCompleted, handleInvoicePaid, handlePaymentFailed, handleSubscriptionChanged, type Deps } from '@/lib/fulfillment';
import { FhbClient } from '@/lib/fhb/client';
import { sendOptionsFromEnv, sendOrderToFhb, supabaseOrderStore } from '@/lib/fhb/send';
import { serverParams } from '@/lib/engine-server';
import { defaultMailer } from '@/lib/email';
import { eventMetadata, isOurs, stripe } from '@/lib/stripe';
import { eventProcessed, markEvent, supabaseStore } from '@/lib/store';
import { fulfillmentEvents } from '@/lib/tracking';

/*
 * Stripe webhook (vzor reference/fanpagekit/app/api/stripe/webhook/route.ts): overenie podpisu, cudzie eventy
 * (iný projekt na tom istom Stripe účte) 200 bez spracovania, idempotencia cez stripe_events + unikátne kľúče,
 * chyba spracovania → 500, aby Stripe event zopakoval.
 */
export const dynamic = 'force-dynamic';

async function deps(): Promise<Deps> {
  const P = serverParams();
  const fhbReady = !!(process.env.FHB_API_URL && process.env.FHB_APP_ID && process.env.FHB_SECRET && process.env.FHB_NOTIFY_TOKEN && process.env.NEXT_PUBLIC_SITE_URL);
  return {
    store: supabaseStore,
    stripe: stripe(),
    cycle: { leadDays: P.reorderLeadDays, shipDays: P.shipDays },
    sendToFhb: fhbReady
      ? async (orderId) => sendOrderToFhb(orderId, { client: FhbClient.fromEnv(), store: await supabaseOrderStore(), options: sendOptionsFromEnv() })
      : undefined,
    mail: await defaultMailer(),
    siteUrl: process.env.NEXT_PUBLIC_SITE_URL,
    adminTo: process.env.ADMIN_EMAIL || null,
    events: await fulfillmentEvents(),
  };
}

export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const signature = req.headers.get('stripe-signature');
  if (!secret || !signature) return new Response('Webhook nie je nastavený', { status: 400 });

  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(await req.text(), signature, secret);
  } catch (err) {
    console.error('[webhook] neplatný podpis', err);
    return new Response('Neplatný podpis', { status: 400 });
  }

  if (!isOurs(eventMetadata(event))) return Response.json({ received: true, ignored: true });

  try {
    if (await eventProcessed(event.id)) return Response.json({ received: true, duplicate: true });
    const d = await deps();
    switch (event.type) {
      case 'checkout.session.completed':
      case 'checkout.session.async_payment_succeeded':
        await handleCheckoutCompleted(event.data.object, d);
        break;
      case 'invoice.paid':
        await handleInvoicePaid(event.data.object, d);
        break;
      case 'invoice.payment_failed':
        await handlePaymentFailed(event.data.object, d);
        break;
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        await handleSubscriptionChanged(event.data.object, d, event.data.previous_attributes as never);
        break;
    }
    await markEvent(event.id, event.type);
  } catch (err) {
    console.error('[webhook] spracovanie zlyhalo', event.type, event.id, err);
    return new Response(`Spracovanie zlyhalo: ${(err as Error).message}`, { status: 500 });
  }
  return Response.json({ received: true });
}
