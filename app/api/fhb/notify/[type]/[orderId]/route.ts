import { fhbOrderId, NOTIFY_TYPES } from '@/lib/fhb/build-order';
import { jobDepsFromEnv } from '@/lib/fhb/jobs';
import { applyFhbOrder, type DbOrder } from '@/lib/fhb/sync';
import { db } from '@/lib/db';
import { safeEqual } from '@/lib/secret';

/*
 * Notifikácia FHB o stave objednávky: /api/fhb/notify/<confirmed|sent|delivered|returned>/<orders.id>?t=<FHB_NOTIFY_TOKEN>
 * Formát notifikácie FHB nezdokumentovalo (SPEC P2) → prijmeme GET aj POST s akýmkoľvek telom, celé ho zalogujeme
 * do fhb_events a stav NEBERIEME z notifikácie, ale overíme cez GET /order. Odpoveď 200 (aj keď overenie zlyhá:
 * stav dorovná cron), 401 pri zlom tokene, 404 pri neznámom type alebo objednávke.
 */
export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function handle(req: Request, ctx: { params: Promise<{ type: string; orderId: string }> }) {
  const { type, orderId } = await ctx.params;
  const url = new URL(req.url);
  if (!safeEqual(url.searchParams.get('t'), process.env.FHB_NOTIFY_TOKEN)) return new Response('Unauthorized', { status: 401 });
  if (!(NOTIFY_TYPES as readonly string[]).includes(type) || !UUID.test(orderId)) return new Response('Not found', { status: 404 });

  const raw = req.method === 'POST' ? (await req.text()).slice(0, 20_000) : '';
  let body: unknown = raw || null;
  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {
    /* nie JSON, necháme text */
  }
  const query = Object.fromEntries([...url.searchParams].filter(([k]) => k !== 't'));
  const { data: order } = await db().from('orders').select('*').eq('id', orderId).maybeSingle();
  await db().from('fhb_events').insert({
    order_id: order?.id ?? null,
    type: `notify.${type}`,
    payload: { method: req.method, query, body, content_type: req.headers.get('content-type'), user_agent: req.headers.get('user-agent') } as never,
  });
  if (!order) return new Response('Not found', { status: 404 });

  try {
    const deps = await jobDepsFromEnv();
    const f = await deps.fhb.getOrder(fhbOrderId(order.number));
    if (!f) return Response.json({ ok: true, verified: false });
    const r = await applyFhbOrder(order as DbOrder, f, deps);
    return Response.json({ ok: true, verified: true, status: r.to });
  } catch (e) {
    console.error('[fhb-notify] overenie zlyhalo', orderId, e);
    return Response.json({ ok: true, verified: false });
  }
}

export const GET = handle;
export const POST = handle;
