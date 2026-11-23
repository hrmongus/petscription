import { describe, expect, test, vi } from 'vitest';
import { applyFhbOrder, targetStatus, type DbOrder, type DbSubscription, type SyncStore } from './sync';

const CYCLE = { leadDays: 7, shipDays: 3 };
const SHIP = { name: 'Ján Novák', email: 'jan@example.sk', phone: '+421905123456', country: 'SK', delivery_method: 'dpd_pickup', point_id: 'SK21286', point_label: 'Pavel Lóška Cyklo-Šport' };
const order = (over: Partial<DbOrder> = {}): DbOrder => ({ id: 'o1', number: 12, customer_id: 'c1', subscription_id: 's1', kind: 'first', stripe_ref: 'cs_1', amount_cents: 7240, items: [{ sku: 'GRAN-hovadzie-9', qty: 1 }], ship_to: SHIP, status: 'sent_to_fhb', fhb_error: null, tracking: null, shipped_at: null, delivered_at: null, created_at: '', updated_at: '', ...over });

function mem(sub?: Partial<DbSubscription>) {
  const orders: Record<string, unknown>[] = [], subs: Record<string, unknown>[] = [], audits: { action: string }[] = [];
  const s: DbSubscription = { id: 's1', customer_id: 'c1', dog_id: 'd1', address_id: 'a1', stripe_subscription_id: 'sub_1', status: 'active', product_id: 'hovadzie', bag_id: '9', grams_per_day: 240, days_per_bag: 37, unit_amount_cents: 6750, plan: 'mesiac', next_charge_at: '2027-02-06T06:00:00.000Z', last_delivered_at: null, engine_snapshot: null, created_at: '', updated_at: '', ...sub };
  const store: SyncStore = {
    updateOrder: async (_id, p) => void orders.push(p),
    getSubscription: async () => s,
    updateSubscription: async (_id, p) => void subs.push(p),
    getCustomer: async () => ({ email: 'jan@example.sk', name: 'Ján Novák' }),
    getDogForOrder: async () => ({ name: 'Bodka', sex: 'fenka' }),
    audit: async (r) => void audits.push(r),
  };
  const update = vi.fn(async () => ({}));
  const mail = vi.fn(async () => 'sent' as const);
  return { store, orders, subs, audits, update, mail, stripe: { subscriptions: { update } } as never };
}

describe('targetStatus', () => {
  test('stavy FHB → náš stav', () => {
    expect(targetStatus({ status: 'pending' } as never)).toBe('sent_to_fhb');
    expect(targetStatus({ status: 'confirmed' } as never)).toBe('confirmed');
    expect(targetStatus({ status: 'packed' } as never)).toBe('confirmed');
    expect(targetStatus({ status: 'sent' } as never)).toBe('sent');
    expect(targetStatus({ status: 'confirmed', shipped_at: '2027-01-05' } as never)).toBe('sent');
    expect(targetStatus({ status: 'delivered' } as never)).toBe('delivered');
    expect(targetStatus({ status: 'sent', returned_at: '2027-01-09' } as never)).toBe('returned');
    expect(targetStatus({ status: 'rejected' } as never)).toBe('fhb_error');
  });
});

describe('applyFhbOrder', () => {
  test('odoslané: stav, tracking, shipped_at, email s trackingom', async () => {
    const m = mem();
    const r = await applyFhbOrder(order(), { id: 'GR-000012', status: 'sent', shipped_at: '2027-01-05T10:00:00+0100', tracking_numbers: ['123'], tracking_links: ['https://t.example/123'] } as never, { ...m, cycle: CYCLE, siteUrl: 'https://www.granula.sk' });
    expect(r).toMatchObject({ from: 'sent_to_fhb', to: 'sent' });
    expect(m.orders[0]).toMatchObject({ status: 'sent', shipped_at: '2027-01-05T09:00:00.000Z', tracking: { numbers: ['123'], links: ['https://t.example/123'] } });
    expect(m.mail).toHaveBeenCalledTimes(1);
    expect((m.mail.mock.calls[0] as unknown[])[0]).toMatchObject({ key: 'shipped:o1', to: 'jan@example.sk' });
    expect(m.audits.map((a) => a.action)).toEqual(['order.status.sent']);
  });
  test('stav iba dopredu; zrušená objednávka sa nemení; bez zmeny nič nezapíše', async () => {
    const m = mem();
    expect((await applyFhbOrder(order({ status: 'delivered', delivered_at: '2027-01-06T10:00:00.000Z' }), { status: 'sent' } as never, { ...m, cycle: CYCLE })).changed).toEqual([]);
    expect((await applyFhbOrder(order({ status: 'cancelled' }), { status: 'delivered', delivered_at: '2027-01-06' } as never, { ...m, cycle: CYCLE })).changed).toEqual([]);
    expect((await applyFhbOrder(order(), { status: 'pending' } as never, { ...m, cycle: CYCLE })).changed).toEqual([]);
    expect(m.orders).toHaveLength(0);
    expect(m.mail).not.toHaveBeenCalled();
  });
  test('doručená prvá objednávka: last_delivered_at + prvé obnovenie podľa skutočného doručenia (trial_end)', async () => {
    const m = mem();
    // zaplatené 4. 1., odhad doručenia 7. 1. → obnovenie 6. 2.; skutočne doručené až 10. 1. → 10. 1. + (37 − 7) = 9. 2. 06:00 UTC
    const now = () => new Date('2027-01-10T12:00:00Z');
    await applyFhbOrder(order({ status: 'sent' }), { status: 'delivered', delivered_at: '2027-01-10T11:00:00+0100' } as never, { ...m, cycle: CYCLE, now });
    expect(m.orders[0]).toMatchObject({ status: 'delivered', delivered_at: '2027-01-10T10:00:00.000Z' });
    expect(m.update).toHaveBeenCalledWith('sub_1', { trial_end: Date.parse('2027-02-09T06:00:00Z') / 1000, proration_behavior: 'none' });
    expect(m.subs[0]).toMatchObject({ last_delivered_at: '2027-01-10T10:00:00.000Z', next_charge_at: '2027-02-09T06:00:00.000Z' });
    expect(m.mail).not.toHaveBeenCalled(); // pri skoku na delivered sa „odoslané“ už neposiela
  });
  test('doručenie do 1 dňa od odhadu a renewal: bez posunu platby, iba last_delivered_at', async () => {
    const m = mem();
    const now = () => new Date('2027-01-08T12:00:00Z');
    await applyFhbOrder(order({ status: 'sent' }), { status: 'delivered', delivered_at: '2027-01-07T15:00:00Z' } as never, { ...m, cycle: CYCLE, now });
    await applyFhbOrder(order({ status: 'sent', kind: 'renewal' }), { status: 'delivered', delivered_at: '2027-01-12T15:00:00Z' } as never, { ...m, cycle: CYCLE, now });
    expect(m.update).not.toHaveBeenCalled();
    expect(m.subs).toEqual([{ last_delivered_at: '2027-01-07T15:00:00.000Z' }, { last_delivered_at: '2027-01-12T15:00:00.000Z' }]);
  });
  test('rejected → fhb_error so štruktúrou', async () => {
    const m = mem();
    await applyFhbOrder(order(), { status: 'rejected' } as never, { ...m, cycle: CYCLE });
    expect(m.orders[0]).toMatchObject({ status: 'fhb_error', fhb_error: { status: 'rejected' } });
  });
});
