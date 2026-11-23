import type Stripe from 'stripe';
import type { Json, Tables, TablesInsert, TablesUpdate } from './database.types';
import type { BagId } from './engine-server';
import { buildFhbOrder, fhbOrderId, type BuildOrderOptions, type ShipTo } from './fhb/build-order';
import { FhbClient, FhbError, type FhbOrder } from './fhb/client';
import { APP_METADATA } from './stripe';

/*
 * Akcie nad objednávkou (SPEC P3 admin, P4 portál): stav vo FHB, úprava doručenia a storno iba kým je FHB objednávka
 * `pending` (SPEC P2: PUT / DELETE /order iba v pending), refund cez Stripe, opätovné odoslanie vrátenej zásielky.
 *
 * Kedy sa dá objednávka upraviť / stornovať:
 *   paid, fhb_error          → ešte nie je vo FHB (overí sa GET /order): mení sa iba u nás; potom „znova odoslať“
 *   sent_to_fhb, confirmed   → iba ak FHB hlási `pending` (inak sa už balí)
 *   ostatné                  → nie
 */

export type Order = Tables<'orders'>;

export type OrderStore = {
  getOrder(id: string): Promise<Order | null>;
  updateOrder(id: string, patch: TablesUpdate<'orders'>): Promise<void>;
  insertOrder(row: TablesInsert<'orders'>): Promise<Order>;
  countReships(orderId: string): Promise<number>;
};

export class OrderActionError extends Error {
  name = 'OrderActionError';
}

const LOCAL = new Set(['paid', 'fhb_error']);
const IN_FHB = new Set(['sent_to_fhb', 'confirmed']);

export type FhbState = {
  fhb: FhbOrder | null;
  /** kde sa dá zmena urobiť: iba u nás (ešte nie je vo FHB), vo FHB (pending), alebo nikde */
  mode: 'local' | 'fhb' | 'none';
  reason: string;
  /** FHB nebolo dostupné (výpadok) */
  unavailable?: boolean;
};

/** Stav objednávky vo FHB naživo a či sa dá upraviť / stornovať. */
export async function fhbState(order: Pick<Order, 'number' | 'status'>, fhb: FhbClient): Promise<FhbState> {
  let f: FhbOrder | null = null;
  try {
    f = await fhb.getOrder(fhbOrderId(order.number));
  } catch (e) {
    return { fhb: null, mode: 'none', reason: `FHB teraz neodpovedá (${(e as Error).message}). Skús znova.`, unavailable: true };
  }
  const st = String(f?.status ?? '').toLowerCase();
  if (f && st === 'pending' && (LOCAL.has(order.status) || IN_FHB.has(order.status))) return { fhb: f, mode: 'fhb', reason: 'Vo FHB čaká na spracovanie (pending).' };
  if (f) return { fhb: f, mode: 'none', reason: `FHB ju už spracúva (stav ${f.status}).` };
  if (LOCAL.has(order.status)) return { fhb: null, mode: 'local', reason: 'Ešte nie je vo FHB.' };
  return { fhb: null, mode: 'none', reason: `Stav ${order.status}: zmena nie je možná.` };
}

/** balenie z položiek objednávky (GRAN-<receptúra>-<kg>) */
export function bagOfItems(items: Json): BagId {
  const sku = (items as { sku?: string }[] | null)?.[0]?.sku ?? '';
  const kg = sku.split('-').pop();
  if (kg !== '4' && kg !== '9' && kg !== '18') throw new OrderActionError(`neznáme balenie v položkách (${sku})`);
  return kg;
}

/** telo PUT /order (rovnaké ako POST bez id a validate) */
export function fhbUpdateBody(order: Pick<Order, 'id' | 'number' | 'items' | 'amount_cents'>, shipTo: ShipTo, opts: BuildOrderOptions) {
  const { id: _id, validate: _v, ...rest } = buildFhbOrder(
    { id: order.id, number: order.number, items: order.items as { sku: string; qty: number }[], amountCents: order.amount_cents, shipTo },
    opts,
  );
  return rest;
}

