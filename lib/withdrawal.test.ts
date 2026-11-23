import { describe, expect, it, vi } from 'vitest';
import type { Tables } from './database.types';
import type { Mail } from './email';
import { dateTimeSk, mismatchMessage, parseContractRef, submitWithdrawal, withdrawalDeadline, WithdrawalFormSchema, WithdrawalMismatch, WithdrawalRateLimited, type WithdrawalDeps } from './withdrawal';

type Order = Tables<'orders'>;
type Sub = Tables<'subscriptions'>;
type W = Tables<'withdrawals'>;

const NOW = new Date('2026-12-01T13:05:09Z'); // 1. 12. 2026 o 14:05:09 v Bratislave

function order(p: Partial<Order>): Order {
  return { id: `o${p.number}`, number: 1, customer_id: 'c1', subscription_id: 's1', kind: 'first', stripe_ref: `ref${p.number}`, amount_cents: 6750, items: [{ sku: 'GRAN-hovadzie-9', qty: 1 }], ship_to: {}, status: 'sent_to_fhb', fhb_error: null, tracking: null, shipped_at: null, delivered_at: null, created_at: '', updated_at: '', ...p } as Order;
}

function setup(opts: { orders?: Order[]; sub?: Partial<Sub> | null; fhbStatus?: Record<string, string>; email?: string; recent?: W[] } = {}) {
  const orders = new Map((opts.orders ?? [order({ number: 7 })]).map((o) => [o.id, { ...o }]));
  const sub: Sub | null = opts.sub === null ? null : ({ id: 's1', customer_id: 'c1', status: 'active', stripe_subscription_id: 'sub_1', next_charge_at: '2026-12-24T06:00:00Z', ...opts.sub } as Sub);
  const withdrawals: W[] = [...(opts.recent ?? [])];
  const audits: unknown[] = [];
  const mails: Mail[] = [];
  const fhbStatus = opts.fhbStatus ?? {};
  const deleted: string[] = [];
  const cancelled: string[] = [];
  const deps: WithdrawalDeps = {
    store: {
      findOrderByNumber: async (n) => [...orders.values()].find((o) => o.number === n) ?? null,
      getCustomer: async (id) => (id === 'c1' ? { id: 'c1', email: opts.email ?? 'Jana@Example.sk', name: 'Jana Nováková' } : null),
      getSubscription: async (id) => (sub && id === sub.id ? sub : null),
      ordersOfSubscription: async (id) => [...orders.values()].filter((o) => o.subscription_id === id),
      recentByEmail: async (email) => withdrawals.filter((w) => w.email.toLowerCase() === email.toLowerCase()),
      insertWithdrawal: async (row) => {
        const w = { id: `w${withdrawals.length + 1}`, order_id: null, subscription_id: null, customer_id: null, reason: null, confirmation_sent_at: null, status: 'received', deadline_at: null, in_deadline: null, needs_review: false, review_note: null, actions: [], return_status: 'awaiting', refund_due_at: null, submitted_at: NOW.toISOString(), ...row } as W;
        withdrawals.push(w);
        return w;
      },
      updateWithdrawal: async (id, patch) => void Object.assign(withdrawals.find((w) => w.id === id)!, patch),
      updateOrder: async (id, patch) => void Object.assign(orders.get(id)!, patch),
      updateSubscription: async (_id, patch) => void Object.assign(sub!, patch),
      audit: async (row) => void audits.push(row),
    },
    cancelSubscription: async (id) => void cancelled.push(id),
    fhb: {
      getOrder: async (id) => (fhbStatus[id] ? ({ id, status: fhbStatus[id] } as never) : null),
      deleteOrder: async (id) => void deleted.push(id),
    },
    mail: vi.fn(async (m: Mail) => (mails.push(m), 'sent' as const)),
    adminTo: 'admin@granula.sk',
    siteUrl: 'https://www.granula.sk',
    now: () => NOW,
  };
  const input = { name: 'Jana Nováková', email: 'jana@example.sk', contractRef: '7', reason: 'Pes ich neje', source: 'web' as const };
  return { deps, input, orders, sub, withdrawals, audits, mails, deleted, cancelled };
}

