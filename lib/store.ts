import { db } from './db';
import type { Tables, TablesInsert } from './database.types';
import type { Store } from './fulfillment';

/*
 * Supabase úložisko pre lib/fulfillment.ts a /api/checkout (service role, iba server).
 * Idempotentné vkladanie: pri konflikte unikátneho kľúča vráti existujúci riadok.
 */

const one = async <T>(p: PromiseLike<{ data: T | null; error: { message: string } | null }>) => {
  const { data, error } = await p;
  if (error) throw new Error(error.message);
  return data;
};

export const supabaseStore: Store = {
  getCustomer: (id) => one(db().from('customers').select('*').eq('id', id).maybeSingle()),
  getDog: (id) => one(db().from('dogs').select('*').eq('id', id).maybeSingle()),
  getAddress: (id) => one(db().from('addresses').select('*').eq('id', id).maybeSingle()),
  findSubscriptionByStripeId: (sid) => one(db().from('subscriptions').select('*').eq('stripe_subscription_id', sid).maybeSingle()),
  async insertSubscription(row) {
    const existing = row.stripe_subscription_id ? await supabaseStore.findSubscriptionByStripeId(row.stripe_subscription_id) : null;
    if (existing) return existing;
    const { data, error } = await db().from('subscriptions').insert(row).select('*').single();
    if (error?.code === '23505' && row.stripe_subscription_id) return (await supabaseStore.findSubscriptionByStripeId(row.stripe_subscription_id))!;
    if (error) throw new Error(error.message);
    return data;
  },
  async updateSubscription(id, patch) {
    const { error } = await db().from('subscriptions').update(patch).eq('id', id);
    if (error) throw new Error(error.message);
  },
  async insertOrder(row) {
    const find = () => one(db().from('orders').select('*').eq('stripe_ref', row.stripe_ref).maybeSingle());
    const existing = await find();
    if (existing) return { order: existing, created: false };
    const { data, error } = await db().from('orders').insert(row).select('*').single();
    if (error?.code === '23505') return { order: (await find())!, created: false };
    if (error) throw new Error(error.message);
    return { order: data, created: true };
  },
  async audit(row) {
    let q = db().from('audit_log').select('id').eq('action', row.action).eq('entity', row.entity);
    q = row.entity_id ? q.eq('entity_id', row.entity_id) : q.is('entity_id', null);
    if (await one(q.limit(1).maybeSingle())) return;
    const { error } = await db().from('audit_log').insert(row);
    if (error) throw new Error(error.message);
  },
};

/* ---------------------------------------------------------------- draft pri /api/checkout */

/** zákazník podľa e-mailu (malými písmenami); meno a telefón sa aktualizujú */
export async function upsertCustomer(c: { email: string; name: string; phone: string }) {
  const email = c.email.toLowerCase();
  const existing = await one<Tables<'customers'>>(db().from('customers').select('*').eq('email', email).maybeSingle());
  if (existing) {
    await one(db().from('customers').update({ name: c.name, phone: c.phone }).eq('id', existing.id).select('id').single());
    return { ...existing, name: c.name, phone: c.phone };
  }
  const { data, error } = await db().from('customers').insert({ email, name: c.name, phone: c.phone }).select('*').single();
  if (error?.code === '23505') return (await one(db().from('customers').select('*').eq('email', email).single()))!;
  if (error) throw new Error(error.message);
  return data;
}

export async function setStripeCustomer(customerId: string, stripeCustomerId: string) {
  await one(db().from('customers').update({ stripe_customer_id: stripeCustomerId }).eq('id', customerId).select('id').single());
}

export async function insertDog(row: TablesInsert<'dogs'>) {
  return (await one<Tables<'dogs'>>(db().from('dogs').insert(row).select('*').single()))!;
}

export async function insertAddress(row: TablesInsert<'addresses'>) {
  return (await one<Tables<'addresses'>>(db().from('addresses').insert(row).select('*').single()))!;
}

/** objednávka podľa Checkout Session (stránka Hotovo) */
export async function orderByStripeRef(ref: string) {
  return one<Pick<Tables<'orders'>, 'number' | 'kind' | 'status'>>(db().from('orders').select('number, kind, status').eq('stripe_ref', ref).maybeSingle());
}

/* ---------------------------------------------------------------- idempotencia webhookov */

export async function eventProcessed(eventId: string) {
  return !!(await one(db().from('stripe_events').select('event_id').eq('event_id', eventId).maybeSingle()));
}

export async function markEvent(eventId: string, type: string) {
  const { error } = await db().from('stripe_events').insert({ event_id: eventId, type });
  if (error && error.code !== '23505') throw new Error(error.message);
}
