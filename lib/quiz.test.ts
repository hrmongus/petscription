import { randomUUID } from 'node:crypto';
import { describe, expect, test } from 'vitest';
import { linkCheckout, linkOrder, partialAnswers, QuizInputSchema, quizResult, referrerHost, restorable, saveQuizStep, type QuizRow, type QuizStore } from './quiz';

const FULL = { dogname: 'Bruno', sex: 'pes', breed: 'krizenec-stredny', kg: 17, years: '4', months: '0', weeks: '', activity: 'mesto', neutered: 'ano', pregnant: '', body: 'akurat', focus: ['nic'], allergies: ['ziadne'], recipe: '', recipeFor: '' };

function mem() {
  const rows = new Map<string, QuizRow>();
  const store: QuizStore = {
    get: async (id) => rows.get(id) ?? null,
    insert: async (row) => void rows.set(row.id, {
      started_at: '2026-11-23T10:00:00Z', updated_at: '', last_step: null, max_step: 0, completed: false, answers: {}, result: null, plan: null, bag_id: null,
      delivery_method: null, utm: null, referrer: null, landing_path: null, email: null, customer_id: null, dog_id: null, checkout_started_at: null, order_id: null, paid_at: null,
      ...row,
    } as QuizRow),
    update: async (id, patch) => void Object.assign(rows.get(id)!, patch),
  };
  return { rows, store };
}
const input = (o: object) => QuizInputSchema.parse(o);

describe('partialAnswers', () => {
  test('platné polia ostanú, neplatné a neznáme vypadnú', () => {
    expect(partialAnswers({ dogname: ' Bruno ', sex: 'kocka', kg: '17', params: { x: 1 }, price: 1 })).toEqual({ dogname: 'Bruno', kg: 17 });
  });
});

describe('referrerHost', () => {
  test('iba doména bez www, vlastná doména a nezmysel = null', () => {
    expect(referrerHost('https://www.facebook.com/ads/x?y=1', 'www.granula.sk')).toBe('facebook.com');
    expect(referrerHost('https://granula.sk/blog/', 'www.granula.sk')).toBeNull();
    expect(referrerHost('nie-url')).toBeNull();
  });
});

describe('quizResult', () => {
  test('úplné odpovede → výsledok zo servera, neúplné → null', () => {
    const r = quizResult(FULL, 'mesiac', undefined)!;
    expect(r).toMatchObject({ plan: 'mesiac', swapped: false });
    expect(r.unit_cents).toBeGreaterThan(0);
    expect(r.days_per_bag).toBeGreaterThan(0);
    expect(quizResult({ dogname: 'Bruno' }, 'mesiac', '9')).toBeNull();
  });
});

describe('saveQuizStep', () => {
  test('priebežne: prvý zdroj sa nemení, max_step rastie, výsledok až po dotazníku', async () => {
    const m = mem(), id = randomUUID();
    await saveQuizStep(input({ id, step: 'krok-2', answers: { dogname: 'Bruno', sex: 'pes' }, utm: { utm_source: 'facebook', utm_campaign: 'jesen' }, referrer: 'https://l.facebook.com/', landing: '/granule-na-mieru?test=tajne#krok-1' }), m.store);
    expect(m.rows.get(id)).toMatchObject({ max_step: 1, completed: false, utm: { utm_source: 'facebook', utm_campaign: 'jesen' }, referrer: 'l.facebook.com', landing_path: '/granule-na-mieru', result: null });
    await saveQuizStep(input({ id, step: 'krok-4', answers: FULL, utm: { utm_source: 'google' } }), m.store);
    await saveQuizStep(input({ id, step: 'krok-2', answers: FULL }), m.store);
    expect(m.rows.get(id)).toMatchObject({ max_step: 3, utm: { utm_source: 'facebook', utm_campaign: 'jesen' }, last_step: 'krok-2' });
    const r = await saveQuizStep(input({ id, step: 'vysledok', answers: FULL, bag: '9' }), m.store);
    expect(r.completed).toBe(true);
    expect(m.rows.get(id)).toMatchObject({ max_step: 7, completed: true, bag_id: '9', result: { bag_id: '9' } });
    expect((m.rows.get(id)!.answers as { dogname: string }).dogname).toBe('Bruno');
  });

  test('zaplatená session sa už nemení', async () => {
    const m = mem(), id = randomUUID();
    await saveQuizStep(input({ id, step: 'vysledok', answers: FULL }), m.store);
    await linkOrder(id, 'order-1', m.store);
    expect((await saveQuizStep(input({ id, step: 'krok-1', answers: { dogname: 'Iný' } }), m.store)).saved).toBe(false);
    expect(m.rows.get(id)).toMatchObject({ order_id: 'order-1', last_step: 'hotovo' });
    expect((m.rows.get(id)!.answers as { dogname: string }).dogname).toBe('Bruno');
  });

  test('neplatný vstup: zlé id alebo krok zamietne schéma, zlé voliteľné polia sa ignorujú', () => {
    expect(QuizInputSchema.safeParse({ id: 'x', step: 'krok-1' }).success).toBe(false);
    expect(QuizInputSchema.safeParse({ id: randomUUID(), step: 'admin' }).success).toBe(false);
    expect(input({ id: randomUUID(), step: 'krok-1', plan: 'zadarmo', bag: '100' })).toMatchObject({ plan: undefined, bag: undefined });
  });
});

describe('checkout a objednávka', () => {
  test('linkCheckout doplní zákazníka (aj bez skoršieho záznamu), checkout_started_at sa neprepíše', async () => {
    const m = mem(), id = randomUUID();
    const link = { email: 'jan@example.sk', customerId: 'c1', dogId: 'd1', answers: FULL, plan: 'mesiac', bag: '9', method: 'dpd_pickup', result: null };
    await linkCheckout(id, link, m.store, new Date('2026-11-23T11:00:00Z'));
    await linkCheckout(id, { ...link, method: 'sps_courier' }, m.store, new Date('2026-11-23T12:00:00Z'));
    expect(m.rows.get(id)).toMatchObject({ email: 'jan@example.sk', customer_id: 'c1', dog_id: 'd1', delivery_method: 'sps_courier', checkout_started_at: '2026-11-23T11:00:00.000Z', completed: true });
  });
  test('linkOrder: neznáma alebo neplatná session nič nespraví', async () => {
    const m = mem();
    await linkOrder('nie-uuid', 'o1', m.store);
    await linkOrder(randomUUID(), 'o1', m.store);
    expect(m.rows.size).toBe(0);
  });
  test('restorable: iba dokončená, nezaplatená, do 90 dní', () => {
    const row = { completed: true, order_id: null, started_at: '2026-11-01T00:00:00Z' } as QuizRow;
    expect(restorable(row, new Date('2026-12-01T00:00:00Z'))).toBe(true);
    expect(restorable(row, new Date('2027-03-01T00:00:00Z'))).toBe(false);
    expect(restorable({ ...row, order_id: 'o' }, new Date('2026-12-01T00:00:00Z'))).toBe(false);
    expect(restorable({ ...row, completed: false }, new Date('2026-12-01T00:00:00Z'))).toBe(false);
  });
});
