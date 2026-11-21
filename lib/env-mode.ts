/*
 * Test vs. live sa NIKDY neodvodzuje z NODE_ENV ani VERCEL_ENV: produkcia (granula.sk) beží zatiaľ s test kľúčmi
 * (Stripe test, FHB api-stage). Režim určuje iba samotný kľúč / URL.
 */
type Env = Record<string, string | undefined>;

export function stripeMode(env: Env = process.env): 'test' | 'live' | 'unset' {
  const k = env.STRIPE_SECRET_KEY ?? '';
  if (!k) return 'unset';
  return k.startsWith('sk_live_') || k.startsWith('rk_live_') ? 'live' : 'test';
}

/** FHB produkcia je iba https://api.fhb.sk; všetko ostatné (api-stage, api-dev, mock) je sandbox. */
export function fhbMode(env: Env = process.env): 'sandbox' | 'production' | 'unset' {
  const u = env.FHB_API_URL ?? '';
  if (!u) return 'unset';
  try {
    return new URL(u).hostname === 'api.fhb.sk' ? 'production' : 'sandbox';
  } catch {
    return 'unset';
  }
}