describe('pomocné funkcie', () => {
  it('číslo objednávky', () => {
    expect(parseContractRef('17')).toBe(17);
    expect(parseContractRef(' #17 ')).toBe(17);
    expect(parseContractRef('č. 17')).toBe(17);
    expect(parseContractRef('GR-000017')).toBe(17);
    expect(parseContractRef('gr000017')).toBe(17);
    expect(parseContractRef('Objednávka č. 17')).toBe(17);
    expect(parseContractRef('sub_1Ue')).toBeNull();
    expect(parseContractRef('17 a 18')).toBeNull();
    expect(parseContractRef('0')).toBeNull();
  });

  it('lehota = deň prevzatia + 14 dní do konca dňa v Bratislave (aj cez zmenu času)', () => {
    expect(withdrawalDeadline(new Date('2026-11-23T10:00:00Z')).toISOString()).toBe('2026-12-07T22:59:59.999Z');
    // prevzaté tesne pred polnocou SK = ešte 23. 11.
    expect(withdrawalDeadline(new Date('2026-11-23T22:30:00Z')).toISOString()).toBe('2026-12-07T22:59:59.999Z');
    // prevzaté po polnoci SK = už 24. 11.
    expect(withdrawalDeadline(new Date('2026-11-23T23:30:00Z')).toISOString()).toBe('2026-12-08T22:59:59.999Z');
    // 20. 3. (SEČ) → 3. 4. (SELČ)
    expect(withdrawalDeadline(new Date('2026-03-20T10:00:00Z')).toISOString()).toBe('2026-04-03T21:59:59.999Z');
  });

  it('čas prijatia v slovenskom formáte', () => {
    expect(dateTimeSk(NOW)).toBe('1. 12. 2026 o 14:05:09');
  });

  it('formulár vyžaduje potvrdenie a prázdnu pascu', () => {
    const ok = { name: 'Jana N', email: 'jana@example.sk', contractRef: '7', confirm: true };
    expect(WithdrawalFormSchema.safeParse(ok).success).toBe(true);
    expect(WithdrawalFormSchema.safeParse({ ...ok, confirm: false }).success).toBe(true);
    expect(WithdrawalFormSchema.safeParse({ name: 'Jana N', email: 'jana@example.sk', contractRef: '7' }).success).toBe(false);
    expect(WithdrawalFormSchema.safeParse({ ...ok, website: 'x' }).success).toBe(false);
    expect(WithdrawalFormSchema.safeParse({ ...ok, email: 'x' }).success).toBe(false);
  });
});

