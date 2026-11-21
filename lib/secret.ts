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
