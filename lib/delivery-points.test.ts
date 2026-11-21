import { beforeEach, describe, expect, test } from 'vitest';
import { _resetFhbTokenCache, FhbClient } from './fhb/client';
import { _resetPointsCache, fold, getSpsPoints, normalizeSpsPoints, searchPoints, type DeliveryPoint } from './delivery-points';
import { SPS_MOCK_POINTS } from './delivery-points.mock';

const RAW = [
  { id: 10900000, external_code: 'PS-BAME1217', name: 'TREBOR', street: 'Stará Vajnorská 12545/19', city: 'Bratislava', zip: '831 04', country: 'sk' },
  { id: 10918682, external_code: 'SPS-D006393', name: 'balíkovo box – Bratislava - Petržalka', street: 'Panónska cesta 3684', city: 'Bratislava', zip: '85101', country: 'sk' },
  { id: 10900718, external_code: 'PS-BJRT0558', name: 'BAJUS s.r.o.', street: 'Kpt. Nálepku 423/7', city: 'Bardejov', zip: '08501', country: 'sk' },
  { id: 1, external_code: 'PS-ZA1', name: 'Kníhkupectvo', street: 'Národná 1', city: 'Žilina', zip: '01001', country: 'sk' },
];

beforeEach(() => { _resetPointsCache(); _resetFhbTokenCache(); });

describe('výdajné miesta SPS', () => {
  test('normalizácia: id = external_code, PSČ bez medzier, box vs ParcelShop', () => {
    const p = normalizeSpsPoints(RAW as never);
    expect(p[0]).toEqual({ id: 'PS-BAME1217', name: 'TREBOR', street: 'Stará Vajnorská 12545/19', city: 'Bratislava', zip: '83104', country: 'SK', kind: 'parcelshop' });
    expect(p[1].kind).toBe('box');
  });
  test('hľadanie bez diakritiky, podľa PSČ, ParcelShopy pred boxami', () => {
    const p = normalizeSpsPoints(RAW as never);
    expect(searchPoints(p, 'zilina').map((x) => x.id)).toEqual(['PS-ZA1']);
    expect(searchPoints(p, '010 01').map((x) => x.id)).toEqual(['PS-ZA1']);
    expect(searchPoints(p, '85').map((x) => x.id)).toEqual(['SPS-D006393']);
    expect(searchPoints(p, 'Bratislava').map((x) => x.kind)).toEqual(['parcelshop', 'box']);
    expect(searchPoints(p, 'petrzalka panonska').map((x) => x.id)).toEqual(['SPS-D006393']);
    expect(searchPoints(p, 'b')).toEqual([]);
    expect(fold('  Žilina  Vlčince ')).toBe('zilina vlcince');
  });
  test('limit výsledkov', () => {
    const many: DeliveryPoint[] = Array.from({ length: 100 }, (_, i) => ({ id: `PS-${i}`, name: `Miesto ${i}`, street: 'Ulica', city: 'Košice', zip: '04001', country: 'SK', kind: 'parcelshop' }));
    expect(searchPoints(many, 'kosice')).toHaveLength(40);
  });
  test('bez FHB kľúčov testovacie dáta s kódmi TEST-', async () => {
    const env = { ...process.env };
    delete process.env.FHB_API_URL;
    try {
      const r = await getSpsPoints();
      expect(r.source).toBe('mock');
      expect(r.points.every((p) => p.id.startsWith('TEST-') && p.lat != null)).toBe(true);
      expect(r.points).toBe(SPS_MOCK_POINTS);
    } finally { process.env = env; }
  });
  test('cache 12 h a stará cache pri výpadku FHB', async () => {
    let calls = 0, down = false;
    const f = (async (url: string | URL | Request) => {
      const u = String(url);
      if (u.endsWith('/login')) return new Response(JSON.stringify({ token: 't', expiration: new Date(Date.now() + 864e5).toISOString() }));
      calls++;
      return down ? new Response('x', { status: 503 }) : new Response(JSON.stringify(RAW));
    }) as typeof fetch;
    const client = new FhbClient({ baseUrl: 'https://api-stage.fhb.sk/v3', appId: 'a', secret: 's', fetch: f });
    const t0 = 1_000_000;
    expect((await getSpsPoints({ client, now: t0 })).points).toHaveLength(4);
    await getSpsPoints({ client, now: t0 + 3600e3 });
    expect(calls).toBe(1);
    down = true;
    const stale = await getSpsPoints({ client, now: t0 + 13 * 3600e3 });
    expect(stale.source).toBe('fhb');
    expect(stale.points).toHaveLength(4);
    expect(calls).toBe(2);
  });
});
