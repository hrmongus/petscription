import { beforeEach, describe, expect, test } from 'vitest';
import { boxesAllowed, defaultMethodFor, fhbServiceFor, isMethodAllowed, methodsFor, shippingPrice } from './carriers';
import { _resetPointsCache, findPoint, fold, getPoints, normalizePoints, searchPoints, type DeliveryPoint } from './delivery-points';
import { MOCK_POINTS } from './delivery-points.mock';
import { _resetFhbTokenCache, FhbClient } from './fhb/client';

describe('dopravcovia podľa balenia (doprava-config.js)', () => {
  test('ponuka a predvolená voľba', () => {
    expect(methodsFor('4')).toEqual(['packeta_point', 'dpd_pickup', 'sps_courier']);
    expect(defaultMethodFor('4')).toBe('packeta_point');
    expect(methodsFor('9')).toEqual(['dpd_pickup', 'sps_courier']); // Packeta pri 9 kg nie (cenník 23. 11.)
    expect(defaultMethodFor('9')).toBe('dpd_pickup');
  });
  test('18 kg: Packeta sa neponúka (limit 15 kg), predvolené DPD', () => {
    expect(methodsFor('18')).toEqual(['dpd_pickup', 'sps_courier']);
    expect(defaultMethodFor('18')).toBe('dpd_pickup');
    expect(isMethodAllowed('packeta_point', '18')).toBe(false);
    expect(isMethodAllowed('sps_parcelshop', '9')).toBe(false);
  });
  test('boxy: pri 18 kg do DPD iba odberné miesta, pri 4 a 9 kg aj boxy', () => {
    expect(boxesAllowed('dpd_pickup', '18')).toBe(false);
    expect(boxesAllowed('dpd_pickup', '9')).toBe(true);
    expect(boxesAllowed('dpd_pickup', '4')).toBe(true);
    expect(boxesAllowed('packeta_point', '4')).toBe(true);
  });
  test('cenník dopravy 23. 11.: jednorazovo / predplatné (výdajné miesto zadarmo)', () => {
    const t: Record<string, Record<string, [number, number]>> = {
      '4': { packeta_point: [3.9, 0], dpd_pickup: [3.9, 0], sps_courier: [4.9, 1.9] },
      '9': { dpd_pickup: [3.9, 0], sps_courier: [5.9, 1.9] },
      '18': { dpd_pickup: [4.9, 0], sps_courier: [9.9, 3.9] },
    };
    for (const bag of ['4', '9', '18'] as const) {
      expect(methodsFor(bag)).toEqual(Object.keys(t[bag]));
      for (const m of methodsFor(bag)) {
        expect(shippingPrice(m, bag, 4.9, 'raz')).toBe(t[bag][m][0]);
        expect(shippingPrice(m, bag, 4.9, 'mesiac')).toBe(t[bag][m][1]);
      }
    }
  });
  test('kódy FHB z konfigurácie, prepísateľné env', () => {
    expect(fhbServiceFor('packeta_point', {})).toBe('zasielkovna_sk');
    expect(fhbServiceFor('dpd_pickup', {})).toBe('dpd_sk');
    expect(fhbServiceFor('sps_courier', {})).toBe('sps');
    expect(fhbServiceFor('dpd_pickup', { FHB_SERVICE_DPD: 'dpd_eu_pudo' })).toBe('dpd_eu_pudo');
  });
});

const RAW = [
  { id: 6903318, external_code: 'SK21286', name: 'Pavel Lóška Cyklo-Šport', street: 'MIEROVÁ 17', city: 'TORNAĽA', zip: '98201', country: 'sk' },
  { id: 6901595, external_code: 'SK23096', name: 'AlzaBox', street: 'MALOKRASŇANSKÁ .', city: 'BRATISLAVA', zip: '83154', country: 'sk' },
  { id: 3005417, external_code: '33711', name: 'Z-BOX', street: 'Trolejbusová 2887/6', city: 'Košice', zip: '040 01', country: 'sk' },
  { id: 1, external_code: 'SK1', name: 'Kníhkupectvo', street: 'NÁRODNÁ 1', city: 'ŽILINA', zip: '01001', country: 'sk' },
];

