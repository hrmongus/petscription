import { getPoints, searchPoints, type PointService } from '@/lib/delivery-points';

/*
 * GET /api/delivery-points?service=packeta|dpd&q=<mesto alebo PSČ>  → { source, total, points[] (max 40) }
 * GET /api/delivery-points?service=packeta|dpd&id=<kód>              → { source, point | null }
 * Záložný výber výdajného miesta (keď oficiálny widget nie je k dispozícii) a kontrola vybraného miesta.
 * Verejné údaje (adresy výdajných miest), preto bez prepínača predaja. Odpoveď sa cachuje na CDN 1 h.
 */
export const dynamic = 'force-dynamic';

const CACHE = 'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400';
const SERVICES = new Set<PointService>(['packeta', 'dpd']);

export async function GET(req: Request) {
  const url = new URL(req.url);
  const service = url.searchParams.get('service') as PointService;
  if (!SERVICES.has(service)) return Response.json({ error: 'nepodporovaná služba' }, { status: 400 });
  try {
    const { source, points } = await getPoints(service);
    const id = url.searchParams.get('id');
    if (id) {
      const point = points.find((p) => p.id === id) ?? null;
      return Response.json({ source, point }, { status: point ? 200 : 404, headers: { 'Cache-Control': CACHE } });
    }
    const q = (url.searchParams.get('q') ?? '').slice(0, 60);
    return Response.json({ source, total: points.length, points: searchPoints(points, q) }, { headers: { 'Cache-Control': CACHE, 'X-Robots-Tag': 'noindex' } });
  } catch (e) {
    console.error('[delivery-points]', service, e);
    return Response.json({ error: 'Výdajné miesta sa nepodarilo načítať. Skús to o chvíľu.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
