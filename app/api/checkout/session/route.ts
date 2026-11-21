import { orderByStripeRef } from '@/lib/store';
import { isOurs, stripe, stripeConfigured } from '@/lib/stripe';

/*
 * GET /api/checkout/session?session_id=cs_… → { status, order? } pre stránku „Hotovo“ (iba číta, nič nezakladá).
 *   status: "paid" (objednávka je v DB), "processing" (zaplatené, webhook ešte nedobehol), "open" (nezaplatené)
 */
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get('session_id') ?? '';
  const headers = { 'Cache-Control': 'no-store' };
  if (!/^cs_(test|live)_[A-Za-z0-9]{10,200}$/.test(id) || !stripeConfigured()) return Response.json({ status: 'unknown' }, { status: 400, headers });
  try {
    const order = await orderByStripeRef(id);
    if (order) return Response.json({ status: 'paid', order: { number: order.number, kind: order.kind } }, { headers });
    const session = await stripe().checkout.sessions.retrieve(id);
    if (!isOurs(session.metadata)) return Response.json({ status: 'unknown' }, { status: 404, headers });
    const paid = session.status === 'complete' && session.payment_status !== 'unpaid';
    return Response.json({ status: paid ? 'processing' : 'open' }, { headers });
  } catch (e) {
    console.error('[checkout/session]', e);
    return Response.json({ status: 'unknown' }, { status: 404, headers });
  }
}
