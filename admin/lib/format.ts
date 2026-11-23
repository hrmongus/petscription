import engine from '@lib/../public/granula/engine.js';
import { METHODS, type DeliveryMethod } from '@lib/carriers';

/* Formátovanie pre admin (slovensky, čas v Europe/Bratislava). */

const TZ = 'Europe/Bratislava';

export const eur = (cents: number | null | undefined) =>
  cents == null ? '—' : `${(cents / 100).toLocaleString('sk-SK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;

export function dt(v: string | number | Date | null | undefined, withTime = true) {
  if (v == null || v === '') return '—';
  const d = typeof v === 'number' ? new Date(v * 1000) : new Date(v);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('sk-SK', { timeZone: TZ, day: 'numeric', month: 'numeric', year: 'numeric', ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}) });
}
export const day = (v: string | number | Date | null | undefined) => dt(v, false);

/** YYYY-MM-DD v Bratislave (pre <input type="date">) */
export function ymdLocal(v: string | Date | null | undefined) {
  if (!v) return '';
  const d = new Date(v);
  return new Intl.DateTimeFormat('sv-SE', { timeZone: TZ }).format(d);
}

/** dnešok v Bratislave ako YYYY-MM-DD */
export const todayLocal = () => ymdLocal(new Date());

export const ORDER_STATUS: Record<string, string> = {
  paid: 'Zaplatená, neodoslaná',
  sent_to_fhb: 'Vo FHB',
  fhb_error: 'Chyba FHB',
  confirmed: 'FHB spracúva',
  sent: 'Odoslaná',
  delivered: 'Doručená',
  returned: 'Vrátená',
  cancelled: 'Stornovaná',
  refunded: 'Peniaze vrátené',
};

export const SUB_STATUS: Record<string, string> = {
  active: 'Aktívne',
  paused: 'Pozastavené',
  past_due: 'Nezaplatené',
  cancelled: 'Zrušené',
};

export const WITHDRAWAL_STATUS: Record<string, string> = {
  received: 'Prijaté',
  return_pending: 'Čaká na vrátenie tovaru',
  refunded: 'Peniaze vrátené',
  rejected: 'Zamietnuté',
};

export const KIND: Record<string, string> = { first: 'Prvá (predplatné)', renewal: 'Obnovenie', one_off: 'Jednorazová' };

export const kindLabel = (o: { kind: string; reship_of?: string | null }) => (o.reship_of ? 'Znova odoslaná' : KIND[o.kind] ?? o.kind);

const PRODUCT_NAME = new Map(engine.PRODUCTS.map((p) => [p.id, p.name]));
export const productName = (id: string | null | undefined) => (id ? PRODUCT_NAME.get(id) ?? id : '—');
export const PRODUCTS = engine.PRODUCTS.map((p) => ({ id: p.id, name: p.name }));

/** GRAN-hovadzie-9 → „Hovädzie s ryžou 9 kg“ */
export function skuLabel(sku: string) {
  const m = /^GRAN-(.+)-(4|9|18)$/.exec(sku);
  return m ? `${productName(m[1])} ${m[2]} kg` : sku;
}

export const methodLabel = (m: string | null | undefined) => (m && METHODS[m as DeliveryMethod] ? METHODS[m as DeliveryMethod].label : m ?? '—');

export type ShipToView = {
  name?: string;
  email?: string;
  phone?: string;
  delivery_method?: string;
  street?: string | null;
  city?: string | null;
  zip?: string | null;
  point_id?: string | null;
  point_label?: string | null;
};

/** krátky popis doručenia do tabuľky */
export function shipShort(s: unknown) {
  const t = (s ?? {}) as ShipToView;
  const where = t.point_label ? t.point_label.split(',')[0] : [t.street, t.city].filter(Boolean).join(', ');
  return `${METHODS[t.delivery_method as DeliveryMethod]?.carrier?.toUpperCase() ?? ''} ${where}`.trim();
}

export const json = (v: unknown) => JSON.stringify(v, null, 2);
