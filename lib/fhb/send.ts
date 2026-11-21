import type { Json } from '../database.types';
import { buildFhbOrder, FhbBuildError, parcelServicesFromEnv, type BuildOrderOptions, type ShipTo } from './build-order';
import { FhbClient, FhbError, type FhbOrder } from './client';

/*
 * Odoslanie zaplatenej objednávky do FHB a zápis výsledku do orders (SPEC P2).
 *
 * Bezpečné opakovanie (webhook retry, cron, tlačidlo v admine):
 *   - posiela sa iba objednávka v stave `paid` alebo `fhb_error`; iné stavy sa preskočia,
 *   - FHB `id` = orders.id: ak POST zlyhá, lebo objednávka už vo FHB je, overí sa GET /order a berie sa ako odoslaná.
 * Výsledok:
 *   - OK → status `sent_to_fhb`, fhb_error = null,
 *   - 400 / lokálna validácia → status `fhb_error`, fhb_error = { status, message, violations } (úloha v admine),
 *   - sieť / 5xx → status ostáva, fhb_error sa zapíše, chyba sa vyhodí (zavolajúci zopakuje).
 */

export type OrderForFhb = {
  id: string;
  number: number;
  status: string;
  amount_cents: number;
  items: Json;
  ship_to: Json;
  invoice_url?: string | null;
};

export type OrderStore = {
  load(id: string): Promise<OrderForFhb | null>;
  update(id: string, patch: { status?: string; fhb_error?: Json | null }): Promise<void>;
};

export type SendResult =
  | { ok: true; state: 'sent' | 'already_in_fhb'; fhb: FhbOrder | null }
  | { ok: true; state: 'skipped'; reason: string }
  | { ok: false; state: 'fhb_error'; error: ReturnType<FhbError['toJSON']> };

const SENDABLE = new Set(['paid', 'fhb_error']);

export function sendOptionsFromEnv(env: Record<string, string | undefined> = process.env): BuildOrderOptions {
  const siteUrl = env.NEXT_PUBLIC_SITE_URL;
  const notifyToken = env.FHB_NOTIFY_TOKEN;
  if (!siteUrl || !notifyToken) throw new Error('[fhb] NEXT_PUBLIC_SITE_URL / FHB_NOTIFY_TOKEN nie sú nastavené');
  return { siteUrl, notifyToken, services: parcelServicesFromEnv(env), validateAddress: env.FHB_VALIDATE_ADDRESS !== 'false' };
}

export async function sendOrderToFhb(orderId: string, deps: { client: FhbClient; store: OrderStore; options: BuildOrderOptions }): Promise<SendResult> {
  const { client, store, options } = deps;
  const order = await store.load(orderId);
  if (!order) throw new Error(`[fhb] objednávka ${orderId} neexistuje`);
  if (!SENDABLE.has(order.status)) return { ok: true, state: 'skipped', reason: `stav ${order.status}` };

  let body;
  try {
    body = buildFhbOrder(
      {
        id: order.id,
        number: order.number,
        items: order.items as { sku: string; qty: number }[],
        amountCents: order.amount_cents,
        shipTo: order.ship_to as unknown as ShipTo,
        invoiceUrl: order.invoice_url,
      },
      options,
    );
  } catch (e) {
    if (!(e instanceof FhbBuildError)) throw e;
    const error = e.toJSON();
    await store.update(order.id, { status: 'fhb_error', fhb_error: error as unknown as Json });
    return { ok: false, state: 'fhb_error', error };
  }

  try {
    const fhb = await client.createOrder(body);
    await store.update(order.id, { status: 'sent_to_fhb', fhb_error: null });
    return { ok: true, state: 'sent', fhb };
  } catch (e) {
    if (!(e instanceof FhbError)) throw e;
    // už vo FHB? (opakované odoslanie po výpadku, keď prvý POST prešiel)
    const existing = await client.getOrder(order.id).catch(() => null);
    if (existing) {
      await store.update(order.id, { status: 'sent_to_fhb', fhb_error: null });
      return { ok: true, state: 'already_in_fhb', fhb: existing };
    }
    const error = e.toJSON();
    if (e.isRetryable) {
      await store.update(order.id, { fhb_error: error as unknown as Json });
      throw e;
    }
    await store.update(order.id, { status: 'fhb_error', fhb_error: error as unknown as Json });
    return { ok: false, state: 'fhb_error', error };
  }
}

/** Store nad Supabase (service role). */
export async function supabaseOrderStore(): Promise<OrderStore> {
  const { db } = await import('../db');
  return {
    async load(id) {
      const { data, error } = await db().from('orders').select('id, number, status, amount_cents, items, ship_to').eq('id', id).maybeSingle();
      if (error) throw error;
      return data;
    },
    async update(id, patch) {
      const { error } = await db().from('orders').update(patch).eq('id', id);
      if (error) throw error;
    },
  };
}
