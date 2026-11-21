import { createHash, timingSafeEqual } from 'node:crypto';

/*
 * Prepínač predaja. Testujeme priamo na produkcii (granula.sk) s test kľúčmi, kým nie sú zákazníci:
 *   CHECKOUT_ENABLED=true          → doručenie a platba sú v dotazníku pre všetkých (spustenie predaja)
 *   inak (predvolené)              → dotazník ako dnes (predregistrácia); doručenie a platba iba s tajným
 *                                    parametrom ?test=<CHECKOUT_TEST_TOKEN>
 * Platí pre UI (GET /api/checkout/status) aj pre každý serverový endpoint checkoutu (POST /api/checkout).
 * Prepínač nehovorí nič o tom, či sú kľúče test alebo live: to určujú iba samotné kľúče (lib/env-mode.ts).
 */

export const TEST_HEADER = 'x-checkout-test';
const MIN_TOKEN = 16;

export type GateMode = 'public' | 'test' | 'closed';
type Env = Record<string, string | undefined>;

const digest = (s: string) => createHash('sha256').update(s).digest();

/** Porovnanie tokenu v konštantnom čase. Krátky alebo nenastavený CHECKOUT_TEST_TOKEN nič neotvorí. */
export function validTestToken(token: string | null | undefined, env: Env = process.env): boolean {
  const secret = env.CHECKOUT_TEST_TOKEN ?? '';
  if (secret.length < MIN_TOKEN || !token) return false;
  return timingSafeEqual(digest(token), digest(secret));
}

export function checkoutGate(token: string | null | undefined, env: Env = process.env): { open: boolean; mode: GateMode } {
  if (env.CHECKOUT_ENABLED === 'true') return { open: true, mode: 'public' };
  if (validTestToken(token, env)) return { open: true, mode: 'test' };
  return { open: false, mode: 'closed' };
}

/** Token z požiadavky: hlavička (preferovaná, nekončí v logoch URL) alebo ?test=. */
export function gateFromRequest(req: Request, env: Env = process.env) {
  const token = req.headers.get(TEST_HEADER) ?? new URL(req.url).searchParams.get('test');
  return checkoutGate(token, env);
}
