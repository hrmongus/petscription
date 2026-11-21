'use client';

import { EmbeddedCheckout, EmbeddedCheckoutProvider } from '@stripe/react-stripe-js';
import { loadStripe } from '@stripe/stripe-js';
import { useEffect, useState } from 'react';
import { createCheckoutSession } from '@/app/checkout/actions';
import { distinctId, track } from '@/lib/analytics/client';
import type { CheckoutModel, Order } from '@/lib/checkout';

const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
const stripePromise = publishableKey ? loadStripe(publishableKey) : null;

type Session = { key: string; clientSecret?: string; error?: string };

export function PayCard({ order, m }: { order: Order; m: CheckoutModel }) {
  // One Checkout Session per order configuration; changing the order opens a fresh one.
  const key = `${order.pack}|${m.bundleUp ? 1 : 0}|${m.monthly ? 'monthly' : 'once'}`;
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    if (!stripePromise) return;
    let stale = false;
    const failed = (error: string) => track('checkout_error', { pack: order.pack, plan: m.monthly ? 'monthly' : 'once', bundle_up: m.bundleUp, error });
    createCheckoutSession(order, distinctId()).then(
      (res) => {
        if ('error' in res) failed(res.error);
        if (!stale) setSession({ key, ...res });
      },
      () => {
        failed('session request failed');
        if (!stale) setSession({ key, error: 'Could not start checkout. Please refresh and try again.' });
      },
    );
    return () => { stale = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` captures everything in `order`
  }, [key]);

  const current = session?.key === key ? session : null;
  const error = !stripePromise ? 'Payments are not configured yet.' : current?.error;

  return (
    <div className="pay">
      <div className="totals">
        {m.lines.map(([label, price]) => (
          <div className={price.startsWith('−') ? 'row discount' : 'row'} key={label}><span>{label}</span><span>{price}</span></div>
        ))}
        <div className="row due"><span>Due today</span><span>{m.total}</span></div>
      </div>
      {error ? (
        <p className="pay-error" role="alert">{error}</p>
      ) : (
        <div className="stripe-embed" aria-busy={!current?.clientSecret}>
          {current?.clientSecret && stripePromise ? (
            <EmbeddedCheckoutProvider key={current.clientSecret} stripe={stripePromise} options={{ clientSecret: current.clientSecret }}>
              <EmbeddedCheckout />
            </EmbeddedCheckoutProvider>
          ) : (
            <div className="stripe-loading">Loading secure checkout…</div>
          )}
        </div>
      )}
      <p className="fine">{m.renewNote} 30-day money back guarantee. Instant access after payment. Payments by Stripe.</p>
    </div>
  );
}
