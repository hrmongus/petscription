/*
 * Nízky sklad (SPEC P2): upozornenie, keď voľné kusy nevydržia STOCK_ALERT_DAYS dní spotreby aktívnych predplatných
 * (dodávateľ má lead time min. 3 týždne → 5 týždňov). Počíta sa z FHB `free_quantity` (voľné, nerezervované kusy),
 * iba bežné produkty (4 kg, 9 kg); sada 18 kg = 2 × 9 kg.
 */
import { skuItems, type BagId } from './engine-server';

export const STOCK_ALERT_DAYS = 35;

type SubLike = { product_id: string; bag_id: string; days_per_bag: number; status: string };

/** spotreba kusov za deň podľa bežného SKU (aktívne a past_due predplatné; pauza a zrušené nie) */
export function dailyUnits(subs: SubLike[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const s of subs) {
    if (!['active', 'past_due'].includes(s.status) || !(s.days_per_bag > 0)) continue;
    const bag = s.bag_id as BagId;
    // sada 18 kg sa skladá z 2 × 9 kg (rovnako ako vo FHB)
    const parts = bag === '18' ? [{ sku: skuItems(s.product_id, '9')[0].sku, qty: 2 }] : skuItems(s.product_id, bag).map((i) => ({ sku: i.sku, qty: i.qty }));
    for (const p of parts) out.set(p.sku, (out.get(p.sku) ?? 0) + p.qty / s.days_per_bag);
  }
  return out;
}

export type StockRow = { sku: string; free: number; perDay: number; threshold: number; coverDays: number | null };

export function lowStock(products: { id: string; free_quantity?: number | null; type?: string | null }[], perDay: Map<string, number>, days = STOCK_ALERT_DAYS): StockRow[] {
  const rows: StockRow[] = [];
  for (const p of products) {
    if (!p.id.startsWith('GRAN-') || p.type === 'multi' || p.id.endsWith('-18')) continue;
    const rate = perDay.get(p.id) ?? 0;
    if (rate <= 0) continue;
    const free = p.free_quantity ?? 0;
    const threshold = Math.ceil(rate * days);
    if (free < threshold) rows.push({ sku: p.id, free, perDay: Math.round(rate * 100) / 100, threshold, coverDays: Math.floor(free / rate) });
  }
  return rows.sort((a, b) => (a.coverDays ?? 0) - (b.coverDays ?? 0));
}
