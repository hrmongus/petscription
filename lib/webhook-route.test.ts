import Stripe from 'stripe';
import { beforeEach, describe, expect, test, vi } from 'vitest';

const processed = new Set<string>();
const handled: string[] = [];
vi.mock('@/lib/store', () => ({
  supabaseStore: {},
  eventProcessed: async (id: string) => processed.has(id),
  markEvent: async (id: string) => void processed.add(id),
}));
vi.mock('@/lib/fulfillment', () => ({
  handleCheckoutCompleted: async (s: { id: string }) => void handled.push(`checkout:${s.id}`),
  handleInvoicePaid: async () => void handled.push('invoice'),
  handlePaymentFailed: async () => void handled.push('failed'),
  handleSubscriptionChanged: async () => void handled.push('sub'),
}));

const SECRET = 'whsec_test_123';
process.env.STRIPE_SECRET_KEY = 'sk_test_dummy';
process.env.STRIPE_WEBHOOK_SECRET = SECRET;
const { POST } = await import('../app/api/stripe/webhook/route');
const signer = new Stripe('sk_test_dummy');

function req(event: object, secret = SECRET) {
  const payload = JSON.stringify(event);
  const header = signer.webhooks.generateTestHeaderString({ payload, secret });
  return new Request('https://granula.sk/api/stripe/webhook', { method: 'POST', body: payload, headers: { 'stripe-signature': header } });
}
const ev = (id: string, metadata: object | null) => ({ id, object: 'event', type: 'checkout.session.completed', data: { object: { id: 'cs_test_1', object: 'checkout.session', metadata } } });

beforeEach(() => { processed.clear(); handled.length = 0; });

describe('POST /api/stripe/webhook', () => {
  test('neplatný podpis → 400, nič sa nespracuje', async () => {
    const r = await POST(req(ev('evt_1', { app: 'granula' }), 'whsec_iny'));
    expect(r.status).toBe(400);
    expect(handled).toEqual([]);
  });
  test('cudzí event (iný projekt na Stripe účte) → 200 ignored', async () => {
    const r = await POST(req(ev('evt_2', { app: 'mamsa' })));
    expect(await r.json()).toEqual({ received: true, ignored: true });
    expect(handled).toEqual([]);
  });
  test('náš event sa spracuje raz; opakovanie → duplicate', async () => {
    expect((await POST(req(ev('evt_3', { app: 'granula' })))).status).toBe(200);
    expect(await (await POST(req(ev('evt_3', { app: 'granula' })))).json()).toEqual({ received: true, duplicate: true });
    expect(handled).toEqual(['checkout:cs_test_1']);
  });
});
