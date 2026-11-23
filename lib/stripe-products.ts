import type Stripe from 'stripe';
import { APP_METADATA } from './stripe';

/*
 * Stripe Products (SPEC §1: Product pre recept × balenie). Stabilné ID (`granula-<SKU>`, `granula-doprava`),
 * vytvoria sa pri prvom použití, potom sa iba čítajú (cache v pamäti procesu).
 */
const known = new Set<string>();

export async function ensureProduct(s: Stripe, id: string, name: string, extra: Stripe.MetadataParam = {}) {
  if (known.has(id)) return id;
  try {
    await s.products.retrieve(id);
  } catch (e) {
    if ((e as { statusCode?: number }).statusCode !== 404) throw e;
    try {
      await s.products.create({ id, name, metadata: { ...APP_METADATA, ...extra } });
    } catch (e2) {
      // súbežné vytvorenie: produkt už existuje
      if ((e2 as { code?: string }).code !== 'resource_already_exists') throw e2;
    }
  }
  known.add(id);
  return id;
}
