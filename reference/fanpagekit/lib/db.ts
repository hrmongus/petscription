import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

/*
 * Supabase (Postgres) for buyers, transactions and purchased packs — see supabase/migrations. Server-only: it
 * uses the secret key, which bypasses RLS, so never import this from a client component.
 *
 * Without SUPABASE_URL / SUPABASE_SECRET_KEY purchases are only logged in development; in production it throws,
 * so the Stripe webhook answers 500 and retries until it's configured.
 */

let client: SupabaseClient<Database> | null = null;

function db() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) {
    if (process.env.NODE_ENV === 'production') throw new Error('[db] SUPABASE_URL / SUPABASE_SECRET_KEY not set — purchase not recorded');
    return null;
  }
  client ??= createClient<Database>(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return client;
}

export type Purchase = {
  kind: 'order' | 'upsell' | 'renewal';
  /** Idempotency key: the Checkout Session (order), PaymentIntent (upsell) or Invoice (renewal) id. */
  stripeRef: string;
  email: string;
  name?: string | null;
  customerId?: string | null;
  checkoutSessionId?: string | null;
  paymentIntentId?: string | null;
  invoiceId?: string | null;
  subscriptionId?: string | null;
  plan?: 'once' | 'monthly' | null;
  description: string;
  amountCents: number;
  currency: string;
  /** Unix seconds, as Stripe gives it. */
  paidAt?: number | null;
  /** Pack slugs this payment unlocked (never 'bundle' — the four packs individually). */
  packs: string[];
};

/** Upserts the buyer and records the payment and its packs, once per stripeRef. Returns the transaction id. */
export async function recordPurchase(p: Purchase) {
  const supabase = db();
  if (!supabase) {
    console.warn('[db] SUPABASE_URL / SUPABASE_SECRET_KEY not set — not recorded:', p.kind, p.stripeRef);
    return null;
  }
  // Optional fields left undefined are omitted, so the function defaults them to null.
  const { data, error } = await supabase.rpc('record_purchase', {
    p_email: p.email,
    p_name: p.name ?? undefined,
    p_stripe_customer_id: p.customerId ?? undefined,
    p_kind: p.kind,
    p_stripe_ref: p.stripeRef,
    p_checkout_session_id: p.checkoutSessionId ?? undefined,
    p_payment_intent_id: p.paymentIntentId ?? undefined,
    p_invoice_id: p.invoiceId ?? undefined,
    p_subscription_id: p.subscriptionId ?? undefined,
    p_plan: p.plan ?? undefined,
    p_description: p.description,
    p_amount_cents: p.amountCents,
    p_currency: p.currency,
    p_paid_at: p.paidAt ? new Date(p.paidAt * 1000).toISOString() : undefined,
    p_packs: p.packs,
  });
  if (error) throw new Error(`[db] record_purchase failed for ${p.stripeRef}: ${error.message}`);
  console.info('[db] recorded', p.kind, p.stripeRef, '→', data);
  return data;
}

/**
 * Sends a server-side analytics event at most once per `key`, however often Stripe redelivers the webhook:
 * claims the key in analytics_events first, so only the first delivery sends; a failed send releases the claim
 * so a later retry can try again. `send` resolves to whether the event was delivered, and so does this: false means
 * the caller should fail the webhook so Stripe redelivers it.
 *
 * Without a database (dev) or if the claim itself fails, it sends anyway: a rare duplicate beats a lost purchase.
 */
export async function sendEventOnce(key: string, send: () => Promise<boolean>): Promise<boolean> {
  let supabase: SupabaseClient<Database> | null = null;
  try {
    supabase = db();
  } catch {
    // production without Supabase config — handled like a failed claim below
  }
  if (supabase) {
    const { data, error } = await supabase
      .from('analytics_events')
      .upsert({ event_key: key }, { onConflict: 'event_key', ignoreDuplicates: true })
      .select('event_key');
    if (!error && !data.length) {
      console.info('[analytics] already sent, skipping', key);
      return true;
    }
    if (error) {
      console.error('[analytics] could not claim event, sending anyway', key, error.message);
      supabase = null;
    }
  }
  const sent = await send().catch((err) => {
    console.error('[analytics] send failed', key, err);
    return false;
  });
  if (!sent && supabase) {
    const { error } = await supabase.from('analytics_events').delete().eq('event_key', key);
    if (error) console.error('[analytics] could not release claim', key, error.message);
  }
  return sent;
}

/**
 * Every pack these addresses bought here (orders, upsells, renewals), as slugs. For the studio sold on its own
 * (fulfillStudioSale), which unlocks what the buyer already owns. Without a database, none.
 */
export async function packsOwnedBy(emails: string[]): Promise<string[]> {
  const supabase = db();
  const list = [...new Set(emails.map((e) => e.trim().toLowerCase()).filter(Boolean))];
  if (!supabase || !list.length) return [];
  const { data: users, error } = await supabase.from('users').select('id').in('email', list);
  if (error) throw new Error(`[db] buyer lookup failed: ${error.message}`);
  if (!users?.length) return [];
  const { data: kits, error: kitsError } = await supabase.from('purchased_kits').select('pack_slug').in('user_id', users.map((u) => u.id));
  if (kitsError) throw new Error(`[db] pack lookup failed: ${kitsError.message}`);
  return [...new Set((kits ?? []).map((k) => k.pack_slug))];
}

/** Whether this address has a payment recorded under `description` (e.g. the studio sold on its own). */
export async function boughtByDescription(email: string, description: string): Promise<boolean> {
  const supabase = db();
  if (!supabase) return false;
  const { data: user, error } = await supabase.from('users').select('id').eq('email', email.trim().toLowerCase()).maybeSingle();
  if (error) throw new Error(`[db] buyer lookup failed: ${error.message}`);
  if (!user) return false;
  const { count, error: txError } = await supabase.from('transactions').select('id', { count: 'exact', head: true }).eq('user_id', user.id).eq('description', description);
  if (txError) throw new Error(`[db] transaction lookup failed: ${txError.message}`);
  return Boolean(count);
}
