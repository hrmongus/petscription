import { db } from './db';
import { defaultMailer } from './email';
import { FhbClient, fhbConfigFromEnv } from './fhb/client';
import { cancel } from './subscription-schedule';
import type { WithdrawalDeps, WithdrawalStore } from './withdrawal';

/* Supabase úložisko a závislosti pre lib/withdrawal.ts (service role, iba server). */

const one = async <T>(p: PromiseLike<{ data: T | null; error: { message: string } | null }>) => {
  const { data, error } = await p;
  if (error) throw new Error(error.message);
  return data;
};
const ok = async (p: PromiseLike<{ error: { message: string } | null }>) => {
  const { error } = await p;
  if (error) throw new Error(error.message);
};

export const supabaseWithdrawalStore: WithdrawalStore = {
  findOrderByNumber: (n) => one(db().from('orders').select('*').eq('number', n).maybeSingle()),
  getCustomer: (id) => one(db().from('customers').select('id, email, name').eq('id', id).maybeSingle()),
  getSubscription: (id) => one(db().from('subscriptions').select('*').eq('id', id).maybeSingle()),
  ordersOfSubscription: async (id) => (await one(db().from('orders').select('*').eq('subscription_id', id).order('number'))) ?? [],
  recentByEmail: async (email, since) =>
    (await one(db().from('withdrawals').select('*').ilike('email', email.replace(/[\\%_]/g, (c) => `\\${c}`)).gte('submitted_at', since.toISOString()).order('submitted_at', { ascending: false }))) ?? [],
  insertWithdrawal: async (row) => (await one(db().from('withdrawals').insert(row).select('*').single()))!,
  updateWithdrawal: (id, patch) => ok(db().from('withdrawals').update(patch).eq('id', id)),
  updateOrder: (id, patch) => ok(db().from('orders').update(patch).eq('id', id)),
  updateSubscription: (id, patch) => ok(db().from('subscriptions').update(patch).eq('id', id)),
  audit: (row) => ok(db().from('audit_log').insert(row)),
};

function fhbOrNull() {
  try {
    fhbConfigFromEnv();
    return FhbClient.fromEnv();
  } catch {
    return null;
  }
}

export async function withdrawalDepsFromEnv(): Promise<WithdrawalDeps> {
  return {
    store: supabaseWithdrawalStore,
    cancelSubscription: (id) => cancel(id, 'now'),
    fhb: fhbOrNull(),
    mail: await defaultMailer(),
    adminTo: process.env.ADMIN_EMAIL || null,
    siteUrl: process.env.NEXT_PUBLIC_SITE_URL || 'https://www.granula.sk',
  };
}
