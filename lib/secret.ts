import { createHash, timingSafeEqual } from 'node:crypto';

/** porovnanie tajomstva v konštantnom čase (dĺžka sa neprezradí, porovnávajú sa SHA-256 odtlačky) */
export function safeEqual(given: string | null | undefined, expected: string | null | undefined): boolean {
  if (!given || !expected) return false;
  const d = (s: string) => createHash('sha256').update(s).digest();
  return timingSafeEqual(d(given), d(expected));
}

/**
 * Vercel Cron posiela `Authorization: Bearer <CRON_SECRET>` (keď je CRON_SECRET v env projektu).
 * Bez CRON_SECRET sa cron nespustí nikdy (503), aby endpointy neboli verejné.
 */
export function cronAuth(req: Request, env: Record<string, string | undefined> = process.env): Response | null {
  const secret = env.CRON_SECRET;
  if (!secret) return new Response('CRON_SECRET nie je nastavený', { status: 503 });
  const h = req.headers.get('authorization') ?? '';
  if (!safeEqual(h, `Bearer ${secret}`)) return new Response('Unauthorized', { status: 401 });
  return null;
}

/** Spustí cron úlohu a každý beh zapíše do fhb_events (`cron.<úloha>`, výsledok alebo chyba): dôkaz behu a história. */
export async function runCron<T>(req: Request, job: string, fn: () => Promise<T>): Promise<Response> {
  const denied = cronAuth(req);
  if (denied) return denied;
  const { db } = await import('./db');
  const started = Date.now();
  try {
    const result = await fn();
    console.info(`[cron ${job}]`, JSON.stringify(result));
    await db().from('fhb_events').insert({ order_id: null, type: `cron.${job}`, payload: { ok: true, ms: Date.now() - started, result } as never });
    return Response.json(result);
  } catch (e) {
    console.error(`[cron ${job}] zlyhal`, e);
    await db().from('fhb_events').insert({ order_id: null, type: `cron.${job}`, payload: { ok: false, ms: Date.now() - started, error: String((e as Error)?.message ?? e).slice(0, 1000) } as never });
    return Response.json({ error: (e as Error)?.message ?? 'chyba' }, { status: 500 });
  }
}
