import type Stripe from 'stripe';
import { checkoutModel, type Order } from './checkout';
import { cents, checkoutBase, orderMetadata, type Flow } from './stripe';

/*
 * Monthly plan: a plain Stripe subscription. The first month is charged at checkout, then it renews on the
 * same day every month until cancelled (Terms §3.3). No one-time items, trials or billing anchors.
 */

/**
 * The recurring Price: STRIPE_PRICE_MONTHLY_PACK (PRICES.packMonthly a month). Without it (local development) an inline price is used,
 * which creates a throwaway Product per checkout.
 */
function monthlyPrice(amount: number): Stripe.Checkout.SessionCreateParams.LineItem {
  const id = process.env.STRIPE_PRICE_MONTHLY_PACK;
  if (id) return { price: id, quantity: 1 };
  console.warn('[subscription] STRIPE_PRICE_MONTHLY_PACK not set — using an inline price');
  return {
    quantity: 1,
    price_data: {
      currency: 'usd',
      unit_amount: cents(amount),
      recurring: { interval: 'month' },
      product_data: { name: 'FanpageKit — A new pack every month' },
    },
  };
}

/** One pack a month. The four-pack bundle is one-time only, so parseOrder never pairs it with this plan. */
export function subscriptionSessionParams(order: Order, siteUrl: string, flow: Flow): Stripe.Checkout.SessionCreateParams {
  const m = checkoutModel(order);
  return {
    ...checkoutBase(order, siteUrl, flow),
    mode: 'subscription',
    line_items: [monthlyPrice(m.dueToday)],
    subscription_data: {
      // The pack they picked is month one; renewals read the plan from here.
      description: `A new pack every month — starting with ${m.sel.name}`,
      metadata: orderMetadata(order, flow),
    },
  };
}
