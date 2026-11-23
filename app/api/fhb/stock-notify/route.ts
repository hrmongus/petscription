import { checkStock, jobDepsFromEnv } from '@/lib/fhb/jobs';
import { db } from '@/lib/db';
import { safeEqual } from '@/lib/secret';

/*
 * Skladová notifikácia FHB (notify_url produktu): POST JSON { id, type, qty, stockQuantity, reason, serialNumbers[] }.
 * Zalogujeme do fhb_events a skontrolujeme sklad daného produktu z free_quantity (notifikácia má iba celkový stav).
 */
export const dynamic = 'force-dynamic';

async function handle(req: Request) {
  const url = new URL(req.url);
  if (!safeEqual(url.searchParams.get('t'), process.env.FHB_NOTIFY_TOKEN)) return new Response('Unauthorized', { status: 401 });
  const raw = req.method === 'POST' ? (await req.text()).slice(0, 20_000) : '';
  let body: { id?: unknown } | string | null = raw || null;
  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {
    /* text */
  }
  await db().from('fhb_events').insert({ order_id: null, type: 'stock', payload: { method: req.method, body } as never });
  const sku = body && typeof body === 'object' && typeof body.id === 'string' ? body.id : null;
  try {
    const low = await checkStock(await jobDepsFromEnv(), sku ? { only: [sku.replace(/-18$/, '-9')] } : {});
    return Response.json({ ok: true, low: low.map((r) => r.sku) });
  } catch (e) {
    console.error('[stock-notify] kontrola skladu zlyhala', e);
    return Response.json({ ok: true, checked: false });
  }
}

export const GET = handle;
export const POST = handle;
