import { describe, expect, test, vi } from 'vitest';
import { addDays, changePlan, chargeTime, estimatedDelivery, firstRenewal, moveNextCharge, nextChargeAfterChange, pause, recomputeOnDelivery, skipDelivery } from './subscription-schedule';

const C = { leadDays: 7, shipDays: 3 };
const d = (s: string) => new Date(s);
const iso = (x: Date) => x.toISOString();

describe('cyklus (SPEC §1)', () => {
  test('prvé obnovenie = doručenie + D − LEAD, o 06:00 UTC', () => {
    const paid = d('2026-12-01T15:30:00Z');
    const delivered = estimatedDelivery(paid, C);
    expect(iso(delivered)).toBe('2026-12-04T00:00:00.000Z');
    expect(iso(firstRenewal({ deliveredAt: delivered, days: 37, ...C, now: paid }))).toBe('2027-01-03T06:00:00.000Z'); // 4. 12. + 30 dní
  });
  test('najskôr zajtra (krátka výdrž)', () => {
    const now = d('2026-12-01T10:00:00Z');
    expect(iso(firstRenewal({ deliveredAt: d('2026-12-01T00:00:00Z'), days: 5, ...C, now }))).toBe('2026-12-02T06:00:00.000Z');
  });
  test('zmena D: posledné doručenie + D_nové − LEAD', () => {
    expect(iso(nextChargeAfterChange({ lastDeliveredAt: d('2026-12-10T00:00:00Z'), days: 40, ...C, now: d('2026-12-12T00:00:00Z') }))).toBe('2027-01-12T06:00:00.000Z');
  });
  test('prepočet po skutočnom doručení iba pri rozdiele > 1 deň a v budúcnosti', () => {
    const current = d('2027-01-03T06:00:00Z');
    expect(recomputeOnDelivery({ current, deliveredAt: d('2026-12-04T12:00:00Z'), days: 37, ...C, now: d('2026-12-05T00:00:00Z') })).toBeNull();
    expect(iso(recomputeOnDelivery({ current, deliveredAt: d('2026-12-07T00:00:00Z'), days: 37, ...C, now: d('2026-12-08T00:00:00Z') })!)).toBe('2027-01-06T06:00:00.000Z');
    expect(recomputeOnDelivery({ current, deliveredAt: d('2026-11-01T00:00:00Z'), days: 10, ...C, now: d('2026-12-08T00:00:00Z') })).toBeNull();
  });
  test('addDays a chargeTime', () => {
    expect(iso(addDays(d('2026-12-31T23:59:00Z'), 1))).toBe('2027-01-01T00:00:00.000Z');
    expect(iso(chargeTime(d('2026-12-31T23:59:00Z')))).toBe('2026-12-31T06:00:00.000Z');
  });
});

function fakeStripe() {
  const update = vi.fn(async (_id: string, p: unknown) => ({ id: _id, p }));
  const retrieve = vi.fn(async (id: string) => ({ id, items: { data: [{ id: 'si_food' }, { id: 'si_ship' }] } }));
  const cancel = vi.fn(async (id: string) => ({ id }));
  return { s: { subscriptions: { update, retrieve, cancel } } as never, update, retrieve, cancel };
}

describe('úpravy predplatného v Stripe', () => {
  test('posun a preskočenie: trial_end + proration none', async () => {
    const f = fakeStripe();
    await moveNextCharge('sub_1', d('2027-01-10T06:00:00Z'), f.s);
    expect(f.update).toHaveBeenLastCalledWith('sub_1', { trial_end: 1799560800, proration_behavior: 'none' });
    await skipDelivery('sub_1', d('2027-01-10T06:00:00Z'), 30, f.s);
    expect(f.update.mock.lastCall![1]).toMatchObject({ trial_end: Math.floor(d('2027-02-09T00:00:00Z').getTime() / 1000), proration_behavior: 'none' });
  });
  test('zmena D/ceny v JEDNOM update: staré položky preč, nové s intervalom D, trial_end, bez prorácie', async () => {
    const f = fakeStripe();
    await changePlan('sub_1', { productId: 'granula-GRAN-hovadzie-9', unitAmountCents: 6750, days: 40, shippingCents: 490, shippingProductId: 'granula-doprava', nextCharge: d('2027-01-12T06:00:00Z') }, f.s);
    expect(f.update).toHaveBeenCalledTimes(1);
    const p = f.update.mock.calls[0][1] as { items: unknown[]; trial_end: number; proration_behavior: string };
    expect(p.proration_behavior).toBe('none');
    expect(p.trial_end).toBe(Math.floor(d('2027-01-12T06:00:00Z').getTime() / 1000));
    expect(p.items).toEqual([
      { id: 'si_food', deleted: true }, { id: 'si_ship', deleted: true },
      { price_data: { currency: 'eur', product: 'granula-GRAN-hovadzie-9', unit_amount: 6750, recurring: { interval: 'day', interval_count: 40 } }, quantity: 1 },
      { price_data: { currency: 'eur', product: 'granula-doprava', unit_amount: 490, recurring: { interval: 'day', interval_count: 40 } }, quantity: 1 },
    ]);
  });
  test('pauza: pause_collection void', async () => {
    const f = fakeStripe();
    await pause('sub_1', undefined, f.s);
    expect(f.update).toHaveBeenLastCalledWith('sub_1', { pause_collection: { behavior: 'void' } });
  });
});
