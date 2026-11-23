import type Stripe from 'stripe';
import { describe, expect, test, vi } from 'vitest';
import type { FhbClient } from './fhb/client';
import type { ShipTo } from './fhb/build-order';
import { bagOfItems, cancelOrder, createReship, fhbState, fhbUpdateBody, paymentIntentOf, refundOrder, updateOrderDelivery, type Order, type OrderStore } from './order-actions';

const SHIP: ShipTo = { name: 'Ján Novák', email: 'jan@example.sk', phone: '+421905123456', country: 'SK', delivery_method: 'dpd_pickup', point_id: 'SK21286', point_label: 'Cyklo', point_address: { street: 'Hlavná 1', city: 'Žilina', zip: '01001' } };
const OPTS = { siteUrl: 'https://www.granula.sk', notifyToken: 't', services: { dpd_pickup: 'dpd_sk', packeta_point: 'zasielkovna_sk' } };

const order = (over: Partial<Order> = {}): Order => ({
  id: 'o1', number: 12, customer_id: 'c1', subscription_id: 's1', kind: 'first', stripe_ref: 'cs_1', amount_cents: 6750, items: [{ sku: 'GRAN-hovadzie-9', qty: 1 }],
  ship_to: SHIP as never, status: 'sent_to_fhb', fhb_error: null, tracking: null, shipped_at: null, delivered_at: null, reship_of: null, created_at: '', updated_at: '', ...over,
});

function mem(o: Order) {
  const rows = new Map([[o.id, { ...o }]]);
  const store: OrderStore = {
    getOrder: async (id) => rows.get(id) ?? null,
    updateOrder: async (id, p) => void rows.set(id, { ...rows.get(id)!, ...p } as Order),
    insertOrder: async (r) => {
      const x = order({ ...(r as Partial<Order>), id: `o${rows.size + 1}`, number: 100 + rows.size });
      rows.set(x.id, x);
      return x;
    },
    countReships: async (id) => [...rows.values()].filter((r) => r.reship_of === id).length,
  };
  return { store, rows };
}

function fhbMock(status: string | null | Error) {
  return {
    getOrder: vi.fn(async () => {
      if (status instanceof Error) throw status;
      return status ? { id: 'GR-000012', status } : null;
    }),
    updateOrder: vi.fn(async () => ({})),
    deleteOrder: vi.fn(async () => undefined),
  } as unknown as FhbClient & { updateOrder: ReturnType<typeof vi.fn>; deleteOrder: ReturnType<typeof vi.fn> };
}

describe('stav vo FHB a upraviteľnosť', () => {
  test('pending vo FHB → úprava vo FHB', async () => expect((await fhbState(order(), fhbMock('pending'))).mode).toBe('fhb'));
  test('FHB už spracúva → nie', async () => expect((await fhbState(order({ status: 'confirmed' }), fhbMock('confirmed'))).mode).toBe('none'));
  test('fhb_error a vo FHB nie je → iba u nás', async () => expect((await fhbState(order({ status: 'fhb_error' }), fhbMock(null))).mode).toBe('local'));
  test('odoslaná / zrušená → nie', async () => {
    expect((await fhbState(order({ status: 'sent' }), fhbMock(null))).mode).toBe('none');
    expect((await fhbState(order({ status: 'cancelled' }), fhbMock(null))).mode).toBe('none');
  });
  test('výpadok FHB → nie, s dôvodom', async () => {
    const s = await fhbState(order(), fhbMock(new Error('timeout')));
    expect(s).toMatchObject({ mode: 'none', unavailable: true });
  });
  test('balenie z položiek', () => {
    expect(bagOfItems([{ sku: 'GRAN-morka-hus-kacica-18', qty: 1 }])).toBe('18');
    expect(() => bagOfItems([])).toThrow();
  });
});

describe('úprava doručenia a storno', () => {
  test('PUT /order bez id a validate, ship_to v DB', async () => {
    const { store, rows } = mem(order());
    const fhb = fhbMock('pending');
    const next = { ...SHIP, point_id: 'SK99999' };
    const r = await updateOrderDelivery('o1', next, { store, fhb, fhbOptions: OPTS });
    expect(r.mode).toBe('fhb');
    const [id, body] = fhb.updateOrder.mock.calls[0];
    expect(id).toBe('GR-000012');
    expect(body).not.toHaveProperty('id');
    expect(body).not.toHaveProperty('validate');
    expect(body).toMatchObject({ delivery_point: 'SK99999', variable_symbol: '12', parcel_service: 'dpd_sk' });
    expect((rows.get('o1')!.ship_to as unknown as ShipTo).point_id).toBe('SK99999');
  });
  test('fhb_error: iba u nás, bez volania FHB', async () => {
    const { store } = mem(order({ status: 'fhb_error' }));
    const fhb = fhbMock(null);
    expect((await updateOrderDelivery('o1', SHIP, { store, fhb, fhbOptions: OPTS })).mode).toBe('local');
    expect(fhb.updateOrder).not.toHaveBeenCalled();
  });
  test('storno v pending → DELETE + cancelled', async () => {
    const { store, rows } = mem(order());
    const fhb = fhbMock('pending');
    await cancelOrder('o1', { store, fhb });
    expect(fhb.deleteOrder).toHaveBeenCalledWith('GR-000012');
    expect(rows.get('o1')!.status).toBe('cancelled');
  });
  test('storno, keď sa už balí → chyba, nič sa nemení', async () => {
    const { store, rows } = mem(order({ status: 'confirmed' }));
    await expect(cancelOrder('o1', { store, fhb: fhbMock('confirmed') })).rejects.toThrow(/Storno nie je možné/);
    expect(rows.get('o1')!.status).toBe('confirmed');
  });
  test('telo PUT má adresu výdajného miesta', () => {
    const b = fhbUpdateBody(order(), SHIP, OPTS);
    expect(b.recipient.address).toMatchObject({ street: 'Hlavná 1', zip: '01001' });
  });
});

