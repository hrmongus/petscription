import { describe, expect, test, vi } from 'vitest';
import { runRetention, type RetentionCandidate, type RetentionStore } from './retention';

function store(list: RetentionCandidate[]) {
  const deleted: string[] = [], audits: string[] = [];
  const s: RetentionStore = {
    anonymizeQuizSessions: vi.fn(async () => 3),
    candidates: vi.fn(async () => list),
    deleteCustomer: async (id) => void deleted.push(id),
    audit: async (action, id) => void audits.push(`${action}:${id}`),
  };
  return { s, deleted, audits };
}
function stripe(customers: Record<string, object | null>, charges: Record<string, string[]> = {}) {
  const del = vi.fn(async () => ({}));
  return {
    del,
    s: {
      customers: {
        retrieve: async (id: string) => { const c = customers[id]; if (c === null) throw Object.assign(new Error('No such customer'), { statusCode: 404 }); return c; },
        del,
      },
      charges: { list: async ({ customer }: { customer: string }) => ({ data: (charges[customer] ?? []).map((status) => ({ status })) }) },
    } as never,
  };
}
const NOW = new Date('2027-03-01T00:00:00Z');

describe('runRetention (90 dní)', () => {
  test('zmaže zákazníka bez platby (aj Stripe), preskočí cudzieho, zaplateného a prihláseného', async () => {
    const st = store([
      { id: 'c-ok', stripe_customer_id: 'cus_ok', auth_user_id: null },
      { id: 'c-nostripe', stripe_customer_id: null, auth_user_id: null },
      { id: 'c-gone', stripe_customer_id: 'cus_gone', auth_user_id: null },
      { id: 'c-foreign', stripe_customer_id: 'cus_mamsa', auth_user_id: null },
      { id: 'c-paid', stripe_customer_id: 'cus_paid', auth_user_id: null },
      { id: 'c-auth', stripe_customer_id: null, auth_user_id: 'u1' },
    ]);
    const sp = stripe(
      { cus_ok: { id: 'cus_ok', metadata: { app: 'granula' } }, cus_gone: null, cus_mamsa: { id: 'cus_mamsa', metadata: { app: 'mamsa' } }, cus_paid: { id: 'cus_paid', metadata: { app: 'granula' } } },
      { cus_ok: ['failed'], cus_paid: ['failed', 'succeeded'] },
    );
    const r = await runRetention({ store: st.s, stripe: sp.s, now: NOW });
    expect(r.cutoff).toBe('2026-12-01T00:00:00.000Z');
    expect(st.s.candidates).toHaveBeenCalledWith('2026-12-01T00:00:00.000Z', 200);
    expect(st.deleted).toEqual(['c-ok', 'c-nostripe', 'c-gone']);
    expect(sp.del).toHaveBeenCalledTimes(1);
    expect(sp.del).toHaveBeenCalledWith('cus_ok');
    expect(r.skipped).toEqual([{ id: 'c-foreign', reason: 'stripe_not_ours' }, { id: 'c-paid', reason: 'stripe_has_payment' }, { id: 'c-auth', reason: 'auth_user' }]);
    expect(st.audits).toContain('retention.skipped_paid:c-paid');
    expect(r).toMatchObject({ deleted: 3, anonymizedSessions: 3, dryRun: false });
  });
  test('dry run nič nemaže ani neanonymizuje', async () => {
    const st = store([{ id: 'c-ok', stripe_customer_id: 'cus_ok', auth_user_id: null }]);
    const sp = stripe({ cus_ok: { id: 'cus_ok', metadata: { app: 'granula' } } });
    const r = await runRetention({ store: st.s, stripe: sp.s, now: NOW, dryRun: true });
    expect(r).toMatchObject({ deleted: 1, anonymizedSessions: 0, dryRun: true });
    expect(st.deleted).toEqual([]);
    expect(sp.del).not.toHaveBeenCalled();
    expect(st.s.anonymizeQuizSessions).not.toHaveBeenCalled();
  });
  test('bez Stripe kľúča sa zákazník so Stripe id nemaže', async () => {
    const st = store([{ id: 'c1', stripe_customer_id: 'cus_1', auth_user_id: null }]);
    const r = await runRetention({ store: st.s, stripe: null, now: NOW });
    expect(st.deleted).toEqual([]);
    expect(r.skipped).toEqual([{ id: 'c1', reason: 'stripe_not_configured' }]);
  });
});
