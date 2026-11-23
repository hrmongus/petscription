import { describe, expect, it, vi } from 'vitest';
import type { Tables } from '../database.types';
import type { Mail } from '../email';
import { withdrawalInfo } from './account';
import * as A from './actions';
import { requestCode, verifyCode, type LoginDeps } from './login';
import { computePlan } from './plan';

const NOW = new Date('2026-11-23T12:00:00Z');
const ANSWERS = { dogname: 'Bruno', sex: 'pes', breed: 'labradorsky-retriever', kg: 30, years: '3', months: '0', activity: 'mesto', neutered: 'ano', body: 'akurat', focus: [], allergies: ['ziadne'] };

/* ---------------------------------------------------------------- prihlásenie */

function loginDeps(over: Partial<LoginDeps> = {}) {
  const attempts: { email: string; kind: string }[] = [];
  const mails: Mail[] = [];
  const d: LoginDeps = {
    findCustomer: async (e) => (e === 'jana@example.sk' ? { id: 'c1', email: 'jana@example.sk', name: 'Jana Nováková' } : null),
    countAttempts: async (e, k) => attempts.filter((a) => a.email === e && a.kind === k).length,
    logAttempt: async (email, kind) => void attempts.push({ email, kind }),
    issueCode: vi.fn(async () => '123456'),
    verify: async (_e, code) => (code === '123456' ? { userId: 'u1' } : null),
    link: async () => ({ id: 'c1' }),
    signOut: vi.fn(async () => {}),
    mail: async (m) => (mails.push(m), 'sent'),
    siteUrl: 'https://www.granula.sk',
    now: () => NOW,
    ...over,
  };
  return { d, attempts, mails };
}

