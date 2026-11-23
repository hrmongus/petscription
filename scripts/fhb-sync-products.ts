/*
 * Synchronizácia 15 produktov do FHB (SPEC P0 → SKU, P2):
 *   10 bežných (5 receptúr × 4 kg a 9 kg) + 5 sád 18 kg (type: multi, items: [{ GRAN-<receptúra>-9, 2 }]).
 *
 *   npx tsx scripts/fhb-sync-products.ts            → iba vypíše, čo by urobil (nič nezapisuje)
 *   npx tsx scripts/fhb-sync-products.ts --apply    → vytvorí chýbajúce, existujúcim zosúladí názov, notify_url a zložky sady
 *   zápis do produkčného FHB (https://api.fhb.sk) iba s --apply --production
 *
 * Pravidlá:
 *   - produkty sa nedajú zmazať, iba archivovať → ID (GRAN-<receptúra>-<kg>) sa po založení nemení,
 *   - EAN sa NIKDY neposiela: FHB ho upraví podľa skutočného vrecka a nesmieme ho prepísať,
 *   - notify_url = /api/fhb/stock-notify?t=FHB_NOTIFY_TOKEN (skladové notifikácie),
 *   - najprv bežné produkty, potom sady (zložka sady musí existovať).
 */
import { allSkus, type FhbCatalogItem } from '../lib/engine-server';
import { fhbMode } from '../lib/env-mode';
import { stockNotifyUrl } from '../lib/fhb/build-order';
import { FhbClient, type FhbProduct, type FhbProductInput } from '../lib/fhb/client';

const sameItems = (a: { id?: string; quantity?: number }[] | null | undefined, b: { id: string; quantity: number }[] | undefined) =>
  JSON.stringify((a ?? []).map((x) => [x.id, x.quantity]).sort()) === JSON.stringify((b ?? []).map((x) => [x.id, x.quantity]).sort());

function wanted(item: FhbCatalogItem, notifyUrl: string | null): FhbProductInput {
  return {
    id: item.sku,
    name: `Granula! ${item.name}`.slice(0, 150),
    type: item.type,
    ...(item.type === 'multi' ? { items: item.items } : {}),
    ...(notifyUrl ? { notify_url: notifyUrl } : {}),
  };
}

function diff(have: FhbProduct, want: FhbProductInput): string[] {
  const d: string[] = [];
  if (have.name !== want.name) d.push(`názov „${have.name}“ → „${want.name}“`);
  if (want.notify_url && have.notify_url !== want.notify_url) d.push('notify_url');
  if ((have.type ?? 'single') !== want.type) d.push(`typ ${have.type ?? 'single'} → ${want.type}`);
  if (want.type === 'multi' && !sameItems(have.items, want.items)) d.push('zložky sady');
  return d;
}

async function main() {
  const apply = process.argv.includes('--apply');
  const mode = fhbMode();
  console.log(`FHB: ${mode} (${new URL(process.env.FHB_API_URL ?? 'http://unset').host}) · ${apply ? 'ZÁPIS' : 'iba náhľad, pridaj --apply'}`);
  if (mode === 'production' && apply && !process.argv.includes('--production')) throw new Error('Produkčné FHB: zápis iba s --apply --production');

  const site = process.env.NEXT_PUBLIC_SITE_URL;
  const token = process.env.FHB_NOTIFY_TOKEN;
  const notify = site && token ? stockNotifyUrl(site, token) : null;
  const fhb = FhbClient.fromEnv();

  for (const item of allSkus()) {
    const want = wanted(item, notify);
    const have = await fhb.getProduct(item.sku);
    const label = `${item.sku.padEnd(30)} ${item.type === 'multi' ? 'sada ' : 'vrece'}`;
    if (!have) {
      console.log(`+ vytvoriť   ${label}  „${want.name}“${item.items ? `  = ${item.items.map((i) => `${i.quantity} × ${i.id}`).join(', ')}` : ''}`);
      if (apply) await fhb.createProduct(want);
      continue;
    }
    if (have.archived) console.log(`! archivovaný ${label}  (FHB ho neponúkne; obnoviť treba v ZOE)`);
    const changes = diff(have, want);
    if (!changes.length) {
      console.log(`= bez zmeny  ${label}${have.ean ? `  (EAN ${have.ean} od FHB ostáva)` : ''}`);
      continue;
    }
    console.log(`~ upraviť    ${label}  ${changes.join('; ')}`);
    // PUT bez id a bez ean (EAN sa nikdy neprepisuje)
    const { id: _id, ...patch } = want;
    if (apply) await fhb.updateProduct(item.sku, patch);
  }
  if (!notify) console.log('pozn.: NEXT_PUBLIC_SITE_URL / FHB_NOTIFY_TOKEN nie sú nastavené → notify_url (skladové notifikácie) sa nenastaví');
}

main().catch((e) => {
  console.error('CHYBA:', e?.toJSON?.() ?? e?.message ?? e);
  process.exit(1);
});
