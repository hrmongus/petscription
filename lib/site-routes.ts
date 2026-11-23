import fs from 'node:fs';
import path from 'node:path';

/*
 * URL pravidlá statického webu (public/granula/) — 1:1 prepis pôvodného vercel.json (cleanUrls + redirects +
 * rewrites + headers). Používa ich next.config.ts; testy v lib/site-routes.test.ts.
 *
 * Správanie, ktoré drží produkcia (overené proti www.granula.sk pred migráciou, scripts/check-urls.mjs):
 *   /podpora            → public/granula/podpora.html
 *   /podpora.html       → 308 /podpora            (cleanUrls)
 *   /index, /index.html → 308 /                   (cleanUrls)
 *   /blog/index.html    → 308 /blog → 308 /blog/  (cleanUrls, potom vlastné presmerovanie)
 *   /blog/, /blog/x/, /blog/x  → index.html v priečinku (priečinok aj bez lomky)
 *   /podpora/           → 404
 *   /granula/...        → 308 bez /granula
 *   /granula.css, /img/… → súbory z public/granula/
 */

export const SITE_DIR = 'granula'; // podpriečinok public/

type Redirect = { source: string; destination: string; permanent: boolean };
type Rewrite = { source: string; destination: string };
type Header = { source: string; headers: { key: string; value: string }[] };

/** Priečinky (relatívne k public/granula), ktoré majú index.html. Načítané pri builde. */
export function indexDirs(root = path.join(process.cwd(), 'public', SITE_DIR)): string[] {
  const out: string[] = [];
  const walk = (rel: string) => {
    for (const e of fs.readdirSync(path.join(root, rel), { withFileTypes: true })) {
      if (!e.isDirectory()) continue;
      const sub = rel ? `${rel}/${e.name}` : e.name;
      if (fs.existsSync(path.join(root, sub, 'index.html'))) out.push(sub);
      walk(sub);
    }
  };
  walk('');
  return out.sort();
}

export function redirects(): Redirect[] {
  return [
    // cleanUrls (Vercel ich robí pred vlastnými presmerovaniami)
    { source: '/index', destination: '/', permanent: true },
    { source: '/index.html', destination: '/', permanent: true },
    { source: '/:dir(.+)/index', destination: '/:dir', permanent: true },
    { source: '/:dir(.+)/index.html', destination: '/:dir', permanent: true },
    { source: '/:file(.+)\\.html', destination: '/:file', permanent: true },
    // vlastné presmerovania z vercel.json
    { source: '/suroviny', destination: '/#suroviny', permanent: true },
    { source: '/granula', destination: '/', permanent: true },
    { source: '/granula/', destination: '/', permanent: true },
    { source: '/granula/:path*', destination: '/:path*', permanent: true },
    // /blog → /blog/ a /admin-blog → /admin-blog/ sú v proxy.ts (tu by sa zhodovali aj s /blog/ → slučka)
  ];
}

/**
 * Rewrites vo fáze `fallback`: uplatnia sa až keď cestu nevybaví nič v app/ (napr. /api/*), takže nové route
 * handlery majú vždy prednosť pred statickým webom.
 */
export function rewrites(dirs: string[] = indexDirs()): Rewrite[] {
  return [
    { source: '/', destination: `/${SITE_DIR}/index.html` },
    // priečinky s index.html: s lomkou aj bez nej (tak ako Vercel)
    ...dirs.flatMap((d) => [
      { source: `/${d}/`, destination: `/${SITE_DIR}/${d}/index.html` },
      { source: `/${d}`, destination: `/${SITE_DIR}/${d}/index.html` },
    ]),
    // súbory s príponou (css, js, obrázky, pdf, xml…)
    { source: '/:path((?:[^/]+/)*[^/]+\\.[^/]+)', destination: `/${SITE_DIR}/:path` },
    // čisté adresy stránok: /podpora → podpora.html
    { source: '/:path((?:[^/]+/)*[^/.]+)', destination: `/${SITE_DIR}/:path.html` },
  ];
}

const NOINDEX = [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }];

export function headers(): Header[] {
  return [
    // z vercel.json
    { source: '/blog/nahlad-pdf/:path*', headers: NOINDEX },
    { source: '/granula/blog/nahlad-pdf/:path*', headers: NOINDEX },
    // interné stránky: meta noindex majú v HTML, hlavička je druhá poistka (SPEC P0); admin-vypocet je od P3 v admin/ (manazer.granula.sk)
    { source: '/admin-blog/:path*', headers: NOINDEX },
    { source: '/blog/nahlad/:path*', headers: NOINDEX },
  ];
}
