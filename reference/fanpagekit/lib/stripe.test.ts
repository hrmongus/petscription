import { describe, expect, it } from 'vitest';
import { renewalPack } from './checkout';
import { paymentSessionParams, upsellSessionParams } from './payment';
import { flowOf, isOurs, orderMetadata } from './stripe';

describe('isOurs', () => {
  it('accepts what this site creates', () => {
    expect(isOurs(orderMetadata({ pack: 'golden-hour', bundleUp: false, plan: 'once' }, 'site'))).toBe(true);
  });

  it('rejects another project, even with a matching pack', () => {
    expect(isOurs({ app: 'other', pack: 'golden-hour', plan: 'once' })).toBe(false);
    expect(isOurs({ app: 'other', upsell_for: 'cs_1' })).toBe(false);
  });

  it('rejects objects with no or unrecognised metadata', () => {
    expect(isOurs(null)).toBe(false);
    expect(isOurs({})).toBe(false);
    expect(isOurs({ pack: 'pro', plan: 'once' })).toBe(false);
    expect(isOurs({ pack: 'golden-hour' })).toBe(false);
  });

  it('accepts orders and upsells from before the marker', () => {
    expect(isOurs({ pack: 'midnight-city', bundle: '0', plan: 'monthly' })).toBe(true);
    expect(isOurs({ upsell_for: 'cs_1' })).toBe(true);
  });
});

describe('payment flow', () => {
  const order = { pack: 'golden-hour', bundleUp: false, plan: 'once' } as const;
  const productName = (p: ReturnType<typeof paymentSessionParams>) => p.line_items![0].price_data!.product_data!.name;

  it('labels Blueprint payments in Stripe, not on the product buyers see', () => {
    const p = paymentSessionParams(order, 'https://x.test', 'blueprint');
    expect(p.metadata?.flow).toBe('blueprint');
    expect(p.payment_intent_data?.metadata?.flow).toBe('blueprint');
    expect(p.payment_intent_data?.description).toBe('FanpageKit — Golden Hour · Blueprint');
    expect(productName(p)).toBe('FanpageKit — Golden Hour');
  });

  it('leaves main-site descriptions as they were', () => {
    const p = paymentSessionParams(order, 'https://x.test', 'site');
    expect(p.metadata?.flow).toBe('site');
    expect(p.payment_intent_data?.description).toBe('FanpageKit — Golden Hour');
  });

  it('gives an upsell the flow of its order', async () => {
    const session = { id: 'cs_1', customer: 'cus_1', metadata: { flow: 'blueprint' } } as unknown as Parameters<typeof upsellSessionParams>[0];
    const p = await upsellSessionParams(session, order, 'https://x.test');
    expect(p.metadata?.flow).toBe('blueprint');
    expect(p.payment_intent_data?.description).toMatch(/ · Blueprint$/);
    expect(productName(p)).not.toMatch(/Blueprint/);
  });

  it('treats older orders as the main site', () => {
    expect(flowOf({ pack: 'golden-hour' })).toBe('site');
    expect(flowOf(null)).toBe('site');
  });
});

describe('renewalPack', () => {
  it('starts after the first pack and wraps around', () => {
    expect([1, 2, 3, 4, 5].map((n) => renewalPack('coastal-drive', n))).toEqual(['forest-trail', 'golden-hour', 'midnight-city', 'coastal-drive', 'forest-trail']);
  });
});
