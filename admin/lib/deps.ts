import { serverParams } from '@lib/engine-server';
import { FhbClient } from '@lib/fhb/client';
import { sendOptionsFromEnv, sendOrderToFhb, supabaseOrderStore } from '@lib/fhb/send';
import { supabaseOrderActionStore } from '@lib/order-actions';
import { stripe } from '@lib/stripe';

/* Závislosti akcií admina (rovnaké ako webhook a crony; všetka logika je v ../lib). */

export const fhb = () => FhbClient.fromEnv();
export const orderStore = () => supabaseOrderActionStore();
export const cycle = () => {
  const P = serverParams();
  return { leadDays: P.reorderLeadDays, shipDays: P.shipDays };
};
export { stripe, sendOptionsFromEnv };

export async function sendToFhb(orderId: string) {
  return sendOrderToFhb(orderId, { client: fhb(), store: await supabaseOrderStore(), options: sendOptionsFromEnv() });
}
