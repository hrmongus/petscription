import type { FulfillmentEvents } from './fulfillment';
import { linkOrder, supabaseQuizStore } from './quiz';

/*
 * P7: čo sa po spracovaní Stripe webhooku deje pre dotazník a analytiku (lib/fulfillment.ts → deps.events).
 *   orderCreated → quiz_sessions.order_id (spárovanie dotazníka s objednávkou)
 * Všetko je mimo hlavného toku: chyba sa zaloguje, objednávka, FHB aj emaily bežia ďalej.
 */
export async function fulfillmentEvents(): Promise<FulfillmentEvents> {
  const quiz = await supabaseQuizStore();
  return {
    async orderCreated({ order, metadata }) {
      await linkOrder(metadata.quiz_session, order.id, quiz);
    },
  };
}