describe('prihlásenie kódom', () => {
  it('kód iba existujúcemu zákazníkovi, e-mail v dizajne Granuly', async () => {
    const t = loginDeps();
    await requestCode('cudzi@example.sk', null, t.d);
    expect(t.mails).toHaveLength(0);
    expect(t.d.issueCode).not.toHaveBeenCalled();
    await requestCode('jana@example.sk', '1.2.3.4', t.d);
    expect(t.mails).toHaveLength(1);
    expect(t.mails[0].subject).toBe('123456 je tvoj kód na prihlásenie do Granuly');
    expect(t.mails[0].html).toContain('123456');
    expect(t.mails[0].html).toContain('Ahoj Jana');
    expect(t.mails[0].html).not.toMatch(/\{\{/);
    expect(t.attempts.map((a) => a.kind)).toEqual(['code_ignored', 'code_sent']);
  });

  it('najviac 5 kódov za hodinu (ďalšie sa ticho neposielajú)', async () => {
    const t = loginDeps();
    for (let i = 0; i < 7; i++) await requestCode('jana@example.sk', null, t.d);
    expect(t.mails).toHaveLength(5);
  });

  it('zlý kód, limit pokusov, správny kód', async () => {
    const t = loginDeps();
    await expect(verifyCode('jana@example.sk', '000000', null, t.d)).rejects.toThrow('Kód nesedí');
    expect((await verifyCode('jana@example.sk', '123456', null, t.d)).customerId).toBe('c1');
    for (let i = 0; i < 4; i++) await verifyCode('jana@example.sk', '000000', null, t.d).catch(() => {});
    await expect(verifyCode('jana@example.sk', '123456', null, t.d)).rejects.toThrow('Príliš veľa');
  });

  it('overený používateľ bez zákazníka sa odhlási', async () => {
    const t = loginDeps({ link: async () => null });
    await expect(verifyCode('jana@example.sk', '123456', null, t.d)).rejects.toThrow('Kód nesedí');
    expect(t.d.signOut).toHaveBeenCalled();
  });
});

/* ---------------------------------------------------------------- prepočet */

describe('computePlan', () => {
  const base = { answers: ANSWERS, birthDate: null, now: NOW, current: { productId: '', bagId: '9' }, method: 'dpd_pickup' as const };

  it('ponúka iba vhodné receptúry a odmietne nevhodnú', () => {
    const r = computePlan({ ...base, current: { productId: 'x', bagId: '9' } });
    expect(r.productSwitched).toBe(true); // neznáma súčasná → odporúčaná
    expect(r.productId).toBe(r.recommendedId);
    expect(r.products.every((p) => p.eligible)).toBe(true);
    expect(r.products.some((p) => p.id === r.recommendedId && p.recommended)).toBe(true);
  });

  it('vyššia váha = viac gramov a kratšie D, cena podľa balenia', () => {
    const cur = computePlan(base);
    const heavier = computePlan({ ...base, current: { productId: cur.productId, bagId: '9' }, kg: 40 });
    expect(heavier.gramsPerDay).toBeGreaterThan(cur.gramsPerDay);
    expect(heavier.daysPerBag).toBeLessThan(cur.daysPerBag);
    expect(heavier.unitAmountCents).toBe(cur.unitAmountCents);
    expect(heavier.shippingCents).toBe(0); // výdajné miesto pri predplatnom zadarmo
    expect(computePlan({ ...base, method: 'sps_courier', current: { productId: cur.productId, bagId: '9' } }).shippingCents).toBe(190);
  });

  it('balenie musí sedieť s doručením a váha s rozsahom', () => {
    expect(() => computePlan({ ...base, method: 'packeta_point', bagId: '18' })).toThrow('Najprv zmeň doručenie');
    expect(() => computePlan({ ...base, kg: 200 })).toThrow('od 0,5 do 90 kg');
  });
});

/* ---------------------------------------------------------------- akcie */

type Sub = Tables<'subscriptions'>;
const CUSTOMER = { id: 'c1', email: 'jana@example.sk', name: 'Jana Nováková' } as Tables<'customers'>;

function actionDeps(subOver: Partial<Sub> = {}, fhbStatus = 'pending') {
  const sub = { id: 's1', customer_id: 'c1', dog_id: 'd1', address_id: 'a1', stripe_subscription_id: 'sub_1', status: 'active', product_id: '', bag_id: '9', grams_per_day: 300, days_per_bag: 30, unit_amount_cents: 6750, next_charge_at: '2026-12-26T06:00:00.000Z', last_delivered_at: '2026-11-26T10:00:00Z', cancel_at: null, cancel_reason: null, cancel_requested_at: null, created_at: '2026-11-23T10:00:00Z', ...subOver } as Sub;
  sub.product_id ||= computePlan({ answers: ANSWERS, birthDate: null, now: NOW, current: { productId: 'x', bagId: '9' }, method: 'dpd_pickup' }).recommendedId;
  const calls: string[] = [];
  const orders = [{ id: 'o1', number: 58, status: 'sent_to_fhb', items: [{ sku: 'GRAN-hovadzie-9', qty: 1 }], amount_cents: 6750, ship_to: { email: 'jana@example.sk' }, created_at: '2026-11-23T10:00:00Z' }] as unknown as Tables<'orders'>[];
  const deps: A.ActionDeps = {
    store: {
      getSubscription: async (id) => (id === sub.id ? sub : null),
      getDog: async () => ({ id: 'd1', name: 'Bruno', answers: ANSWERS, birth_date: null, weight_kg: 30 }) as never,
      getAddress: async () => ({ id: 'a1', delivery_method: 'dpd_pickup', point_id: 'SK1' }) as never,
      ordersOfSubscription: async () => orders,
      updateSubscription: async (_id, p) => void (Object.assign(sub, p), calls.push('db.sub')),
      updateDog: async () => void calls.push('db.dog'),
      updateCustomer: async () => void calls.push('db.customer'),
      insertAddress: async (row) => ({ id: 'a2', ...row }) as never,
      updateOrder: async () => void calls.push('db.order'),
      audit: async (r) => void calls.push(`audit:${r.action}`),
    },
    stripe: {
      move: async () => void calls.push('stripe.move'),
      pause: async () => void calls.push('stripe.pause'),
      resume: async () => void calls.push('stripe.resume'),
      changePlan: async () => void calls.push('stripe.changePlan'),
      cancelAtPeriodEnd: async (_id, on) => void calls.push(`stripe.cancel:${on}`),
      ensureProduct: async () => {},
    },
    fhb: { getOrder: async () => ({ status: fhbStatus }) as never, updateOrder: async () => void calls.push('fhb.put') },
    fhbOptions: { siteUrl: 'https://www.granula.sk', notifyToken: 't', services: { dpd_pickup: 'dpd_sk' } },
    prepareDelivery: async () => ({ shipTo: { name: 'Jana Nováková', email: 'jana@example.sk', phone: '+421905123456', country: 'SK', delivery_method: 'dpd_pickup', point_id: 'SK2', point_label: 'Nové miesto', point_address: { street: 'Ulica 1', city: 'Mesto', zip: '01001' } }, point: { id: 'SK2', name: 'N', street: 'Ulica 1', city: 'Mesto', zip: '01001', country: 'SK', kind: 'shop' }, shippingCents: 0, customer: {} as never }),
    isBox: async () => false,
    cycle: { leadDays: 7, shipDays: 3 },
    mail: async () => 'sent',
    siteUrl: 'https://www.granula.sk',
    now: () => NOW,
  };
  return { deps, sub, calls };
}

describe('akcie /ucet', () => {
  it('cudzie predplatné → 404', async () => {
    const t = actionDeps({ customer_id: 'iny' });
    await expect(A.skipDelivery(t.deps, CUSTOMER, 's1')).rejects.toMatchObject({ status: 404 });
  });

  it('posun: zajtra až +120 dní', async () => {
    const t = actionDeps();
    await expect(A.moveDelivery(t.deps, CUSTOMER, 's1', '2026-11-23')).rejects.toThrow('Najskôr sa dá zajtra');
    await expect(A.moveDelivery(t.deps, CUSTOMER, 's1', '2027-06-01')).rejects.toThrow('Najneskôr');
    await A.moveDelivery(t.deps, CUSTOMER, 's1', '2026-12-10');
    expect(t.sub.next_charge_at).toBe('2026-12-10T06:00:00.000Z');
    expect(t.calls).toContain('stripe.move');
  });

  it('preskočenie = +D dní', async () => {
    const t = actionDeps();
    await A.skipDelivery(t.deps, CUSTOMER, 's1');
    expect(t.sub.next_charge_at).toBe('2027-01-25T06:00:00.000Z');
  });

  it('pauza a obnovenie, pozastavené sa nedá posunúť', async () => {
    const t = actionDeps();
    await A.pauseSubscription(t.deps, CUSTOMER, 's1');
    expect(t.sub.status).toBe('paused');
    await expect(A.moveDelivery(t.deps, CUSTOMER, 's1', '2026-12-10')).rejects.toThrow('pozastavené');
    await A.resumeSubscription(t.deps, CUSTOMER, 's1');
    expect(t.sub).toMatchObject({ status: 'active', next_charge_at: '2026-12-26T06:00:00.000Z' });
  });

  it('váha: náhľad nič nemení, potvrdenie = jeden changePlan + nový dátum od posledného doručenia', async () => {
    const t = actionDeps();
    const r = await A.changeWeight(t.deps, CUSTOMER, 's1', { kg: '40', preview: true });
    const p = r.preview as A.PlanPreview;
    expect(p.after.gramsPerDay).toBeGreaterThan(0);
    expect(t.calls.filter((c) => c.startsWith('stripe') || c.startsWith('db'))).toEqual([]);
    await A.changeWeight(t.deps, CUSTOMER, 's1', { kg: '40', preview: false });
    expect(t.calls.filter((c) => c === 'stripe.changePlan')).toHaveLength(1);
    // posledné doručenie 26. 11. + D_nové − 7
    const expected = new Date(Date.UTC(2026, 10, 26 + p.after.daysPerBag - 7, 6)).toISOString();
    expect(t.sub.next_charge_at).toBe(expected);
    expect(t.sub.days_per_bag).toBe(p.after.daysPerBag);
  });

  it('nevhodná receptúra sa odmietne', async () => {
    const t = actionDeps();
    await expect(A.changeRecipeOrBag(t.deps, CUSTOMER, 's1', { productId: 'neexistuje', preview: true })).rejects.toThrow('Neznáma receptúra');
  });

  it('doručenie: objednávka vo FHB pending sa upraví, balená nie („už sa balí“)', async () => {
    const a = actionDeps({}, 'pending');
    const r1 = await A.changeDelivery(a.deps, CUSTOMER, 's1', {});
    expect(a.calls).toContain('fhb.put');
    expect(r1.message).toContain('Zmenili sme aj objednávku č. 58');
    const b = actionDeps({}, 'confirmed');
    const r2 = await b.deps && (await A.changeDelivery(b.deps, CUSTOMER, 's1', {}));
    expect(b.calls).not.toContain('fhb.put');
    expect(r2.message).toContain('sa už balí');
  });

  it('zrušenie vyžaduje dôvod, ide ku koncu obdobia a dá sa odvolať', async () => {
    const t = actionDeps();
    await expect(A.cancelSubscription(t.deps, CUSTOMER, 's1', ' ')).rejects.toThrow('prečo');
    await A.cancelSubscription(t.deps, CUSTOMER, 's1', 'Pes ich neje');
    expect(t.sub).toMatchObject({ cancel_at: '2026-12-26T06:00:00.000Z', cancel_reason: 'Pes ich neje', status: 'active' });
    expect(t.calls).toContain('stripe.cancel:true');
    await expect(A.skipDelivery(t.deps, CUSTOMER, 's1')).rejects.toThrow('odvolaj');
    await A.revokeCancel(t.deps, CUSTOMER, 's1');
    expect(t.sub.cancel_at).toBeNull();
    expect(t.calls).toContain('stripe.cancel:false');
  });
});

describe('tlačidlo odstúpenia v účte', () => {
  const o = (p: Partial<Tables<'orders'>>) => ({ id: `o${p.number}`, number: 1, subscription_id: 's1', status: 'delivered', delivered_at: null, ...p }) as Tables<'orders'>;
  it('v lehote od prvého doručenia, iba posledná objednávka zmluvy, nie po odstúpení', () => {
    const all = [o({ number: 1, delivered_at: '2026-11-20T10:00:00Z' }), o({ number: 2, status: 'sent_to_fhb' })];
    expect(withdrawalInfo(all[1], all, [], NOW)).toMatchObject({ eligible: true, deadline: '2026-12-04T22:59:59.999Z' });
    expect(withdrawalInfo(all[0], all, [], NOW).eligible).toBe(false);
    expect(withdrawalInfo(all[1], all, [], new Date('2026-12-05T10:00:00Z')).eligible).toBe(false);
    expect(withdrawalInfo(all[1], all, [{ subscription_id: 's1', order_id: 'o1' } as Tables<'withdrawals'>], NOW).eligible).toBe(false);
  });
});
