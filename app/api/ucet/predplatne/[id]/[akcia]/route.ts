import * as A from '@/lib/ucet/actions';
import { actionDepsFromEnv } from '@/lib/ucet/deps';
import { body, fail, json } from '@/lib/ucet/http';
import { requireCustomer, sameOrigin } from '@/lib/ucet/session';

/*
 * POST /api/ucet/predplatne/<id>/<akcia> (SPEC P4). Vlastníctvo kontroluje lib/ucet/actions.ts.
 *   posunut { day } · preskocit · pauza · obnovit { day? } · vaha { kg, preview } · plan { productId, bagId, preview }
 *   dorucenie { delivery } · zrusit { reason } · zrusit-spat
 */
export const dynamic = 'force-dynamic';

export async function POST(req: Request, ctx: { params: Promise<{ id: string; akcia: string }> }) {
  if (!sameOrigin(req)) return json({ error: 'Neplatná požiadavka.' }, 403);
  const { id, akcia } = await ctx.params;
  const b = await body(req);
  try {
    const s = await requireCustomer();
    const deps = await actionDepsFromEnv();
    const c = s.customer;
    switch (akcia) {
      case 'posunut':
        return json(await A.moveDelivery(deps, c, id, b.day));
      case 'preskocit':
        return json(await A.skipDelivery(deps, c, id));
      case 'pauza':
        return json(await A.pauseSubscription(deps, c, id));
      case 'obnovit':
        return json(await A.resumeSubscription(deps, c, id, b.day));
      case 'vaha':
        return json(await A.changeWeight(deps, c, id, b));
      case 'plan':
        return json(await A.changeRecipeOrBag(deps, c, id, b));
      case 'dorucenie':
        return json(await A.changeDelivery(deps, c, id, b.delivery));
      case 'zrusit':
        return json(await A.cancelSubscription(deps, c, id, b.reason));
      case 'zrusit-spat':
        return json(await A.revokeCancel(deps, c, id));
      default:
        return json({ error: 'Neznáma akcia.' }, 404);
    }
  } catch (e) {
    return fail(e);
  }
}