describe('submitWithdrawal', () => {
  it('predplatné pred doručením: záznam, zrušenie, DELETE vo FHB, e-mail s časom prijatia, admin', async () => {
    const t = setup({ fhbStatus: { 'GR-000007': 'pending' } });
    const r = await submitWithdrawal(t.input, t.deps);

    expect(r).toMatchObject({ submittedAt: NOW.toISOString(), submittedAtText: '1. 12. 2026 o 14:05:09', contractRef: '7', emailSent: true, duplicate: false });
    const w = t.withdrawals[0];
    expect(w).toMatchObject({ order_id: 'o7', subscription_id: 's1', customer_id: 'c1', in_deadline: true, deadline_at: null, needs_review: false, status: 'received', return_status: 'not_needed', submitted_at: NOW.toISOString() });
    expect(w.refund_due_at).toBe('2026-12-15T22:59:59.999Z'); // 1. 12. + 14 dní, koniec dňa SK
    expect(w.confirmation_sent_at).toBeTruthy();
    expect(w.content).toMatchObject({ form: { name: 'Jana Nováková', email: 'jana@example.sk', contract_ref: '7', reason: 'Pes ich neje' }, source: 'web' });
    expect(t.cancelled).toEqual(['sub_1']);
    expect(t.sub).toMatchObject({ status: 'cancelled', next_charge_at: null });
    expect(t.deleted).toEqual(['GR-000007']);
    expect(t.orders.get('o7')!.status).toBe('cancelled');

    const [customer, admin] = t.mails;
    expect(customer.key).toBe('withdrawal-confirm:w1');
    expect(customer.to).toBe('jana@example.sk');
    expect(customer.subject).toContain('1. 12. 2026 o 14:05:09');
    for (const s of [customer.html, customer.text]) {
      expect(s).toContain('1. 12. 2026 o 14:05:09');
      expect(s).toContain('Jana Nováková');
      expect(s).toContain('Pes ich neje');
      expect(s).toContain('Týmto oznamujem, že odstupujem od zmluvy.');
      expect(s).toContain('Predplatné sme zrušili');
      expect(s).toContain('Objednávku č. 7 sme zastavili');
      expect(s).not.toContain('skontrolujeme');
    }
    expect(customer.html).not.toMatch(/\{\{/);
    expect(admin.to).toBe('admin@granula.sk');
    expect(admin.subject).toContain('Odstúpenie od zmluvy: 7');
    expect(t.audits).toHaveLength(1);
  });

  it('e-mail nesedí s objednávkou: chyba, NIČ sa nezaloží ani nezruší, žiadny e-mail', async () => {
    const t = setup({ email: 'iny@example.sk', fhbStatus: { 'GR-000007': 'pending' } });
    const p = submitWithdrawal(t.input, t.deps);
    await expect(p).rejects.toBeInstanceOf(WithdrawalMismatch);
    await expect(p).rejects.toThrow(mismatchMessage('7'));
    expect(t.withdrawals).toEqual([]);
    expect(t.cancelled).toEqual([]);
    expect(t.deleted).toEqual([]);
    expect(t.mails).toEqual([]);
    expect(t.audits).toEqual([]);
  });

  it('neexistujúce číslo: rovnaká hláška, nič sa nezaloží', async () => {
    const t = setup();
    await expect(submitWithdrawal({ ...t.input, contractRef: 'GR-000099' }, t.deps)).rejects.toThrow(mismatchMessage('99'));
    await expect(submitWithdrawal({ ...t.input, contractRef: 'neviem' }, t.deps)).rejects.toThrow('objednávkou č. neviem');
    expect(t.withdrawals).toEqual([]);
    expect(t.mails).toEqual([]);
  });

  it('hláška pri nezhode', () => {
    expect(mismatchMessage('17')).toBe('Tento email nesedí s objednávkou č. 17. Zadaj email, ktorý si použil pri objednávke. Ak si ho nepamätáš, napíš nám na podpora@granula.sk – odstúpenie platí aj takto.');
  });

  it('prihlásený zákazník (/ucet): zhoda podľa zákazníka, nie e-mailu', async () => {
    const t = setup({ email: 'iny@example.sk', fhbStatus: {} });
    await submitWithdrawal({ ...t.input, customerId: 'c1', source: 'ucet' }, t.deps);
    expect(t.cancelled).toEqual(['sub_1']);
    expect(t.withdrawals[0].needs_review).toBe(false);
  });

  it('objednávka sa už balí: čaká na vrátenie', async () => {
    const t = setup({ orders: [order({ number: 7, status: 'confirmed' })], fhbStatus: { 'GR-000007': 'confirmed' } });
    await submitWithdrawal(t.input, t.deps);
    expect(t.deleted).toEqual([]);
    expect(t.orders.get('o7')!.status).toBe('confirmed');
    expect(t.withdrawals[0]).toMatchObject({ status: 'return_pending', return_status: 'awaiting', needs_review: false });
    expect(t.mails[0].text).toContain('Objednávka č. 7 už odišla zo skladu alebo sa práve balí');
  });

  it('v lehote po doručení: lehota od prvého tovaru, odoslaný tovar čaká na vrátenie', async () => {
    const t = setup({ orders: [order({ number: 7, status: 'delivered', delivered_at: '2026-11-20T10:00:00Z' }), order({ number: 9, kind: 'renewal', status: 'sent_to_fhb' })], fhbStatus: { 'GR-000009': 'pending' } });
    await submitWithdrawal(t.input, t.deps);
    expect(t.withdrawals[0]).toMatchObject({ in_deadline: true, deadline_at: '2026-12-04T22:59:59.999Z', status: 'return_pending', needs_review: false });
    expect(t.deleted).toEqual(['GR-000009']);
  });

  it('po lehote: prijme sa, zruší sa predplatné, objednávky ostanú, na posúdenie', async () => {
    const t = setup({ orders: [order({ number: 7, status: 'delivered', delivered_at: '2026-11-01T10:00:00Z' }), order({ number: 9, kind: 'renewal', status: 'sent_to_fhb' })], fhbStatus: { 'GR-000009': 'pending' } });
    const r = await submitWithdrawal({ ...t.input, contractRef: '9' }, t.deps);
    expect(r.emailSent).toBe(true);
    expect(t.withdrawals[0]).toMatchObject({ in_deadline: false, needs_review: true, deadline_at: '2026-11-15T22:59:59.999Z' });
    expect(t.withdrawals[0].review_note).toContain('Po lehote');
    expect(t.cancelled).toEqual(['sub_1']);
    expect(t.deleted).toEqual([]);
    expect(t.orders.get('o9')!.status).toBe('sent_to_fhb');
  });

  it('jednorazová objednávka mimo FHB (paid): zastaví sa bez FHB', async () => {
    const t = setup({ orders: [order({ number: 7, kind: 'one_off', subscription_id: null, status: 'paid' })], sub: null });
    await submitWithdrawal(t.input, t.deps);
    expect(t.orders.get('o7')!.status).toBe('cancelled');
    expect(t.cancelled).toEqual([]);
    expect(t.withdrawals[0]).toMatchObject({ subscription_id: null, needs_review: false });
  });

  it('chyba Stripe alebo FHB neprekazí záznam ani e-mail, ide na posúdenie', async () => {
    const t = setup({ fhbStatus: { 'GR-000007': 'pending' } });
    t.deps.cancelSubscription = async () => {
      throw new Error('Stripe nedostupný');
    };
    t.deps.fhb!.deleteOrder = async () => {
      throw new Error('FHB 500');
    };
    const r = await submitWithdrawal(t.input, t.deps);
    expect(r.emailSent).toBe(true);
    expect(t.withdrawals[0].needs_review).toBe(true);
    expect(t.withdrawals[0].review_note).toContain('Stripe nedostupný');
    expect(t.withdrawals[0].review_note).toContain('FHB 500');
    expect(t.mails[0].text).toContain('skontrolujeme');
  });

  it('dvojklik do 10 minút vráti ten istý záznam bez druhého e-mailu', async () => {
    const t = setup({ fhbStatus: { 'GR-000007': 'pending' } });
    const a = await submitWithdrawal(t.input, t.deps);
    const b = await submitWithdrawal({ ...t.input, email: 'JANA@example.sk' }, t.deps);
    expect(b.duplicate).toBe(true);
    expect(b.submittedAt).toBe(a.submittedAt);
    expect(t.withdrawals).toHaveLength(1);
    expect(t.mails).toHaveLength(2); // zákazník + admin, iba raz
  });

  it('veľa odstúpení z jedného e-mailu za deň → odmietnuté', async () => {
    const recent = Array.from({ length: 10 }, (_, i) => ({ id: `x${i}`, email: 'jana@example.sk', contract_ref: String(100 + i), submitted_at: new Date(NOW.getTime() - 3600_000).toISOString() }) as W);
    const t = setup({ recent });
    await expect(submitWithdrawal(t.input, t.deps)).rejects.toBeInstanceOf(WithdrawalRateLimited);
  });
});