beforeEach(() => { _resetPointsCache(); _resetFhbTokenCache(); });

describe('výdajné miesta (FHB)', () => {
  test('normalizácia: id = external_code, mestá bez VEĽKÝCH písmen, box podľa názvu', () => {
    const p = normalizePoints(RAW as never);
    expect(p[0]).toEqual({ id: 'SK21286', name: 'Pavel Lóška Cyklo-Šport', street: 'Mierová 17', city: 'Tornaľa', zip: '98201', country: 'SK', kind: 'shop' });
    expect(p[1]).toMatchObject({ kind: 'box', street: 'Malokrasňanská', city: 'Bratislava' });
    expect(p[2]).toMatchObject({ id: '33711', kind: 'box', zip: '04001', city: 'Košice' });
  });
  test('hľadanie bez diakritiky, podľa PSČ, miesta pred boxami', () => {
    const p = normalizePoints(RAW as never);
    expect(searchPoints(p, 'zilina').map((x) => x.id)).toEqual(['SK1']);
    expect(searchPoints(p, '982 01').map((x) => x.id)).toEqual(['SK21286']);
    expect(searchPoints(p, 'kosice trolejbusova').map((x) => x.id)).toEqual(['33711']);
    expect(searchPoints(p, 'b')).toEqual([]);
    expect(searchPoints(p, 'bratislava').map((x) => x.id)).toEqual(['SK23096']);
    expect(searchPoints(p, 'bratislava', 40, { boxes: false })).toEqual([]);
    expect(fold('  Žilina  Vlčince ')).toBe('zilina vlcince');
  });
  test('limit 40 výsledkov', () => {
    const many: DeliveryPoint[] = Array.from({ length: 100 }, (_, i) => ({ id: `SK${i}`, name: `Miesto ${i}`, street: 'Ulica', city: 'Košice', zip: '04001', country: 'SK', kind: 'shop' }));
    expect(searchPoints(many, 'kosice')).toHaveLength(40);
  });
  test('bez FHB kľúčov testovacie dáta TEST- pre Packetu aj DPD', async () => {
    const env = { ...process.env };
    delete process.env.FHB_API_URL;
    try {
      for (const s of ['packeta', 'dpd'] as const) {
        const r = await getPoints(s);
        expect(r.source).toBe('mock');
        expect(r.points).toBe(MOCK_POINTS[s]);
        expect(r.points.every((x) => x.id.startsWith('TEST-'))).toBe(true);
      }
      expect(await findPoint('dpd', 'TEST-DPD01')).toMatchObject({ city: 'Bratislava' });
      expect(await findPoint('dpd', 'SK99999')).toBeNull();
    } finally { process.env = env; }
  });
  test('cache 12 h zvlášť pre každú službu a stará cache pri výpadku FHB', async () => {
    const calls: string[] = [];
    let down = false;
    const f = (async (url: string | URL | Request) => {
      const u = String(url);
      if (u.endsWith('/login')) return new Response(JSON.stringify({ token: 't', expiration: new Date(Date.now() + 864e5).toISOString() }));
      calls.push(new URL(u).pathname);
      return down ? new Response('x', { status: 503 }) : new Response(JSON.stringify(RAW));
    }) as typeof fetch;
    const client = new FhbClient({ baseUrl: 'https://api-stage.fhb.sk/v3', appId: 'a', secret: 's', fetch: f });
    const t0 = 1_000_000;
    await getPoints('dpd', { client, now: t0 });
    await getPoints('dpd', { client, now: t0 + 3600e3 });
    await getPoints('packeta', { client, now: t0 });
    expect(calls).toEqual(['/v3/delivery-point/dpd_sk', '/v3/delivery-point/zasielkovna_sk']);
    down = true;
    const stale = await getPoints('dpd', { client, now: t0 + 13 * 3600e3 });
    expect(stale.points).toHaveLength(4);
    expect(calls).toHaveLength(3);
  });
});
