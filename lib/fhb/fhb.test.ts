import { beforeEach, describe, expect, test } from 'vitest';
import { buildFhbOrder, FhbBuildError, normalizePhone, parcelServicesFromEnv, type ShipTo } from './build-order';
import { _resetFhbTokenCache, FhbClient, FhbError } from './client';
import { sendOrderToFhb, type OrderForFhb, type OrderStore } from './send';

/* ------------------------------------------------------------ mock FHB servera */
type Call = { method: string; path: string; auth: string | null; body: unknown };
function mockFhb(opts: { tokenTtlSec?: number; fail401Once?: boolean } = {}) {
  const calls: Call[] = [];
  const orders = new Map<string, Record<string, unknown>>();
  let logins = 0;
  let failed401 = false;
  const json = (status: number, body: unknown) => new Response(body == null ? null : JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  const fetchFn = async (url: string | URL | Request, init?: RequestInit) => {
    const u = new URL(String(url));
    const path = u.pathname.replace(/^\/v3/, '');
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    const auth = new Headers(init?.headers).get('X-Authentication-Simple');
    calls.push({ method: init?.method ?? 'GET', path: path + u.search, auth, body });
    if (path === '/login') {
      if (body.secret !== 'tajne') return json(400, { message: 'Invalid AppId or secret' });
      logins++;
      const exp = new Date(Date.now() + (opts.tokenTtlSec ?? 3600) * 1000).toISOString();
      return json(200, { token: `tok${logins}`, expiration: exp });
    }
    if (!auth || !Buffer.from(auth, 'base64').toString().startsWith('tok')) return json(401, { message: 'Unauthorized' });
    if (opts.fail401Once && !failed401) {
      failed401 = true;
      return json(401, { message: 'Unauthorized' });
    }
    if (path === '/order' && init?.method === 'POST') {
      if (orders.has(body.id)) return json(400, { message: 'Invalid request', violations: { id: [{ code: 'NOT_UNIQUE', message: 'Order already exists' }] } });
      if (!body.recipient?.contact?.phone) return json(400, { message: 'Invalid request', violations: { 'recipient.contact.phone': [{ code: 'IS_BLANK_ERROR', message: 'This value should not be blank.' }] } });
      if (body.items.some((i: { id: string }) => i.id === 'NEEXISTUJE')) return json(400, { message: 'Invalid request', violations: { 'items[0].id': [{ code: 'PRODUCT_NOT_FOUND', message: 'Product not found' }] } });
      const o = { ...body, status: 'pending', uid: 'u1' };
      orders.set(body.id, o);
      return json(200, o);
    }
    if (path === '/order' && init?.method === 'GET') {
      const o = orders.get(u.searchParams.get('id') ?? '');
      return o ? json(200, o) : json(404, { message: 'Order not found' });
    }
    if (path === '/order' && init?.method === 'DELETE') {
      const id = u.searchParams.get('id') ?? '';
      const o = orders.get(id);
      if (!o || o.status !== 'pending') return json(400, { message: 'Invalid request', violations: { id: [{ code: 'NOT_UPDATABLE_ORDER_ERROR', message: 'Order cannot be modified in current state.' }] } });
      orders.delete(id);
      return json(204, null);
    }
    if (path === '/product') return json(404, { message: 'Product X not found' });
    if (path === '/delivery-point/nic') return json(404, { message: 'No delivery points available' });
    if (path === '/stock/all') return json(503, 'Service Unavailable');
    return json(200, []);
  };
  return { calls, orders, fetch: fetchFn as typeof fetch, logins: () => logins };
}

const client = (m: ReturnType<typeof mockFhb>, secret = 'tajne') => new FhbClient({ baseUrl: 'https://api-stage.fhb.sk/v3/', appId: 'app', secret, fetch: m.fetch });

beforeEach(() => _resetFhbTokenCache());

describe('FhbClient: login a token', () => {
  test('token sa cachuje a posiela ako base64', async () => {
    const m = mockFhb();
    const c = client(m);
    await c.parcelServices();
    await c.parcelServices();
    expect(m.logins()).toBe(1);
    const call = m.calls.find((x) => x.path === '/parcel-service')!;
    expect(call.auth).toBe(Buffer.from('tok1').toString('base64'));
  });
  test('token blízko expirácie sa obnoví', async () => {
    const m = mockFhb({ tokenTtlSec: 60 }); // menej ako rezerva 120 s
    const c = client(m);
    await c.parcelServices();
    await c.parcelServices();
    expect(m.logins()).toBe(2);
  });
  test('pri 401 jeden nový login a zopakovanie', async () => {
    const m = mockFhb({ fail401Once: true });
    await client(m).parcelServices();
    expect(m.logins()).toBe(2);
  });
  test('zlé prihlasovacie údaje → FhbError 400', async () => {
    const m = mockFhb();
    await expect(client(m, 'zle').parcelServices()).rejects.toMatchObject({ status: 400, message: 'Invalid AppId or secret' });
  });
});

describe('FhbClient: chyby a 404', () => {
  test('400 → FhbError s violations', async () => {
    const m = mockFhb();
    const e = await client(m).createOrder({ id: 'x', variable_symbol: '1', recipient: { address: { name: 'a', street: 'b', city: 'c', zip: 'd', country: 'SK' }, contact: { email: 'a@b.sk', phone: '' } }, items: [{ id: 'A', quantity: 1 }] }).catch((x) => x);
    expect(e).toBeInstanceOf(FhbError);
    expect(e.isValidation).toBe(true);
    expect(e.violations['recipient.contact.phone'][0].code).toBe('IS_BLANK_ERROR');
    expect(e.toJSON()).toMatchObject({ status: 400, message: 'Invalid request', endpoint: 'POST /order' });
  });
  test('404 produkt / objednávka / výdajné miesta → null / []', async () => {
    const m = mockFhb();
    const c = client(m);
    expect(await c.getProduct('X')).toBeNull();
    expect(await c.getOrder('neni')).toBeNull();
    expect(await c.deliveryPoints('nic')).toEqual([]);
  });
  test('5xx je retryable', async () => {
    const m = mockFhb();
    const e = await client(m).stockAll().catch((x) => x);
    expect(e).toMatchObject({ status: 503, isRetryable: true });
  });
  test('DELETE mimo pending → NOT_UPDATABLE_ORDER_ERROR', async () => {
    const m = mockFhb();
    m.orders.set('o1', { id: 'o1', status: 'sent' });
    const e = await client(m).deleteOrder('o1').catch((x) => x);
    expect(e.violations.id[0].code).toBe('NOT_UPDATABLE_ORDER_ERROR');
  });
});

/* ------------------------------------------------------------ buildFhbOrder */
const SHIP: ShipTo = {
  name: 'Ján Novák', email: 'jan@example.sk', phone: '0905 123 456', country: 'sk', delivery_method: 'sps_parcelshop',
  point_id: 'PS-BJRT0558', point_label: 'BAJUS s.r.o., Bardejov', point_address: { street: 'Kpt. Nálepku 423/7', city: 'Bardejov', zip: '085 01' },
};
const OPTS = { siteUrl: 'https://granula.sk/', notifyToken: 'tok123', services: parcelServicesFromEnv({}) };
const ORDER = { id: '6f1c2b1e-0000-4000-8000-000000000001', number: 42, items: [{ sku: 'GRAN-hovadzie-9', qty: 2 }], amountCents: 14490, shipTo: SHIP };

describe('buildFhbOrder', () => {
  test('SPS ParcelShop: služba sps_pudo, výdajné miesto, adresa miesta, telefón +421', () => {
    const b = buildFhbOrder(ORDER, OPTS);
    expect(b).toMatchObject({
      id: ORDER.id, variable_symbol: '42', parcel_service: 'sps_pudo', delivery_point: 'PS-BJRT0558', cod: 0, value: 144.9, validate: false,
      recipient: { address: { name: 'Ján Novák', street: 'Kpt. Nálepku 423/7', city: 'Bardejov', zip: '08501', country: 'SK' }, contact: { email: 'jan@example.sk', phone: '+421905123456' } },
      items: [{ id: 'GRAN-hovadzie-9', quantity: 2 }],
    });
    expect(b.notification?.delivered).toBe(`https://granula.sk/api/fhb/notify/delivered/${ORDER.id}?t=tok123`);
  });
  test('kuriér: vlastná adresa, bez výdajného miesta, bez parcel_service kým nie je nastavený', () => {
    const b = buildFhbOrder({ ...ORDER, shipTo: { ...SHIP, delivery_method: 'sps_courier', point_id: null, street: 'Hlavná 1', city: 'Košice', zip: '04001' } }, OPTS);
    expect(b.delivery_point).toBeUndefined();
    expect(b.parcel_service).toBeUndefined();
    expect(b.recipient.address.street).toBe('Hlavná 1');
    expect(b.validate).toBe(true);
    const off = buildFhbOrder({ ...ORDER, shipTo: { ...SHIP, delivery_method: 'sps_courier', point_id: null, street: 'Hlavná 1', city: 'Košice', zip: '04001' } }, { ...OPTS, validateAddress: false });
    expect(off.validate).toBe(false);
  });
  test('Packeta bez nastaveného kódu služby → chyba skôr, než sa volá FHB', () => {
    expect(() => buildFhbOrder({ ...ORDER, shipTo: { ...SHIP, delivery_method: 'packeta_point' } }, OPTS)).toThrow(FhbBuildError);
    const b = buildFhbOrder({ ...ORDER, shipTo: { ...SHIP, delivery_method: 'packeta_point' } }, { ...OPTS, services: { packeta_point: 'packeta_x' } });
    expect(b.parcel_service).toBe('packeta_x');
  });
  test('lokálne validácie', () => {
    expect(() => buildFhbOrder({ ...ORDER, number: 12345678901 }, OPTS)).toThrow(/variable_symbol/);
    expect(() => buildFhbOrder({ ...ORDER, items: [] }, OPTS)).toThrow(/items/);
    expect(() => buildFhbOrder({ ...ORDER, shipTo: { ...SHIP, email: 'a'.repeat(46) + '@x.sk' } }, OPTS)).toThrow(/50/);
    expect(() => buildFhbOrder({ ...ORDER, shipTo: { ...SHIP, phone: '12' } }, OPTS)).toThrow(/telef/);
    expect(() => buildFhbOrder({ ...ORDER, shipTo: { ...SHIP, point_id: '' } }, OPTS)).toThrow(/delivery_point/);
    expect(() => buildFhbOrder({ ...ORDER, shipTo: { ...SHIP, point_address: null } }, OPTS)).toThrow(/recipient.address/);
  });
  test('normalizePhone', () => {
    expect(normalizePhone('0905 123 456')).toBe('+421905123456');
    expect(normalizePhone('+421 905-123-456')).toBe('+421905123456');
    expect(normalizePhone('00420 601 123 456')).toBe('+420601123456');
    expect(normalizePhone('421905123456')).toBe('+421905123456');
    expect(normalizePhone('abc')).toBeNull();
  });
});

/* ------------------------------------------------------------ sendOrderToFhb */
function memStore(o: OrderForFhb) {
  const rows = new Map<string, OrderForFhb & { fhb_error?: unknown }>([[o.id, { ...o }]]);
  const store: OrderStore = {
    load: async (id) => rows.get(id) ?? null,
    update: async (id, patch) => void Object.assign(rows.get(id)!, patch),
  };
  return { store, row: () => rows.get(o.id)! };
}
const ROW: OrderForFhb = { id: ORDER.id, number: 42, status: 'paid', amount_cents: 14490, items: ORDER.items, ship_to: SHIP as never };

describe('sendOrderToFhb', () => {
  test('OK → sent_to_fhb; druhé volanie sa preskočí (idempotencia)', async () => {
    const m = mockFhb();
    const s = memStore(ROW);
    const deps = { client: client(m), store: s.store, options: OPTS };
    expect(await sendOrderToFhb(ROW.id, deps)).toMatchObject({ ok: true, state: 'sent' });
    expect(s.row()).toMatchObject({ status: 'sent_to_fhb', fhb_error: null });
    expect(await sendOrderToFhb(ROW.id, deps)).toMatchObject({ state: 'skipped' });
    expect(m.calls.filter((c) => c.path === '/order' && c.method === 'POST')).toHaveLength(1);
  });
  test('objednávka už vo FHB (prvý POST prešiel, zápis do DB nie) → already_in_fhb', async () => {
    const m = mockFhb();
    m.orders.set(ROW.id, { id: ROW.id, status: 'pending' });
    const s = memStore({ ...ROW, status: 'fhb_error' });
    expect(await sendOrderToFhb(ROW.id, { client: client(m), store: s.store, options: OPTS })).toMatchObject({ ok: true, state: 'already_in_fhb' });
    expect(s.row().status).toBe('sent_to_fhb');
  });
  test('400 od FHB → fhb_error so štruktúrou violations', async () => {
    const m = mockFhb();
    const s = memStore({ ...ROW, items: [{ sku: 'NEEXISTUJE', qty: 1 }] });
    const r = await sendOrderToFhb(ROW.id, { client: client(m), store: s.store, options: OPTS });
    expect(r).toMatchObject({ ok: false, state: 'fhb_error' });
    expect(s.row().status).toBe('fhb_error');
    expect(s.row().fhb_error).toMatchObject({ status: 400, violations: { 'items[0].id': [{ code: 'PRODUCT_NOT_FOUND' }] } });
  });
  test('lokálna validácia → fhb_error bez volania FHB', async () => {
    const m = mockFhb();
    const s = memStore({ ...ROW, ship_to: { ...SHIP, phone: 'x' } as never });
    expect(await sendOrderToFhb(ROW.id, { client: client(m), store: s.store, options: OPTS })).toMatchObject({ state: 'fhb_error' });
    expect(m.calls).toHaveLength(0);
  });
});

/* ------------------------------------------------------------ príjemky tovaru a archivácia */
describe('FhbClient: stock-receipt a archive', () => {
  function receiptMock() {
    const receipts = new Map<string, Record<string, unknown>>();
    const calls: string[] = [];
    const f = (async (url: string | URL | Request, init?: RequestInit) => {
      const u = new URL(String(url));
      const path = u.pathname.replace(/^\/v3/, '');
      const m = init?.method ?? 'GET';
      calls.push(`${m} ${path}${u.search}`);
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      const res = (s: number, b: unknown) => new Response(b == null ? null : JSON.stringify(b), { status: s });
      if (path === '/login') return res(200, { token: 't', expiration: new Date(Date.now() + 3600e3).toISOString() });
      const id = u.searchParams.get('id') ?? body?.id;
      if (path === '/product/archive') return id === 'GRAN-x-4' ? res(204, null) : res(400, { message: 'Invalid request', violations: { id: [{ code: 'NOT_EXISTING_PRODUCT_ERROR', message: 'Product does not exist.' }] } });
      if (path !== '/stock-receipt') return res(404, { message: 'nie' });
      if (m === 'POST') {
        if (body.items.some((i: { id: string }) => i.id.endsWith('-18'))) return res(400, { message: 'Invalid request', violations: { 'items[0].id': [{ code: '', message: `Product "${body.items[0].id}" is multi product` }] } });
        const r = { ...body, status: 'created', items: body.items.map((i: object) => ({ ...i, received: 0 })) };
        receipts.set(id, r);
        return res(200, r);
      }
      const r = receipts.get(id);
      if (!r) return res(404, { message: `Stock receipt ${id} not found` });
      if (m === 'GET') return res(200, r);
      if (r.status !== 'created') return res(400, { message: 'Invalid request' });
      if (m === 'PUT') { Object.assign(r, body); return res(200, r); }
      receipts.delete(id);
      return res(204, null);
    }) as typeof fetch;
    return { f, calls, receipts };
  }
  const c = (f: typeof fetch) => new FhbClient({ baseUrl: 'https://api-stage.fhb.sk/v3', appId: 'a', secret: 's', fetch: f });

  test('založiť → prečítať → upraviť → zmazať', async () => {
    const m = receiptMock();
    const fhb = c(m.f);
    const r = await fhb.createStockReceipt({ id: 'PRIJEM-1', name: 'Prvý príjem', items: [{ id: 'GRAN-hovadzie-9', quantity: 40 }] });
    expect(r).toMatchObject({ status: 'created', items: [{ id: 'GRAN-hovadzie-9', quantity: 40, received: 0 }] });
    expect((await fhb.getStockReceipt('PRIJEM-1'))?.name).toBe('Prvý príjem');
    await fhb.updateStockReceipt('PRIJEM-1', { name: 'Prvý príjem', items: [{ id: 'GRAN-hovadzie-9', quantity: 50 }] });
    expect((await fhb.getStockReceipt('PRIJEM-1'))?.items?.[0].quantity).toBe(50);
    await fhb.deleteStockReceipt('PRIJEM-1');
    expect(await fhb.getStockReceipt('PRIJEM-1')).toBeNull();
    expect(m.calls).toContain('PUT /stock-receipt?id=PRIJEM-1');
  });
  test('sada 18 kg nemôže byť v príjemke (FHB 400)', async () => {
    const e = await c(receiptMock().f).createStockReceipt({ id: 'P2', name: 'x', items: [{ id: 'GRAN-hovadzie-18', quantity: 1 }] }).catch((x) => x);
    expect(e).toMatchObject({ status: 400 });
    expect(JSON.stringify(e.violations)).toMatch(/multi product/);
  });
  test('archivácia produktu cez GET /product/archive', async () => {
    const m = receiptMock();
    await c(m.f).archiveProduct('GRAN-x-4');
    expect(m.calls).toContain('GET /product/archive?id=GRAN-x-4');
    await expect(c(m.f).archiveProduct('neni')).rejects.toMatchObject({ status: 400 });
  });
  test('skladová notifikácia: /api/fhb/stock-notify?t=…', async () => {
    const { stockNotifyUrl } = await import('./build-order');
    expect(stockNotifyUrl('https://granula.sk/', 'a b')).toBe('https://granula.sk/api/fhb/stock-notify?t=a%20b');
  });
});
