/*
 * Stav objednávky z FHB → náš DB (SPEC P2, PROJEKT-1 krok 5). Spoločné pre notifikácie (/api/fhb/notify) aj cron.
 *
 *   FHB pending/new/imported → sent_to_fhb · confirmed/packed/… → confirmed · sent (shipped_at) → sent ·
 *   delivered (delivered_at) → delivered · returned (returned_at) → returned · rejected → fhb_error
 *
 * Stav sa mení iba dopredu (paid < sent_to_fhb/fhb_error < confirmed < sent < delivered < returned); cancelled a
 * refunded sa nemenia. Pri prechode na `sent` → email s trackingom; pri `delivered` → last_delivered_at a pri prvej
 * objednávke predplatného prepočet prvého obnovenia podľa skutočného dňa doručenia (SPEC §1).
 * Notifikácii FHB sa neverí: stav sa vždy berie z GET /order alebo /order/history.
 */
import type Stripe from 'stripe';
import type { Json, Tables, TablesUpdate } from '../database.types';
import type { Mailer } from '../email';
import { shippedEmail } from '../emails';
import { moveNextCharge, recomputeOnDelivery, type CycleParams } from '../subscription-schedule';
import type { FhbOrder } from './client';

export type DbOrder = Tables<'orders'>;
export type DbSubscription = Tables<'subscriptions'>;

export type SyncStore = {
  updateOrder(id: string, patch: TablesUpdate<'orders'>): Promise<void>;
  getSubscription(id: string): Promise<DbSubscription | null>;
  updateSubscription(id: string, patch: TablesUpdate<'subscriptions'>): Promise<void>;
  getCustomer(id: string): Promise<{ email: string; name: string | null } | null>;
  audit(row: { actor: string; action: string; entity: string; entity_id: string | null; before?: Json; after?: Json }): Promise<void>;
};

export type SyncDeps = {
  store: SyncStore;
  stripe: Stripe;
  cycle: CycleParams;
  mail?: Mailer;
  now?: () => Date;
};

const RANK: Record<string, number> = { paid: 0, sent_to_fhb: 1, fhb_error: 1, confirmed: 2, sent: 3, delivered: 4, returned: 5 };
const FINAL = new Set(['cancelled', 'refunded']);
const QUEUED = new Set(['pending', 'new', 'imported', 'b2b_new']);

type FhbView = FhbOrder & {
  shipped_at?: string | null;
  delivered_at?: string | null;
  returned_at?: string | null;
  return_type?: string | null;
  tracking_numbers?: string[] | null;
  tracking_links?: string[] | null;
};

/** Cieľový stav v našej DB podľa FHB objednávky (null = nevieme / bez zmeny). */
export function targetStatus(f: FhbView): string | null {
  const st = String(f.status ?? '').toLowerCase();
  if (f.returned_at || st === 'returned') return 'returned';
  if (f.delivered_at || st === 'delivered') return 'delivered';
  if (st === 'rejected') return 'fhb_error';
  if (f.shipped_at || st === 'sent' || st === 'shipped') return 'sent';
  if (QUEUED.has(st)) return 'sent_to_fhb';
  if (st) return 'confirmed'; // confirmed, packed, picking… = FHB už objednávku spracúva
  return null;
}

const sameJson = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const iso = (s: string | null | undefined) => (s ? new Date(s).toISOString() : null);
const sameTime = (a: string | null | undefined, b: string | null | undefined) => iso(a) === iso(b);

export type SyncResult = { orderId: string; number: number; from: string; to: string; changed: string[] };