function stripeMock(o: { refunded?: number; amount?: number } = {}) {
  const created: { params: Stripe.RefundCreateParams; key?: string }[] = [];
  const s = {
    checkout: { sessions: { retrieve: vi.fn(async (id: string) => (id === 'cs_pay' ? { payment_intent: 'pi_1', invoice: null } : { payment_intent: null, invoice: 'in_first' })) } },
    invoicePayments: { list: vi.fn(async () => ({ data: [{ status: 'paid', payment: { payment_intent: 'pi_inv' } }] })) },
    paymentIntents: {
      retrieve: vi.fn(async (id: string) => ({ id, status: 'succeeded', amount: o.amount ?? 6750, amount_received: o.amount ?? 6750, latest_charge: { id: 'ch_1', amount_refunded: o.refunded ?? 0, payment_method_details: { type: 'card', card: { brand: 'visa', last4: '4242' } }, receipt_url: null } })),
    },
    refunds: {
      list: vi.fn(async () => ({ data: [] })),
      create: vi.fn(async (params: Stripe.RefundCreateParams, opts?: { idempotencyKey?: string }) => {
        created.push({ params, key: opts?.idempotencyKey });
        return { id: 're_1', amount: params.amount, status: 'succeeded' };
      }),
    },
  } as unknown as Stripe;
  return { s, created };
}

describe('platba a refund', () => {
  test('PaymentIntent: jednorazová Session, predplatné cez faktúru, obnovenie', async () => {
    const { s } = stripeMock();
    expect(await paymentIntentOf('cs_pay', s)).toBe('pi_1');
    expect(await paymentIntentOf('cs_sub', s)).toBe('pi_inv');
    expect(await paymentIntentOf('in_1', s)).toBe('pi_inv');
    expect(await paymentIntentOf('reship:o1:1', s)).toBeNull();
  });
  test('celý refund → refunded, metadata app=granula, idempotency key', async () => {
    const { store, rows } = mem(order({ stripe_ref: 'cs_pay' }));
    const { s, created } = stripeMock();
    const r = await refundOrder('o1', null, { store, stripe: s });
    expect(r.full).toBe(true);
    expect(created[0].params).toMatchObject({ payment_intent: 'pi_1', amount: 6750, metadata: { app: 'granula', order_number: '12' } });
    expect(created[0].key).toBe('granula-refund:o1:6750:0');
    expect(rows.get('o1')!.status).toBe('refunded');
  });
  test('čiastočný refund nemení stav; viac ako zostatok nie', async () => {
    const { store, rows } = mem(order({ stripe_ref: 'cs_pay' }));
    const { s } = stripeMock({ refunded: 1000 });
    const r = await refundOrder('o1', 500, { store, stripe: s });
    expect(r).toMatchObject({ full: false, refundedTotal: 1500 });
    expect(rows.get('o1')!.status).toBe('sent_to_fhb');
    await expect(refundOrder('o1', 6000, { store, stripe: s })).rejects.toThrow(/Suma musí byť/);
  });
  test('opätovné odoslanie bez platby nie je čo vrátiť', async () => {
    const { store } = mem(order({ amount_cents: 0, stripe_ref: 'reship:x:1' }));
    await expect(refundOrder('o1', null, { store, stripe: stripeMock().s })).rejects.toThrow(/bez platby/);
  });
});

describe('opätovné odoslanie', () => {
  test('vrátená → nová objednávka paid, 0 €, reship_of, unikátny stripe_ref', async () => {
    const { store } = mem(order({ status: 'returned' }));
    const a = await createReship('o1', { store });
    const b = await createReship('o1', { store });
    expect(a).toMatchObject({ status: 'paid', amount_cents: 0, reship_of: 'o1', kind: 'first', subscription_id: 's1', stripe_ref: 'reship:o1:1' });
    expect(b.stripe_ref).toBe('reship:o1:2');
  });
  test('zaplatená, ešte neodoslaná → nie', async () => {
    const { store } = mem(order({ status: 'paid' }));
    await expect(createReship('o1', { store })).rejects.toThrow();
  });
});
