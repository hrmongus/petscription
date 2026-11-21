/*
 * Úlohy pre Vercel Cron a FHB notifikácie (PROJEKT-1 krok 5, SPEC P2):
 *   syncOrders  – GET /order/history → stavy, tracking, shipped_at/delivered_at otvorených objednávok
 *   retryPaid   – objednávky `paid` (výpadok siete pri odoslaní) → znova do FHB
 *   syncRma     – GET /rma/list → vrátené zásielky (`returned`)
 *   checkStock  – free_quantity vs. spotreba predplatných → interné upozornenie (najviac raz denne)
 * Všetko je idempotentné: opakované spustenie nič nezduplikuje (stav iba dopredu, email_log, audit_log).
 */
import type { Json } from '../database.types';
import { defaultMailer } from '../email';
import { notifyAdmin, notifyFhbError } from '../notify';
import { serverParams } from '../engine-server';
import { dailyUnits, lowStock, STOCK_ALERT_DAYS, type StockRow } from '../stock';
import { stripe } from '../stripe';
import { fhbOrderId, orderNumberFromFhbId } from './build-order';
import { FhbClient, type FhbOrder, type FhbProduct } from './client';
import { sendOptionsFromEnv, sendOrderToFhb, supabaseOrderStore } from './send';
import { applyFhbOrder, supabaseSyncStore, type DbOrder, type SyncDeps, type SyncResult } from './sync';

const DAY = 86_400_000;
const ymd = (d: Date) => d.toISOString().slice(0, 10);

export type JobDeps = SyncDeps & { fhb: FhbClient; adminTo?: string | null };

export async function jobDepsFromEnv(): Promise<JobDeps> {
  const P = serverParams();
  return {
    fhb: FhbClient.fromEnv(),
    store: await supabaseSyncStore(),
    stripe: stripe(),
    cycle: { leadDays: P.reorderLeadDays, shipDays: P.shipDays },
    mail: await defaultMailer(),
    adminTo: process.env.ADMIN_EMAIL || null,
  };
}

async function db() {
  return (await import('../db')).db();
}

/* ---------------------------------------------------------------- stavy objednávok */

const OPEN = ['sent_to_fhb', 'confirmed', 'sent'];

export async function syncOrders(deps: JobDeps, opts: { days?: number } = {}): Promise<SyncResult[]> {
  const now = deps.now?.() ?? new Date();
  const since = new Date(now.getTime() - (opts.days ?? 60) * DAY);
  const { data: open, error } = await (await db()).from('orders').select('*').in('status', OPEN).gte('created_at', since.toISOString()).order('created_at');
  if (error) throw new Error(error.message);
  if (!open?.length) return [];

  // FHB filtruje históriu podľa dátumu vytvorenia → od najstaršej otvorenej objednávky
  const from = ymd(new Date(new Date(open[0].created_at).getTime() - DAY));
  const byNumber = new Map<number, FhbOrder>();
  for (let page = 1; page <= 50; page++) {
    const r = await deps.fhb.orderHistory({ from, page });
    for (const f of r.orders ?? []) {
      const n = orderNumberFromFhbId(String(f.id));
      if (n) byNumber.set(n, f);
    }
    if (!r.orders?.length || page * 100 >= (r.total ?? 0)) break;
  }

  const results: SyncResult[] = [];
  let lookups = 0;
  for (const o of open as DbOrder[]) {
    let f = byNumber.get(o.number) ?? null;
    if (!f && lookups < 20) {
      lookups++;
      f = await deps.fhb.getOrder(fhbOrderId(o.number)).catch(() => null);
    }
    if (!f) continue;
    const r = await applyFhbOrder(o, f, deps).catch((e) => {
      console.error('[cron] sync objednávky zlyhal', o.number, e);
      return null;
    });
    if (r?.changed.length) results.push(r);
  }
  return results;
}

/* ---------------------------------------------------------------- znova odoslať `paid` */

