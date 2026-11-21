import { getSpsPoints, searchPoints } from '@/lib/delivery-points';

/*
 * GET /api/delivery-points?service=sps&q=<mesto alebo PSČ>  → { source, total, hasCoords, points[] (max 40) }
 * GET /api/delivery-points?service=sps&id=<kód>             → { source, point | null }
 * Verejné údaje (adresy výdajných miest), preto bez prepínača predaja. Odpoveď sa cachuje na CDN 1 h.
 */
export const dynamic = 'force-dynamic';

const CACHE = 'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const service = url.searchParams.get('service') ?? 'sps';
  if (service !== 'sps') return Response.json({ error: 'nepodporovaná služba' }, { status: 400 });
  try {
    const { source, points } = await getSpsPoints();
    const id = url.searchParams.get('id');
    if (id) {
      const point = points.find((p) => p.id === id) ?? null;
      return Response.json({ source, point }, { status: point ? 200 : 404, headers: { 'Cache-Control': CACHE } });
    }
    const q = (url.searchParams.get('q') ?? '').slice(0, 60);
    const found = searchPoints(points, q);
    return Response.json(
      { source, total: points.length, hasCoords: found.some((p) => p.lat != null), points: found },
      { headers: { 'Cache-Control': CACHE, 'X-Robots-Tag': 'noindex' } },
    );
  } catch (e) {
    console.error('[delivery-points]', e);
    return Response.json({ error: 'Výdajné miesta sa nepodarilo načítať. Skús to o chvíľu.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
