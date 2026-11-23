import { NextResponse, type NextRequest } from 'next/server';

/*
 * Presné správanie koncovej lomky zo starého vercel.json. Pravidlá v next.config.ts (lib/site-routes.ts) koncovú
 * lomku ignorujú, takže tu riešime len to, čo sa nimi vyjadriť nedá:
 *   /blog, /admin-blog → 308 s lomkou (pravidlo v configu by presmerovalo aj /blog/ → slučka)
 *   /podpora/ a iné cesty s lomkou, ktoré nie sú priečinok s index.html → 404 (ako Vercel); okrem /api/ a /ingest/ (PostHog, P7)
 * Zoznam priečinkov sa vloží pri builde (next.config.ts → env GRANULA_INDEX_DIRS).
 */
const SLASH_REDIRECT = new Set(['/blog', '/admin-blog']);
const INDEX_DIRS = new Set<string>(JSON.parse(process.env.GRANULA_INDEX_DIRS || '[]'));

export function proxy(req: NextRequest) {
  // req.nextUrl.pathname má koncovú lomku odstránenú (trailingSlash: false), preto surová URL
  const pathname = new URL(req.url).pathname;
  if (SLASH_REDIRECT.has(pathname)) {
    const url = new URL(req.url);
    url.pathname = pathname + '/';
    return NextResponse.redirect(url, 308);
  }
  if (pathname.length > 1 && pathname.endsWith('/') && !INDEX_DIRS.has(pathname.slice(1, -1)) && !pathname.startsWith('/api/') && !pathname.startsWith('/ingest/')) {
    return new NextResponse('Not Found', { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8' } });
  }
  return NextResponse.next();
}

export const config = {
  // len stránky webu; nie interné súbory Next.js a statické súbory s príponou
  matcher: ['/((?!_next/|.*\\.[^/]+$).*)'],
};
