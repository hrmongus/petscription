import { describe, expect, test } from 'vitest';
import { answersAt, birthDateFrom, CheckoutError, prepareCheckout, sessionParams, addressRowOf } from './checkout';
import type { DeliveryPoint } from './delivery-points';

const ANSWERS = { dogname: 'Bruno', sex: 'pes', breed: 'krizenec-stredny', kg: 17, years: '4', months: '0', weeks: '', activity: 'mesto', neutered: 'ano', body: 'akurat', focus: [], allergies: [] };
const DPD_SHOP: DeliveryPoint = { id: 'SK21286', name: 'Pavel Lóška Cyklo-Šport', street: 'Mierová 17', city: 'Tornaľa', zip: '98201', country: 'SK', kind: 'shop' };
const DPD_BOX: DeliveryPoint = { ...DPD_SHOP, id: 'SK23096', name: 'AlzaBox', kind: 'box' };
const find = async (_s: string, id: string) => [DPD_SHOP, DPD_BOX].find((p) => p.id === id) ?? null;
const DEL = { method: 'dpd_pickup', firstName: 'Ján', lastName: 'Novák', email: 'Jan.Novak@Example.sk', phone: '0905 123 456', point: { id: 'SK21286', name: 'podvrh', street: 'podvrh' }, address: { street: 'Hlavná 5', zip: '040 01', city: 'Košice' } };
const IN = { answers: ANSWERS, plan: 'mesiac', bag: '9', delivery: DEL };

describe('prepareCheckout', () => {
  test('cena, D a doprava zo servera; údaje miesta z FHB, nie z prehliadača', async () => {
    const p = await prepareCheckout({ ...IN, price: 1, days: 999 }, { findPoint: find });
    expect(p.quote).toMatchObject({ unitAmountCents: 6750, bagId: '9', plan: 'mesiac' });
    expect(p.shippingCents).toBe(0); // predplatné + výdajné miesto = doprava zadarmo (cenník 23. 11.)
    expect(p.totalCents).toBe(6750);
    expect(p.items).toEqual([{ sku: `GRAN-${p.quote.productId}-9`, qty: 1 }]);
    expect(p.customer).toEqual({ email: 'jan.novak@example.sk', firstName: 'Ján', lastName: 'Novák', name: 'Ján Novák', phone: '+421905123456' });
    // výdajné miesto: adresa miesta z FHB, adresa zákazníka zvlášť (do FHB recipient.address)
    expect(p.shipTo).toMatchObject({ delivery_method: 'dpd_pickup', point_id: 'SK21286', point_address: { street: 'Mierová 17', city: 'Tornaľa', zip: '98201' }, street: 'Hlavná 5', city: 'Košice', zip: '04001' });
    expect(p.point?.name).toBe('Pavel Lóška Cyklo-Šport');
  });
  test('18 kg: sada GRAN-…-18, Packeta zamietnutá, DPD box zamietnutý', async () => {
    const p = await prepareCheckout({ ...IN, bag: '18' }, { findPoint: find });
    expect(p.items[0].sku).toMatch(/-18$/);
    await expect(prepareCheckout({ ...IN, bag: '18', delivery: { ...DEL, method: 'packeta_point' } }, { findPoint: find })).rejects.toThrow(/neponúka/);
    await expect(prepareCheckout({ ...IN, bag: '18', delivery: { ...DEL, point: { id: 'SK23096' } } }, { findPoint: find })).rejects.toThrow(/nie box/);
    expect((await prepareCheckout({ ...IN, bag: '9', delivery: { ...DEL, point: { id: 'SK23096' } } }, { findPoint: find })).point?.kind).toBe('box');
  });
  test('miesto, ktoré FHB nepozná → chyba s výzvou vybrať iné', async () => {
    await expect(prepareCheckout({ ...IN, delivery: { ...DEL, point: { id: 'SK00000' } } }, { findPoint: find })).rejects.toThrow(/nie je dostupné/);
  });
  test('výdajné miesto: adresa zákazníka povinná aj tu; neexistujúce PSČ zamietnuté pred platbou', async () => {
    await expect(prepareCheckout({ ...IN, delivery: { ...DEL, address: null } }, { findPoint: find })).rejects.toThrow(/adresu/);
    await expect(prepareCheckout({ ...IN, delivery: { ...DEL, address: { street: 'Hlavná 5', zip: '000 00', city: 'Košice' } } }, { findPoint: find })).rejects.toThrow(/neexistuje/);
    await expect(prepareCheckout({ ...IN, delivery: { ...DEL, address: { street: 'Hlavná 5', zip: '04099', city: 'Košice' } } }, { findPoint: find })).rejects.toThrow(/neexistuje/);
  });
  test('addressRowOf: street/city/zip = zákazník, point_* = miesto', async () => {
    const p = await prepareCheckout(IN, { findPoint: find });
    expect(addressRowOf('c1', p.shipTo)).toMatchObject({ customer_id: 'c1', carrier: 'dpd', street: 'Hlavná 5', zip: '04001', city: 'Košice', point_id: 'SK21286', point_street: 'Mierová 17', point_zip: '98201', point_city: 'Tornaľa' });
  });
  test('kuriér: adresa povinná, PSČ 5 číslic', async () => {
    const c = { ...DEL, method: 'sps_courier', point: null, address: null };
    await expect(prepareCheckout({ ...IN, delivery: c }, { findPoint: find })).rejects.toThrow(/adresu/);
    await expect(prepareCheckout({ ...IN, delivery: { ...c, address: { street: 'Hlavná 1', zip: '123', city: 'Košice' } } }, { findPoint: find })).rejects.toThrow(/PSČ/);
    const p = await prepareCheckout({ ...IN, delivery: { ...c, address: { street: 'Hlavná 1', zip: '040 01', city: 'Košice' } } }, { findPoint: find });
    expect(p.shipTo).toMatchObject({ street: 'Hlavná 1', zip: '04001', city: 'Košice' });
  });
  test('neplatné vstupy → CheckoutError', async () => {
    await expect(prepareCheckout({ ...IN, delivery: { ...DEL, phone: '123' } })).rejects.toBeInstanceOf(CheckoutError);
    await expect(prepareCheckout({ ...IN, delivery: { ...DEL, email: 'a'.repeat(46) + '@x.sk' } })).rejects.toBeInstanceOf(CheckoutError);
    await expect(prepareCheckout({ ...IN, answers: { ...ANSWERS, breed: 'x' } })).rejects.toThrow(/dotazník/);
    await expect(prepareCheckout({ ...IN, plan: 'zadarmo' })).rejects.toThrow(/dotazník/);
  });
});

