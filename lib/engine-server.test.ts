import { describe, expect, test } from 'vitest';
import engine from '../public/granula/engine.js';
import { allSkus, computeServer, quote, serverParams, skuItems } from './engine-server';

const BRUNO = {
  dogname: 'Bruno', sex: 'pes', breed: 'krizenec-stredny', kg: 17, years: '4', months: '0', weeks: '',
  activity: 'mesto', neutered: 'ano', body: 'akurat', focus: [], allergies: [],
};

describe('engine (SPEC §1)', () => {
  test('LEAD = 7, SHIP_DAYS = 3', () => {
    expect(engine.PARAMS.reorderLeadDays).toBe(7);
    expect(engine.PARAMS.shipDays).toBe(3);
  });
  test('nextDay = D − LEAD + SHIP_DAYS (od doručenia), najmenej 1', () => {
    const { result } = computeServer(BRUNO);
    for (const b of result.bags) expect(b.nextDay).toBe(Math.max(1, b.days - 7 + 3));
  });
  test('nextDay nikdy pod 1 pri krátkej výdrži', () => {
    const { result } = computeServer({ ...BRUNO, breed: 'krizenec-velky', kg: 60, activity: 'praca', neutered: 'nie' });
    for (const b of result.bags) expect(b.nextDay).toBeGreaterThanOrEqual(1);
  });
});

describe('engine-server ignoruje parametre a ceny z klienta', () => {
  test('neznáme kľúče (params, ceny, dni) sa zahodia', () => {
    const evil = { ...BRUNO, params: { bagPrices: { '4': 1, '9': 1, '18': 1 } }, bagPrices: { '9': 1 }, price: 1, days: 999, reorderLeadDays: 0 };
    const { answers } = computeServer(evil);
    expect(answers).not.toHaveProperty('params');
    expect(answers).not.toHaveProperty('bagPrices');
    expect(answers).not.toHaveProperty('price');
    expect(quote({ answers: evil, plan: 'raz', bagId: '9' })).toEqual(quote({ answers: BRUNO, plan: 'raz', bagId: '9' }));
  });
  test('serverParams je kópia: zmena nezmení predvolené PARAMS', () => {
    const p = serverParams();
    p.bagPrices['9'] = 1;
    expect(engine.PARAMS.bagPrices['9']).toBe(75);
    expect(computeServer(BRUNO).result.params.bagPrices['9']).toBe(75);
  });
  test('neplatné odpovede → chyba', () => {
    expect(() => computeServer({ ...BRUNO, breed: 'neexistuje' })).toThrow();
    expect(() => computeServer({ ...BRUNO, kg: 500 })).toThrow();
    expect(() => computeServer({ ...BRUNO, years: '-1' })).toThrow();
    expect(() => computeServer({ ...BRUNO, focus: ['<script>'] })).toThrow();
    expect(() => quote({ answers: BRUNO, plan: 'zadarmo', bagId: '9' })).toThrow();
    expect(() => quote({ answers: BRUNO, plan: 'raz', bagId: '5' })).toThrow();
  });
});

describe('quote', () => {
  test('predplatné: zľava 10 %, doprava 4,90 €, D z engine', () => {
    const q = quote({ answers: BRUNO, plan: 'mesiac', bagId: '9' });
    const { result } = computeServer(BRUNO);
    const bag = result.bags.find((b) => b.bag.id === '9')!;
    expect(q.unitAmountCents).toBe(6750); // 75 € × 0,9
    expect(q.shippingCents).toBe(490);
    expect(q.totalCents).toBe(7240);
    expect(q.daysPerBag).toBe(bag.days);
    expect(q.daysPerBag).toBe(Math.floor(9000 / q.gramsPerDay));
    expect(q.leadDays).toBe(7);
  });
  test('jednorazovo: bez zľavy', () => {
    expect(quote({ answers: BRUNO, plan: 'raz', bagId: '4' }).unitAmountCents).toBe(3500);
  });
  test('vlastná receptúra platí len k odporúčanej', () => {
    const rec = computeServer(BRUNO).result.recommended!.id;
    const other = engine.PRODUCTS.find((p) => p.id !== rec)!.id;
    expect(quote({ answers: { ...BRUNO, recipe: other, recipeFor: rec }, plan: 'raz', bagId: '9' }).productId).toBe(other);
    expect(quote({ answers: { ...BRUNO, recipe: other, recipeFor: other }, plan: 'raz', bagId: '9' }).productId).toBe(rec);
  });
});

describe('SKU (SPEC P0)', () => {
  test('15 produktov: 10 bežných + 5 sád 18 kg (2 × 9 kg); objednávka vždy jeden produkt', () => {
    const all = allSkus();
    expect(all).toHaveLength(15);
    expect(all.filter((x) => x.type === 'single')).toHaveLength(10);
    expect(all.find((x) => x.sku === 'GRAN-hovadzie-18')).toMatchObject({ type: 'multi', items: [{ id: 'GRAN-hovadzie-9', quantity: 2 }] });
    // sady až po bežných produktoch (zložka musí existovať skôr)
    expect(all.findIndex((x) => x.type === 'multi')).toBe(10);
    expect(new Set(all.map((x) => x.sku)).size).toBe(15);
    expect(skuItems('hovadzie', '18')).toEqual([{ sku: 'GRAN-hovadzie-18', qty: 1 }]);
    expect(skuItems('hovadzie', '4')).toEqual([{ sku: 'GRAN-hovadzie-4', qty: 1 }]);
    expect(() => skuItems('x', '4')).toThrow();
  });
});