/** Nové doručenie objednávky (už overené cez resolveDelivery). Vráti pôvodný ship_to. */
export async function updateOrderDelivery(orderId: string, shipTo: ShipTo, deps: { store: OrderStore; fhb: FhbClient; fhbOptions: BuildOrderOptions }) {
  const order = await deps.store.getOrder(orderId);
  if (!order) throw new OrderActionError('Objednávka neexistuje.');
  const st = await fhbState(order, deps.fhb);
  if (st.mode === 'none') throw new OrderActionError(`Doručenie sa už nedá zmeniť: ${st.reason}`);
  if (st.mode === 'fhb') await deps.fhb.updateOrder(fhbOrderId(order.number), fhbUpdateBody(order, shipTo, deps.fhbOptions));
  await deps.store.updateOrder(order.id, { ship_to: shipTo as unknown as Json });
  return { before: order.ship_to, mode: st.mode };
}

/** Storno: vo FHB iba v pending (DELETE /order), inak iba ak ešte nebola odoslaná. Peniaze vracia refundOrder. */
export async function cancelOrder(orderId: string, deps: { store: OrderStore; fhb: FhbClient }) {
  const order = await deps.store.getOrder(orderId);
  if (!order) throw new OrderActionError('Objednávka neexistuje.');
  const st = await fhbState(order, deps.fhb);
  if (st.mode === 'none') throw new OrderActionError(`Storno nie je možné: ${st.reason}`);
  if (st.mode === 'fhb') {
    try {
      await deps.fhb.deleteOrder(fhbOrderId(order.number));
    } catch (e) {
      if (e instanceof FhbError && e.status === 400) throw new OrderActionError(`FHB storno odmietol (${e.message}); objednávka sa už asi balí.`);
      throw e;
    }
  }
  await deps.store.updateOrder(order.id, { status: 'cancelled' });
  return { before: order.status, mode: st.mode };
}

/* ---------------------------------------------------------------- platba a refund (Stripe) */

/** PaymentIntent objednávky: Checkout Session (cs_…) pri prvej / jednorazovej, faktúra (in_…) pri obnovení. */
export async function paymentIntentOf(stripeRef: string, s: Stripe): Promise<string | null> {
  let invoiceId: string | null = null;
  if (stripeRef.startsWith('cs_')) {
    const session = await s.checkout.sessions.retrieve(stripeRef);
    const pi = session.payment_intent;
    if (pi) return typeof pi === 'string' ? pi : pi.id;
    invoiceId = typeof session.invoice === 'string' ? session.invoice : session.invoice?.id ?? null;
  } else if (stripeRef.startsWith('in_')) {
    invoiceId = stripeRef;
  }
  if (!invoiceId) return null;
  const payments = await s.invoicePayments.list({ invoice: invoiceId, limit: 10 });
  const paid = payments.data.find((p) => p.status === 'paid') ?? payments.data[0];
  const pi = paid?.payment?.payment_intent;
  return pi ? (typeof pi === 'string' ? pi : pi.id) : null;
}

export type PaymentInfo = {
  paymentIntentId: string;
  status: string;
  amount: number;
  refunded: number;
  card: string | null;
  receiptUrl: string | null;
  refunds: { id: string; amount: number; status: string | null; created: number; reason: string | null }[];
};

export async function paymentInfo(stripeRef: string, s: Stripe): Promise<PaymentInfo | null> {
  const piId = await paymentIntentOf(stripeRef, s);
  if (!piId) return null;
  const pi = await s.paymentIntents.retrieve(piId, { expand: ['latest_charge'] });
  const ch = typeof pi.latest_charge === 'object' ? pi.latest_charge : null;
  const refunds = ch ? await s.refunds.list({ charge: ch.id, limit: 20 }) : null;
  const card = ch?.payment_method_details?.card;
  return {
    paymentIntentId: pi.id,
    status: pi.status,
    amount: pi.amount_received || pi.amount,
    refunded: ch?.amount_refunded ?? 0,
    card: card ? `${card.brand} •${card.last4}${card.wallet?.type ? ` (${card.wallet.type})` : ''}` : (ch?.payment_method_details?.type ?? null),
    receiptUrl: ch?.receipt_url ?? null,
    refunds: (refunds?.data ?? []).map((r) => ({ id: r.id, amount: r.amount, status: r.status, created: r.created, reason: r.reason })),
  };
}

