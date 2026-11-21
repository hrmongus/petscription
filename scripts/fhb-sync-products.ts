/*
 * Synchronizácia 10 SKU (5 receptúr × 4 kg a 9 kg) do FHB (SPEC P2). 18 kg = 2 × 9 kg, nie samostatné SKU.
 *   npx tsx scripts/fhb-sync-products.ts            → iba vypíše, čo by urobil (nič nezapisuje)
 *   npx tsx scripts/fhb-sync-products.ts --apply    → vytvorí chýbajúce, existujúcim aktualizuje názov a notify_url
 * Prostredie z env (FHB_API_URL…): sandbox alebo produkcia podľa URL (lib/env-mode.ts), vypíše sa pred zápisom.
 * EAN sa neposiela nikdy: FHB ho môže opraviť podľa skutočného vrecka a nesmieme ho prepísať.
 */
import { allSkus } from '../lib/engine-server';
import { fhbMode } from '../lib/env-mode';
import { FhbClient } from '../lib/fhb/client';
import { notifyUrl } from '../lib/fhb/build-order';

async function main() {
  const apply = process.argv.includes('--apply');
  const mode = fhbMode();
  console.log(`FHB: ${mode} (${new URL(process.env.FHB_API_URL ?? 'http://unset').host}) · ${apply ? 'ZÁPIS' : 'iba náhľad, pridaj --apply'}`);
  if (mode === 'production' && apply && !process.argv.includes('--production')) {
    throw new Error('Produkčné FHB: zápis iba s --apply --production');
  }
  const site = process.env.NEXT_PUBLIC_SITE_URL;
  const token = process.env.FHB_NOTIFY_TOKEN;
  const fhb = FhbClient.fromEnv();
  for (const s of allSkus()) {
    const want = { name: `Granula! ${s.name}`.slice(0, 150), ...(site && token ? { notify_url: notifyUrl(site, 'stock', s.sku, token) } : {}) };
    const have = await fhb.getProduct(s.sku);
    if (!have) {
      console.log(`+ vytvoriť  ${s.sku}  „${want.name}“`);
      if (apply) await fhb.createProduct({ id: s.sku, ...want });
    } else if (have.name !== want.name || (want.notify_url && have.notify_url !== want.notify_url)) {
      console.log(`~ upraviť   ${s.sku}  „${have.name}“ → „${want.name}“`);
      if (apply) await fhb.updateProduct(s.sku, want);
    } else {
      console.log(`= bez zmeny ${s.sku}`);
    }
  }
  if (!site || !token) console.log('pozn.: NEXT_PUBLIC_SITE_URL / FHB_NOTIFY_TOKEN nie sú nastavené → notify_url (skladové notifikácie) sa nenastaví');
}

main().catch((e) => {
  console.error('CHYBA:', e?.toJSON?.() ?? e?.message ?? e);
  process.exit(1);
});
