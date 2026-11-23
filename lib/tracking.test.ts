import { describe, expect, test, vi } from 'vitest';
import { buildCapture, posthogCapture, trackWithdrawal, uuidFrom, type ServerEvent } from './analytics';
import { trackingEvents } from './tracking';
import type { QuizStore } from './quiz';

const order = (o: object = {}) => ({ id: 'o1', kind: 'first', amount_cents: 6750, items: [{ sku: 'GRAN-morka-hus-kacica-9', qty: 1 }], ship_to: { delivery_method: 'dpd_pickup' }, ...o }) as never;
const customer = { id: 'c1', email: 'jan@example.sk' } as never;
const sub = { id: 's1', customer_id: 'c1', product_id: 'morka-hus-kacica', bag_id: '9', days_per_bag: 37, created_at: new Date(Date.now() - 40 * 86_400_000).toISOString() } as never;

function deps(counts = { customer: 1, renewals: 0 }) {
  const sent: ServerEvent[] = [];
  const quiz: QuizStore = { get: vi.fn(async () => ({ id: '11111111-1111-4111-8111-111111111111', order_id: null }) as never), insert: vi.fn(), update: vi.fn(async () => {}) };
  return { sent, quiz, ev: trackingEvents({ capture: async (e) => void sent.push(e), quiz, orderCounts: async () => counts }) };
}

describe('server-side udalosti (PostHog)', () => {
  test('buildCapture: so súhlasom distinct_id = customer_id, bez súhlasu anonymne bez profilu; uuid stabilné', () => {
    const CID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
    const e = { event: 'order_completed', key: 'order:o1', customerId: CID, properties: { revenue: 67.5 } };
    const a = buildCapture({ ...e, consent: true }, 'phc_x');
    expect(a).toMatchObject({ api_key: 'phc_x', distinct_id: CID, properties: { revenue: 67.5, source: 'server' } });
    expect(a.properties).not.toHaveProperty('$process_person_profile');
    const b = buildCapture({ ...e, consent: false }, 'phc_x');
    expect(b.properties).toMatchObject({ $process_person_profile: false });
    expect(JSON.stringify(b)).not.toContain(CID);
    expect(a.uuid).toBe(uuidFrom('order:o1:order_completed'));
    expect(a.uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  test('posthogCapture: bez kľúča nič, chyba siete sa nevyhodí', async () => {
    const f = vi.fn(async () => { throw new Error('ECONNRESET'); });
    await posthogCapture({}, f as never)({ event: 'x', key: 'k', consent: false });
    expect(f).not.toHaveBeenCalled();
    await expect(posthogCapture({ NEXT_PUBLIC_POSTHOG_KEY: 'phc_x', NEXT_PUBLIC_POSTHOG_HOST: 'https://us.i.posthog.com/' }, f as never)({ event: 'x', key: 'k', consent: false })).resolves.toBeUndefined();
    expect(f).toHaveBeenCalledWith('https://us.i.posthog.com/i/v0/e/', expect.objectContaining({ method: 'POST' }));
  });

  test('order_completed: suma, plán, recept, balenie, dopravca, nový zákazník, spárovanie dotazníka; email nikde', async () => {
    const d = deps();
    const md = { app: 'granula', plan: 'mesiac', product_id: 'morka-hus-kacica', bag_id: '9', ship_cents: '0', days: '37', ph: '1', quiz_session: '11111111-1111-4111-8111-111111111111' };
    await d.ev.orderCreated!({ order: order(), customer, session: {} as never, metadata: md });
    expect(d.quiz.update).toHaveBeenCalledWith('11111111-1111-4111-8111-111111111111', expect.objectContaining({ order_id: 'o1' }));
    expect(d.sent).toHaveLength(1);
    expect(d.sent[0]).toMatchObject({ event: 'order_completed', customerId: 'c1', consent: true, properties: { order_kind: 'first', plan: 'mesiac', recipe: 'morka-hus-kacica', bag: '9', carrier: 'dpd', revenue: 67.5, is_first_order: true, customer_type: 'new' } });
    expect(JSON.stringify(d.sent)).not.toContain('jan@example.sk');
  });

  test('obnovenie: order_completed (renewal) + subscription_renewed; súhlas z metadata predplatného', async () => {
    const d = deps({ customer: 3, renewals: 2 });
    await d.ev.renewed!({ order: order({ id: 'o3', kind: 'renewal' }), customer, subscription: sub, invoice: { parent: { subscription_details: { metadata: { ph: '0' } } } } as never });
    expect(d.sent.map((e) => [e.event, e.consent, e.properties?.order_kind, e.properties?.renewal_number])).toEqual([
      ['order_completed', false, 'renewal', 2],
      ['subscription_renewed', false, undefined, 2],
    ]);
  });

  test('zrušenie a odstúpenie', async () => {
    const d = deps({ customer: 2, renewals: 1 });
    await d.ev.cancelled!({ subscription: sub, stripeSubscription: { metadata: { ph: '1' }, cancellation_details: { reason: 'cancellation_requested', feedback: 'too_expensive' } } as never, atPeriodEnd: true });
    expect(d.sent[0]).toMatchObject({ event: 'subscription_cancelled', consent: true, properties: { at_period_end: true, reason: 'cancellation_requested', feedback: 'too_expensive', renewals: 1, lifetime_days: 40 } });
    const sent: ServerEvent[] = [];
    await trackWithdrawal({ withdrawalId: 'w1', customerId: 'c1', orderId: 'o1' }, async (e) => void sent.push(e));
    expect(sent[0]).toMatchObject({ event: 'withdrawal_submitted', key: 'withdrawal:w1', consent: false });
  });
});
