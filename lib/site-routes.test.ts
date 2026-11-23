import { describe, expect, test } from 'vitest';
import { headers, indexDirs, redirects, rewrites } from './site-routes';

describe('site-routes', () => {
  test('priečinky s index.html', () => {
    const d = indexDirs();
    expect(d).toContain('blog');
    expect(d).toContain('admin-blog');
    expect(d.some((x) => x.startsWith('blog/nahlad/'))).toBe(true);
  });
  test('všetky pôvodné presmerovania z vercel.json sú zachované', () => {
    const r = redirects().map((x) => `${x.source} ${x.destination} ${x.permanent}`);
    for (const x of ['/suroviny /#suroviny true', '/granula / true', '/granula/ / true', '/granula/:path* /:path* true']) expect(r).toContain(x);
  });
  test('catch-all rewrites sú posledné (app/ a /api majú prednosť, fáza fallback v next.config.ts)', () => {
    const rw = rewrites(['blog']);
    expect(rw[0]).toEqual({ source: '/', destination: '/granula/index.html' });
    expect(rw.at(-1)!.destination).toBe('/granula/:path.html');
  });
  test('noindex hlavičky pre PDF náhľady a interné stránky', () => {
    const s = headers().map((h) => h.source);
    for (const x of ['/blog/nahlad-pdf/:path*', '/granula/blog/nahlad-pdf/:path*', '/admin-vypocet', '/admin-blog/:path*']) expect(s).toContain(x);
  });
});
