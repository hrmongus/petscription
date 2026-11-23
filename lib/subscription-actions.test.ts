import type Stripe from 'stripe';
import { describe, expect, test, vi } from 'vitest';
import { quote } from './engine-server';
import { applyPlanChange, previewPlanChange, type DogRow, type SubRow } from './subscription-actions';

const ANSWERS = { dogname: 'Bruno', sex: 'pes', breed: 'krizenec-stredny', kg: 17, years: '4', months: '0', weeks: '', activity: 'mesto', neutered: 'ano', pregnant: '', body: 'akurat', focus: [], allergies: [], recipe: '', recipeFor: '' };
const CYCLE = { leadDays: 7, shipDays: 3 };
const NOW = new Date('2026-12-01T10:00:00Z');
const base = quote({ answers: ANSWERS, plan: 'mesiac', bagId: '9' });

const sub = (over: Partial<SubRow> = {}): SubRow => ({
  id: 's1', customer_id: 'c1', dog_id: 'd1', address_id: 'a1', stripe_subscription_id: 'sub_1', status: 'active', product_id: base.productId, bag_id: '9',
  grams_per_day: base.gramsPerDay, days_per_bag: base.daysPerBag, unit_amount_cents: base.unitAmountCents, plan: 'mesiac',
  next_charge_at: '2026-12-20T06:00:00.000Z', last_delivered_at: '2026-11-20T10:00:00.000Z', engine_snapshot: null, cancel_at: null, cancel_reason: null, cancel_requested_at: null, created_at: '', updated_at: '', ...over,
});
const dog: DogRow = { id: 'd1', customer_id: 'c1', name: 'Bruno', answers: ANSWERS, weight_kg: 17, birth_date: '2022-12-01', created_at: '', updated_at: '' };
const DPD = { delivery_method: 'dpd_pickup' };

describe('náhľad zmeny predplatného', () => {
  test('bez zmeny: nič sa nemení, ďalšia platba ostáva', () => {
    const p = previewPlanChange({ sub: sub(), dog, address: DPD, cycle: CYCLE, now: NOW }, {});
    expect(p.changed).toBe(false);
    expect(p.nextCharge.toISOString()).toBe('2026-12-20T06:00:00.000Z');
  });
  test('vyššia váha → viac gramov, kratšie D, ďalšia platba od posledného doručenia + D − LEAD', () => {
    const p = previewPlanChange({ sub: sub(), dog, address: DPD, cycle: CYCLE, now: NOW }, { kg: 25 });
    expect(p.quote.gramsPerDay).toBeGreaterThan(base.gramsPerDay);
    expect(p.quote.daysPerBag).toBeLessThan(base.daysPerBag);
    expect(p.daysChanged).toBe(true);
    const expected = new Date(Date.UTC(2026, 10, 20) + (p.quote.daysPerBag - 7) * 86_400_000 + 6 * 3600_000);
    expect(p.nextCharge.toISOString()).toBe((expected < NOW ? new Date(Date.UTC(2026, 11, 2, 6)) : expected).toISOString());
    expect(p.answers.kg).toBe(25);
  });
  test('iná receptúra: engine ju prijme cez recipe + recipeFor', () => {
    const other = ['hovadzie', 'jahna', 'jelen-kralik', 'morka-hus-kacica'].find((x) => x !== base.productId)!;
    const p = previewPlanChange({ sub: sub(), dog, address: DPD, cycle: CYCLE, now: NOW }, { productId: other });
    expect(p.quote.productId).toBe(other);
    expect(p.answers.recipeFor).toBe(base.recommendedId);
  });
  test('18 kg s Packetou → najprv zmeniť doručenie', () => {
    expect(() => previewPlanChange({ sub: sub(), dog, address: { delivery_method: 'packeta_point' }, cycle: CYCLE, now: NOW }, { bagId: '18' })).toThrow(/doručenie/);
  });
  test('zmena veku prepočíta dátum narodenia', () => {
    const p = previewPlanChange({ sub: sub(), dog, address: DPD, cycle: CYCLE, now: NOW }, { years: 0, months: 5 });
    expect(p.birthDate).toBe('2026-07-01');
    expect(p.changed).toBe(true);
  });
  test('zrušené sa nedá', () => {
    expect(() => previewPlanChange({ sub: sub({ status: 'cancelled' }), dog, address: DPD, cycle: CYCLE, now: NOW }, {})).toThrow();
  });
  test('bez doručenia: odhad z poslednej objednávky + SHIP_DAYS', () => {
    const p = previewPlanChange({ sub: sub({ last_delivered_at: null }), dog, address: DPD, cycle: CYCLE, now: NOW, lastOrderAt: new Date('2026-11-25T08:00:00Z') }, { kg: 25 });
    expect(p.lastDelivery.toISOString()).toBe('2026-11-28T00:00:00.000Z');
  });
});

describe('vykonanie zmeny', () => {
  test('jeden Stripe update (položky + trial_end, bez prorácie) a DB', async () => {
    const update = vi.fn(async () => ({}));
    const s = { products: { retrieve: vi.fn(async () => ({})) }, subscriptions: { retrieve: vi.fn(async () => ({ items: { data: [{ id: 'si_1' }, { id: 'si_2' }] } })), update } } as unknown as Stripe;
    const store = { updateSubscription: vi.fn(async () => {}), updateDog: vi.fn(async () => {}) };
    const p = previewPlanChange({ sub: sub(), dog, address: { delivery_method: 'sps_courier' }, cycle: CYCLE, now: NOW }, { kg: 25 });
    await applyPlanChange({ sub: sub(), dog }, p, { stripe: s, store, now: NOW });
    expect(update).toHaveBeenCalledTimes(1);
    const params = (update.mock.calls[0] as unknown as [string, Stripe.SubscriptionUpdateParams])[1];
    expect(params.proration_behavior).toBe('none');
    expect(params.trial_end).toBe(Math.floor(p.nextCharge.getTime() / 1000));
    expect(params.items).toHaveLength(4); // 2 zmazané + krmivo + doprava kuriérom
    expect(store.updateSubscription).toHaveBeenCalledWith('s1', expect.objectContaining({ days_per_bag: p.quote.daysPerBag, next_charge_at: p.nextCharge.toISOString() }));
    expect(store.updateDog).toHaveBeenCalledWith('d1', expect.objectContaining({ weight_kg: 25 }));
  });
});
