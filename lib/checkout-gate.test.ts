import { describe, expect, test } from 'vitest';
import { checkoutGate, gateFromRequest } from './checkout-gate';
import { fhbMode, stripeMode } from './env-mode';

const TOKEN = 'a'.repeat(32);

describe('checkout gate', () => {
  test('predvolene zatvorené (predregistrácia)', () => {
    expect(checkoutGate(null, {})).toEqual({ open: false, mode: 'closed' });
    expect(checkoutGate(TOKEN, {})).toEqual({ open: false, mode: 'closed' });
  });
  test('správny token otvorí test režim, nesprávny nie', () => {
    const env = { CHECKOUT_TEST_TOKEN: TOKEN };
    expect(checkoutGate(TOKEN, env)).toEqual({ open: true, mode: 'test' });
    expect(checkoutGate(TOKEN + 'x', env).open).toBe(false);
    expect(checkoutGate('', env).open).toBe(false);
  });
  test('krátky token v env nič neotvorí', () => {
    expect(checkoutGate('abc', { CHECKOUT_TEST_TOKEN: 'abc' }).open).toBe(false);
  });
  test('CHECKOUT_ENABLED=true otvorí pre všetkých', () => {
    expect(checkoutGate(null, { CHECKOUT_ENABLED: 'true' })).toEqual({ open: true, mode: 'public' });
    expect(checkoutGate(null, { CHECKOUT_ENABLED: '1' }).open).toBe(false);
  });
  test('token z hlavičky aj z ?test=', () => {
    const env = { CHECKOUT_TEST_TOKEN: TOKEN };
    expect(gateFromRequest(new Request('https://x.sk/api', { headers: { 'x-checkout-test': TOKEN } }), env).open).toBe(true);
    expect(gateFromRequest(new Request(`https://x.sk/api?test=${TOKEN}`), env).open).toBe(true);
  });
});

describe('režim kľúčov nezávisí od NODE_ENV / VERCEL_ENV', () => {
  test('stripe', () => {
    expect(stripeMode({ STRIPE_SECRET_KEY: 'sk_test_x', NODE_ENV: 'production', VERCEL_ENV: 'production' })).toBe('test');
    expect(stripeMode({ STRIPE_SECRET_KEY: 'sk_live_x' })).toBe('live');
    expect(stripeMode({})).toBe('unset');
  });
  test('fhb', () => {
    expect(fhbMode({ FHB_API_URL: 'https://api-stage.fhb.sk/v3', VERCEL_ENV: 'production' })).toBe('sandbox');
    expect(fhbMode({ FHB_API_URL: 'https://api.fhb.sk/v3' })).toBe('production');
  });
});