describe('Checkout Session', () => {
  const ids = { customerId: 'c1', dogId: 'd1', addressId: 'a1' };
  const opts = { origin: 'https://granula.sk', stripeCustomerId: 'cus_1', productName: 'Granula! Hovädzie 9 kg' };
  test('predplatné: interval day × D, doprava ako druhá opakovaná položka, EUR, embedded, metadata app=granula', async () => {
    const p = await prepareCheckout({ ...IN, delivery: { ...DEL, method: 'sps_courier', point: undefined, address: { street: 'Hlavná 1', city: 'Košice', zip: '040 01' } } }, { findPoint: find });
    const s = sessionParams(p, ids, opts);
    expect(s).toMatchObject({ mode: 'subscription', ui_mode: 'elements', payment_method_types: ['card', 'link'], customer: 'cus_1', adaptive_pricing: { enabled: false }, return_url: 'https://granula.sk/granule-na-mieru?session_id={CHECKOUT_SESSION_ID}#hotovo' });
    const rec = { interval: 'day', interval_count: p.quote.daysPerBag };
    expect(s.line_items).toEqual([
      { quantity: 1, price_data: { currency: 'eur', product: `granula-GRAN-${p.quote.productId}-9`, unit_amount: 6750, recurring: rec } },
      { quantity: 1, price_data: { currency: 'eur', product: 'granula-doprava', unit_amount: 190, recurring: rec } },
    ]);
    expect(s.subscription_data?.metadata).toMatchObject({ app: 'granula', customer_id: 'c1', dog_id: 'd1', address_id: 'a1', bag_id: '9', days: String(p.quote.daysPerBag), unit_cents: '6750', ship_cents: '190' });
  });
  test('doprava zadarmo: bez riadku dopravy', async () => {
    const s = sessionParams(await prepareCheckout(IN, { findPoint: find }), ids, opts);
    expect(s.line_items).toHaveLength(1);
  });
  test('jednorazovo: payment, faktúra, karta uložená na neskôr', async () => {
    const p = await prepareCheckout({ ...IN, plan: 'raz' }, { findPoint: find });
    const s = sessionParams(p, ids, opts);
    expect(s).toMatchObject({ mode: 'payment', invoice_creation: { enabled: true }, payment_intent_data: { setup_future_usage: 'off_session' } });
    expect(s.line_items?.[0].price_data?.unit_amount).toBe(7500);
    expect(s.line_items?.[0].price_data).not.toHaveProperty('recurring');
    expect(s.line_items?.[1].price_data?.unit_amount).toBe(390); // DPD 9 kg jednorazovo
  });
});

describe('vek pre prepočet pri obnovení', () => {
  test('dátum narodenia z veku a vek k dátumu', () => {
    const today = new Date('2026-12-01T00:00:00Z');
    expect(birthDateFrom({ years: '4', months: '2', weeks: '' }, today)).toBe('2022-10-01');
    expect(birthDateFrom({ years: '0', months: '0', weeks: '8' }, today)).toBe('2026-10-06');
    const a = answersAt(ANSWERS as never, '2026-10-06', new Date('2027-02-10T00:00:00Z'));
    expect(a).toMatchObject({ years: '0', months: '4', weeks: '' });
    expect(answersAt(ANSWERS as never, '2026-10-06', new Date('2026-12-20T00:00:00Z'))).toMatchObject({ years: '0', months: '2', weeks: '10' });
  });
});