/**
 * Refund (celý alebo čiastočný). Idempotency key z objednávky, sumy a už vrátenej sumy → dvojklik nevráti peniaze
 * dvakrát. Po úplnom vrátení stav `refunded` (FHB synchronizácia ho už nemení).
 */
export async function refundOrder(orderId: string, amountCents: number | null, deps: { store: OrderStore; stripe: Stripe; reason?: string }) {
  const order = await deps.store.getOrder(orderId);
  if (!order) throw new OrderActionError('Objednávka neexistuje.');
  if (order.amount_cents <= 0) throw new OrderActionError('Objednávka bez platby (napr. opätovné odoslanie), nie je čo vrátiť.');
  const info = await paymentInfo(order.stripe_ref, deps.stripe);
  if (!info) throw new OrderActionError('Platba sa v Stripe nenašla.');
  const remaining = info.amount - info.refunded;
  if (remaining <= 0) {
    if (order.status !== 'refunded') await deps.store.updateOrder(order.id, { status: 'refunded' });
    throw new OrderActionError('Platba už je celá vrátená.');
  }
  const amount = amountCents ?? remaining;
  if (!Number.isInteger(amount) || amount <= 0 || amount > remaining) throw new OrderActionError(`Suma musí byť od 0,01 do ${(remaining / 100).toFixed(2)} €.`);
  const refund = await deps.stripe.refunds.create(
    {
      payment_intent: info.paymentIntentId,
      amount,
      reason: 'requested_by_customer',
      metadata: { ...APP_METADATA, order_id: order.id, order_number: String(order.number), ...(deps.reason ? { note: deps.reason.slice(0, 450) } : {}) },
    },
    { idempotencyKey: `granula-refund:${order.id}:${amount}:${info.refunded}` },
  );
  const full = amount === remaining;
  if (full) await deps.store.updateOrder(order.id, { status: 'refunded' });
  return { refund: { id: refund.id, amount: refund.amount, status: refund.status }, full, before: order.status, refundedTotal: info.refunded + amount, paid: info.amount };
}

/* ---------------------------------------------------------------- opätovné odoslanie */

/** Vrátená (alebo stratená) zásielka → nová objednávka bez platby s rovnakými položkami; odošle ju volajúci (sendOrderToFhb). */
export async function createReship(orderId: string, deps: { store: OrderStore; shipTo?: ShipTo }) {
  const order = await deps.store.getOrder(orderId);
  if (!order) throw new OrderActionError('Objednávka neexistuje.');
  if (!['returned', 'delivered', 'sent'].includes(order.status)) throw new OrderActionError(`Znova poslať sa dá iba vrátená alebo odoslaná objednávka (stav ${order.status}).`);
  const n = (await deps.store.countReships(order.id)) + 1;
  return deps.store.insertOrder({
    customer_id: order.customer_id,
    subscription_id: order.subscription_id,
    kind: order.kind,
    stripe_ref: `reship:${order.id}:${n}`,
    amount_cents: 0,
    items: order.items,
    ship_to: (deps.shipTo ?? order.ship_to) as unknown as Json,
    status: 'paid',
    reship_of: order.id,
  });
}

/* ---------------------------------------------------------------- Supabase */

export async function supabaseOrderActionStore(): Promise<OrderStore> {
  const { db } = await import('./db');
  return {
    async getOrder(id) {
      const { data, error } = await db().from('orders').select('*').eq('id', id).maybeSingle();
      if (error) throw new Error(error.message);
      return data;
    },
    async updateOrder(id, patch) {
      const { error } = await db().from('orders').update(patch).eq('id', id);
      if (error) throw new Error(error.message);
    },
    async insertOrder(row) {
      const { data, error } = await db().from('orders').insert(row).select('*').single();
      if (error) throw new Error(error.message);
      return data;
    },
    async countReships(orderId) {
      const { count, error } = await db().from('orders').select('id', { count: 'exact', head: true }).eq('reship_of', orderId);
      if (error) throw new Error(error.message);
      return count ?? 0;
    },
  };
}