export async function retryPaid(deps: JobDeps): Promise<{ number: number; state: string }[]> {
  const cutoff = new Date((deps.now?.() ?? new Date()).getTime() - 5 * 60_000).toISOString();
  const { data, error } = await (await db()).from('orders').select('id, number').eq('status', 'paid').lte('created_at', cutoff).limit(50);
  if (error) throw new Error(error.message);
  const out: { number: number; state: string }[] = [];
  const store = await supabaseOrderStore();
  for (const o of data ?? []) {
    try {
      const r = await sendOrderToFhb(o.id, { client: deps.fhb, store, options: sendOptionsFromEnv() });
      out.push({ number: o.number, state: r.state });
      if (r.state === 'fhb_error') await notifyFhbError(deps, o, r.error);
    } catch (e) {
      out.push({ number: o.number, state: `retry: ${(e as Error).message}` });
    }
  }
  return out;
}

/* ---------------------------------------------------------------- vrátené zásielky */

export async function syncRma(deps: JobDeps, opts: { days?: number } = {}): Promise<SyncResult[]> {
  const now = deps.now?.() ?? new Date();
  const from = ymd(new Date(now.getTime() - (opts.days ?? 60) * DAY));
  const items: FhbOrder[] = [];
  for (let page = 1; page <= 20; page++) {
    const r = await deps.fhb.rmaList({ from, page });
    items.push(...(r.items ?? []));
    if (!r.items?.length || page * 100 >= (r.total ?? 0)) break;
  }
  const numbers = items.map((f) => orderNumberFromFhbId(String(f.id))).filter((n): n is number => !!n);
  if (!numbers.length) return [];
  const { data, error } = await (await db()).from('orders').select('*').in('number', numbers);
  if (error) throw new Error(error.message);
  const results: SyncResult[] = [];
  for (const o of (data ?? []) as DbOrder[]) {
    const f = items.find((x) => orderNumberFromFhbId(String(x.id)) === o.number)!;
    const r = await applyFhbOrder(o, { ...f, returned_at: (f as { returned_at?: string | null }).returned_at ?? new Date().toISOString() } as FhbOrder, deps);
    if (r.changed.length) {
      results.push(r);
      if (r.to === 'returned' && r.from !== 'returned') {
        await notifyAdmin(deps.mail, deps.adminTo, {
          key: `admin-returned:${o.id}`,
          kind: 'admin_returned',
          subject: `Vrátená zásielka, objednávka ${o.number}`,
          lines: [`Objednávka ${o.number} sa vrátila od dopravcu (${(f as { return_type?: string }).return_type ?? 'return'}).`, 'Treba rozhodnúť: refund alebo opätovné odoslanie (admin, P3).'],
        });
      }
    }
  }
  return results;
}

/* ---------------------------------------------------------------- sklad */

export async function checkStock(deps: JobDeps, opts: { only?: string[] } = {}): Promise<StockRow[]> {
  const products: FhbProduct[] = [];
  for (let page = 1; page <= 20; page++) {
    const r = await deps.fhb.listProducts(page);
    products.push(...(r.products ?? []));
    if (!r.products?.length || page * 100 >= (r.total ?? 0)) break;
  }
  const { data: subs, error } = await (await db()).from('subscriptions').select('product_id, bag_id, days_per_bag, status').in('status', ['active', 'past_due']);
  if (error) throw new Error(error.message);
  let low = lowStock(products as { id: string; free_quantity?: number; type?: string }[], dailyUnits(subs ?? []));
  if (opts.only?.length) low = low.filter((r) => opts.only!.includes(r.sku));
  if (!low.length) return [];
  const day = ymd(deps.now?.() ?? new Date());
  for (const r of low) {
    await deps.store.audit({ actor: 'system', action: 'stock.low', entity: 'product', entity_id: `${r.sku}:${day}`, after: r as unknown as Json });
  }
  await notifyAdmin(deps.mail, deps.adminTo, {
    key: `admin-stock-low:${day}:${low.map((r) => r.sku).join(',')}`,
    kind: 'admin_stock_low',
    subject: `Nízky sklad (${low.length} ${low.length === 1 ? 'produkt' : 'produkty'})`,
    lines: [
      `Voľné kusy nevydržia ${STOCK_ALERT_DAYS} dní spotreby predplatných (dodávateľ min. 3 týždne):`,
      ...low.map((r) => `${r.sku}: voľných ${r.free} ks, spotreba ${r.perDay} ks/deň, vydrží ~${r.coverDays} dní (hranica ${r.threshold} ks)`),
    ],
  });
  return low;
}