export async function applyFhbOrder(o: DbOrder, f: FhbView, deps: SyncDeps): Promise<SyncResult> {
  const res: SyncResult = { orderId: o.id, number: o.number, from: o.status, to: o.status, changed: [] };
  if (FINAL.has(o.status)) return res;
  const patch: TablesUpdate<'orders'> = {};

  const tracking = { numbers: f.tracking_numbers ?? [], links: f.tracking_links ?? [] };
  if ((tracking.numbers.length || tracking.links.length) && !sameJson(o.tracking, tracking)) patch.tracking = tracking as unknown as Json;
  if (f.shipped_at && !sameTime(o.shipped_at, f.shipped_at)) patch.shipped_at = iso(f.shipped_at);
  if (f.delivered_at && !sameTime(o.delivered_at, f.delivered_at)) patch.delivered_at = iso(f.delivered_at);

  const target = targetStatus(f);
  const rejected = target === 'fhb_error' && ['sent_to_fhb', 'confirmed'].includes(o.status);
  if (target && (rejected || (target !== 'fhb_error' && (RANK[target] ?? -1) > (RANK[o.status] ?? -1)))) {
    patch.status = target;
    if (target === 'fhb_error') patch.fhb_error = { status: 'rejected', message: 'FHB objednávku zamietol (rejected)', at: new Date().toISOString() } as Json;
  }

  res.changed = Object.keys(patch);
  if (!res.changed.length) return res;
  await deps.store.updateOrder(o.id, patch);
  res.to = patch.status ?? o.status;
  if (patch.status) {
    await deps.store.audit({ actor: 'system', action: `order.status.${patch.status}`, entity: 'order', entity_id: o.id, before: { status: o.status } as Json, after: { status: patch.status, fhb_status: f.status, return_type: f.return_type ?? null } as Json });
  }

  // zásielka odoslaná → email s trackingom (iba pri prechode na sent; pri skoku rovno na delivered už nie)
  if (patch.status === 'sent' && deps.mail) {
    const c = await deps.store.getCustomer(o.customer_id);
    const to = c?.email ?? (o.ship_to as { email?: string }).email;
    if (to) {
      await deps
        .mail(shippedEmail({ order: o, to, name: c?.name ?? (o.ship_to as { name?: string }).name, trackingLinks: tracking.links, trackingNumbers: tracking.numbers }))
        .catch((e) => console.error('[fhb-sync] email zásielka odoslaná zlyhal', o.id, e));
    }
  }

  // doručené → last_delivered_at; pri prvej objednávke prepočet prvého obnovenia
  if (patch.delivered_at && o.subscription_id) await onDelivered(o, new Date(patch.delivered_at), deps);
  return res;
}

async function onDelivered(o: DbOrder, deliveredAt: Date, deps: SyncDeps) {
  const sub = await deps.store.getSubscription(o.subscription_id!);
  if (!sub) return;
  const subPatch: TablesUpdate<'subscriptions'> = {};
  if (!sub.last_delivered_at || new Date(sub.last_delivered_at) < deliveredAt) subPatch.last_delivered_at = deliveredAt.toISOString();
  if (o.kind === 'first' && sub.status === 'active' && sub.stripe_subscription_id && sub.next_charge_at) {
    const next = recomputeOnDelivery({ current: new Date(sub.next_charge_at), deliveredAt, days: sub.days_per_bag, ...deps.cycle, now: deps.now?.() });
    if (next) {
      await moveNextCharge(sub.stripe_subscription_id, next, deps.stripe);
      subPatch.next_charge_at = next.toISOString();
      await deps.store.audit({ actor: 'system', action: 'subscription.first_renewal_recomputed', entity: 'subscription', entity_id: sub.id, before: { next_charge_at: sub.next_charge_at } as Json, after: { next_charge_at: subPatch.next_charge_at, delivered_at: deliveredAt.toISOString(), order: o.number } as Json });
    }
  }
  if (Object.keys(subPatch).length) await deps.store.updateSubscription(sub.id, subPatch);
}

/** SyncStore nad Supabase (service role) */
export async function supabaseSyncStore(): Promise<SyncStore> {
  const { db } = await import('../db');
  const { supabaseStore } = await import('../store');
  const ok = (r: { error: { message: string } | null }) => {
    if (r.error) throw new Error(r.error.message);
  };
  return {
    updateOrder: async (id, patch) => ok(await db().from('orders').update(patch).eq('id', id)),
    getSubscription: async (id) => {
      const r = await db().from('subscriptions').select('*').eq('id', id).maybeSingle();
      ok(r);
      return r.data;
    },
    updateSubscription: async (id, patch) => ok(await db().from('subscriptions').update(patch).eq('id', id)),
    getCustomer: async (id) => {
      const r = await db().from('customers').select('email, name').eq('id', id).maybeSingle();
      ok(r);
      return r.data;
    },
    audit: (row) => supabaseStore.audit(row),
  };
}
