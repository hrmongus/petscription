/*
 * Smoke test proti FHB sandboxu.
 *   npx tsx scripts/fhb-smoke.ts           → iba čítanie: login, parcel-service, výdajné miesta SPS, produkty, sklad, história, RMA
 *   npx tsx scripts/fhb-smoke.ts --write   → navyše testovacia objednávka: POST → GET → DELETE (iba sandbox)
 * Nikdy nebeží zápis proti produkčnému FHB (https://api.fhb.sk).
 */
import { randomUUID } from 'node:crypto';
import { fhbMode } from '../lib/env-mode';
import { buildFhbOrder, parcelServicesFromEnv } from '../lib/fhb/build-order';
import { FhbClient, FhbError } from '../lib/fhb/client';

const ok = (s: string) => console.log(`✓ ${s}`);
const warn = (s: string) => console.log(`! ${s}`);

async function main() {
  const write = process.argv.includes('--write');
  const mode = fhbMode();
  console.log(`FHB ${mode} · ${new URL(process.env.FHB_API_URL ?? 'http://unset').host}${write ? ' · so zápisom' : ''}`);
  if (write && mode !== 'sandbox') throw new Error('zápis iba v sandboxe');
  const fhb = FhbClient.fromEnv();
  const services = parcelServicesFromEnv();

  await fhb.token(true);
  ok('login');
  const ps = await fhb.parcelServices();
  (ps.length ? ok : warn)(`parcel-service: ${ps.length ? ps.map((p) => p.code).join(', ') : 'prázdne (FHB zatiaľ nepovolil žiadnu službu)'}`);
  for (const [method, code] of Object.entries(services)) {
    if (!code) { warn(`${method}: kód služby nie je nastavený`); continue; }
    const pts = await fhb.deliveryPoints(code, 'sk');
    if (method === 'sps_courier') ok(`${method}: ${code}`);
    else (pts.length ? ok : warn)(`${method} (${code}): ${pts.length} výdajných miest SK${pts[0] ? `, napr. ${pts[0].external_code} ${pts[0].name}, ${pts[0].city}` : ''}`);
  }
  const prods = await fhb.listProducts();
  const ours = prods.products.filter((p) => p.id?.startsWith('GRAN-'));
  (ours.length === 10 ? ok : warn)(`produkty: ${prods.total} spolu, naše GRAN-*: ${ours.length}/10`);
  ok(`sklad: ${(await fhb.stockAll()).length} položiek`);
  ok(`história objednávok: ${(await fhb.orderHistory()).total}`);
  ok(`RMA: ${(await fhb.rmaList()).total}`);

  if (!write) return;
  const sps = services.sps_parcelshop!;
  const point = (await fhb.deliveryPoints(sps, 'sk'))[0];
  const sku = ours[0]?.id ?? '000000';
  const id = `SMOKE-${randomUUID().slice(0, 8)}`;
  const body = buildFhbOrder(
    {
      id, number: Math.floor(Date.now() / 1000) % 1e9, items: [{ sku, qty: 1 }], amountCents: 100,
      shipTo: { name: 'Test Granula', email: 'test@granula.sk', phone: '+421900000000', country: 'SK', delivery_method: 'sps_parcelshop',
        point_id: point?.external_code /* FHB delivery_point = external_code */, point_address: point ? { street: point.street, city: point.city, zip: point.zip } : null },
    },
    { siteUrl: process.env.NEXT_PUBLIC_SITE_URL || 'https://granula.sk', notifyToken: 'smoke', services },
  );
  try {
    const created = await fhb.createOrder({ ...body, note: 'SMOKE TEST – zmazať' });
    ok(`objednávka vytvorená: ${created.id} (${created.status}), produkt ${sku}, miesto ${point?.external_code}`);
    const read = await fhb.getOrder(id);
    ok(`GET /order: ${read?.status}, delivery_point ${read?.delivery_point}, parcel_service ${read?.parcel_service}`);
    await fhb.deleteOrder(id);
    ok(`DELETE /order: ${(await fhb.getOrder(id)) ? 'objednávka stále existuje!' : 'zmazaná'}`);
  } catch (e) {
    if (e instanceof FhbError) warn(`objednávka: ${JSON.stringify(e.toJSON())}`);
    else throw e;
  }
}

main().catch((e) => {
  console.error('CHYBA:', e?.toJSON?.() ?? e?.message ?? e);
  process.exit(1);
});
