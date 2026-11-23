import { db } from '@lib/db';
import type { FhbProduct } from '@lib/fhb/client';
import { dailyUnits, stockRows } from '@lib/stock';
import { fhb } from './deps';

/** Sklad z FHB (free_quantity, stock_quantity) + spotreba aktívnych predplatných (rovnaký výpočet ako cron fhb-stock). */
export async function liveStock() {
  const products: FhbProduct[] = [];
  const client = fhb();
  for (let page = 1; page <= 20; page++) {
    const r = await client.listProducts(page);
    products.push(...(r.products ?? []));
    if (!r.products?.length || page * 100 >= (r.total ?? 0)) break;
  }
  const { data: subs, error } = await db().from('subscriptions').select('product_id, bag_id, days_per_bag, status').in('status', ['active', 'past_due']);
  if (error) throw new Error(error.message);
  const rows = stockRows(products as { id: string; free_quantity?: number; type?: string }[], dailyUnits(subs ?? []));
  const total = new Map(products.map((p) => [p.id, (p as { stock_quantity?: number }).stock_quantity ?? null]));
  return rows.map((r) => ({ ...r, stock: total.get(r.sku) ?? null })).sort((a, b) => a.sku.localeCompare(b.sku));
}
