import { stripeMode } from '@lib/env-mode';

/** Odkaz do Stripe dashboardu (záloha pre prípad, že treba ísť priamo do Stripe). */
export function stripeUrl(path: string) {
  return `https://dashboard.stripe.com/${stripeMode() === 'live' ? '' : 'test/'}${path}`;
}
