import { describe, expect, test, vi } from 'vitest';
import { ANON_PROPERTIES, buildCapture, posthogCapture, trackWithdrawal, uuidFrom, type ServerEvent } from './analytics';
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
  test('buildCapture so súhlasom: distinct_id = customer_id, všetky vlastnosti, stabilné uuid (bez zmeny)', () => {
    const CID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
    const a = buildCapture({ event: 'order_completed', key: 'order:o1', customerId: CID, consent: true, properties: { revenue: 67.5, quiz_session_id: 'q1' } }, 'phc_x');
    expect(a).toMatchObject({ api_key: 'phc_x', distinct_id: CID, properties: { revenue: 67.5, quiz_session_id: 'q1', source: 'server' } });
    expect(a.properties).not.toHaveProperty('$process_person_profile');
    expect(a.uuid).toBe(uuidFrom('order:o1:order_completed'));
  });

  test('posthogCapture: bez kľúča nič; kľúč udalosti sa odošle najviac raz (analytics_sent); chyba siete sa nevyhodí', async () => {
    const seen = new Set<string>();
    const once = async (k: string, ev: string) => (seen.has(`${k}:${ev}`) ? false : (seen.add(`${k}:${ev}`), true));
    const ok = vi.fn(async () => ({ ok: true }) as Response);
    await posthogCapture({}, ok as never, once)({ event: 'x', key: 'k', consent: false });
    expect(ok).not.toHaveBeenCalled();
    const env = { NEXT_PUBLIC_POSTHOG_KEY: 'phc_x', NEXT_PUBLIC_POSTHOG_HOST: 'https://us.i.posthog.com/' };
    await posthogCapture(env, ok as never, once)({ event: 'order_completed', key: 'order:o1', consent: false });
    await posthogCapture(env, ok as never, once)({ event: 'order_completed', key: 'order:o1', consent: false });
    expect(ok).toHaveBeenCalledTimes(1);
    expect(ok).toHaveBeenCalledWith('https://us.i.posthog.com/i/v0/e/', expect.objectContaining({ method: 'POST' }));
    const bad = vi.fn(async () => { throw new Error('ECONNRESET'); });
    await expect(posthogCapture(env, bad as never, once)({ event: 'y', key: 'k2', consent: false })).resolves.toBeUndefined();
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

describe('udalosti bez súhlasu: presný obsah (SPEC §10 P7.15)', () => {
  const IDS = { customer: 'c1a2b3c4-0000-4000-8000-000000000001', order: 'o1a2b3c4-0000-4000-8000-000000000002', sub: 's1a2b3c4-0000-4000-8000-000000000003', quiz: 'q1a2b3c4-0000-4000-8000-000000000004', withdrawal: 'w1a2b3c4-0000-4000-8000-000000000005' };
  const SECRETS = [...Object.values(IDS), 'jan@example.sk', 'Ján Novák', 'Bruno', 'cs_test_1', 'sub_1', 'in_1'];
  let n = 0;
  const rnd = () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;

  async function collect(consentMd: Record<string, string>) {
    const sent: ServerEvent[] = [];
    const quiz: QuizStore = { get: vi.fn(async () => null), insert: vi.fn(), update: vi.fn() };
    const ev = trackingEvents({ capture: async (e) => void sent.push(e), quiz, orderCounts: async () => ({ customer: 2, renewals: 3 }) });
    const ord = { id: IDS.order, kind: 'first', amount_cents: 6750, customer_id: IDS.customer, subscription_id: IDS.sub, stripe_ref: 'cs_test_1', items: [{ sku: 'GRAN-morka-hus-kacica-9', qty: 1 }], ship_to: { delivery_method: 'dpd_pickup', name: 'Ján Novák', email: 'jan@example.sk' } } as never;
    const cust = { id: IDS.customer, email: 'jan@example.sk', name: 'Ján Novák' } as never;
    const subscription = { id: IDS.sub, customer_id: IDS.customer, stripe_subscription_id: 'sub_1', product_id: 'morka-hus-kacica', bag_id: '9', days_per_bag: 37, created_at: new Date().toISOString() } as never;
    const md = { app: 'granula', plan: 'mesiac', product_id: 'morka-hus-kacica', bag_id: '9', ship_cents: '0', days: '37', customer_id: IDS.customer, quiz_session: IDS.quiz, ...consentMd };
    await ev.orderCreated!({ order: ord, customer: cust, session: { id: 'cs_test_1' } as never, metadata: md });
    const invoice = { id: 'in_1', attempt_count: 1, amount_due: 6750, parent: { subscription_details: { subscription: 'sub_1', metadata: md } } } as never;
    await ev.renewed!({ order: { ...(ord as object), kind: 'renewal' } as never, customer: cust, subscription, invoice });
    await ev.renewalFailed!({ subscription, invoice });
    await ev.cancelled!({ subscription, stripeSubscription: { id: 'sub_1', metadata: md, cancellation_details: { reason: 'cancellation_requested', feedback: 'other' } } as never, atPeriodEnd: true });
    await trackWithdrawal({ withdrawalId: IDS.withdrawal, customerId: IDS.customer, orderId: IDS.order, subscriptionId: IDS.sub, consent: consentMd.ph === '1', reason: 'nechutí mu' }, async (e) => void sent.push(e));
    return sent;
  }

  test('každá serverová udalosť bez súhlasu: náhodné distinct_id a uuid, bez profilu, iba neosobné vlastnosti', async () => {
    n = 0;
    const payloads = (await collect({ ph: '0' })).map((e) => buildCapture(e, 'phc_x', rnd));
    expect(payloads.map((p) => p.event)).toEqual(['order_completed', 'order_completed', 'subscription_renewed', 'subscription_payment_failed', 'subscription_cancelled', 'withdrawal_submitted']);
    const BASE = { source: 'server', $lib: 'granula-server', $process_person_profile: false };
    expect(payloads.map((p) => p.properties)).toEqual([
      { order_kind: 'first', plan: 'mesiac', recipe: 'morka-hus-kacica', bag: '9', carrier: 'dpd', delivery_method: 'dpd_pickup', revenue: 67.5, shipping: 0, currency: 'EUR', is_first_order: false, customer_type: 'returning', ...BASE },
      { order_kind: 'renewal', plan: 'mesiac', recipe: 'morka-hus-kacica', bag: '9', carrier: 'dpd', delivery_method: 'dpd_pickup', revenue: 67.5, currency: 'EUR', is_first_order: false, customer_type: 'returning', ...BASE },
      { plan: 'mesiac', recipe: 'morka-hus-kacica', bag: '9', carrier: 'dpd', delivery_method: 'dpd_pickup', revenue: 67.5, currency: 'EUR', ...BASE },
      { recipe: 'morka-hus-kacica', bag: '9', amount: 67.5, currency: 'EUR', ...BASE },
      { recipe: 'morka-hus-kacica', bag: '9', ...BASE },
      { ...BASE },
    ]);
    payloads.forEach((p, i) => {
      expect(Object.keys(p).sort()).toEqual(['api_key', 'distinct_id', 'event', 'properties', 'timestamp', 'uuid']);
      expect(p.distinct_id).toBe(`00000000-0000-4000-8000-${String(2 * i + 2).padStart(12, '0')}`);
      expect(p.uuid).toBe(`00000000-0000-4000-8000-${String(2 * i + 1).padStart(12, '0')}`);
      for (const k of Object.keys(p.properties)) expect([...ANON_PROPERTIES, 'source', '$lib', '$process_person_profile']).toContain(k);
    });
    const json = JSON.stringify(payloads);
    for (const secret of SECRETS) expect(json).not.toContain(secret);
  });

  test('skutočné náhodné id: dve rovnaké udalosti bez súhlasu majú rôzne distinct_id aj uuid, nie odvodené z kľúča', () => {
    const e = { event: 'order_completed', key: `order:${IDS.order}`, customerId: IDS.customer, consent: false, properties: { revenue: 1 } };
    const a = buildCapture(e, 'phc_x'), b = buildCapture(e, 'phc_x');
    expect(a.distinct_id).not.toBe(b.distinct_id);
    expect(a.uuid).not.toBe(b.uuid);
    expect(a.uuid).not.toBe(uuidFrom(`order:${IDS.order}:order_completed`));
    expect(a.distinct_id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  test('so súhlasom ostáva profil zákazníka (customer_id) a plné vlastnosti', async () => {
    const payloads = (await collect({ ph: '1' })).map((e) => buildCapture(e, 'phc_x'));
    expect(payloads.every((p) => p.distinct_id === IDS.customer)).toBe(true);
    expect(payloads[0].properties).toMatchObject({ quiz_session_id: IDS.quiz });
  });
});
