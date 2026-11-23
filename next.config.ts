import type { NextConfig } from 'next';
import { headers, indexDirs, redirects, rewrites } from './lib/site-routes';
import { analyticsRewrites } from './lib/analytics-routes';

// Statický web je v public/granula/ a servíruje sa z koreňa domény; všetky URL pravidlá sú v lib/site-routes.ts.
const nextConfig: NextConfig = {
  poweredByHeader: false,
  // priečinky s index.html pre proxy.ts (presné správanie koncovej lomky)
  env: { GRANULA_INDEX_DIRS: JSON.stringify(indexDirs()) },
  // Vercel cleanUrls nemal trailingSlash: /blog/ musí ostať /blog/ (inak slučka s presmerovaním /blog → /blog/).
  skipTrailingSlashRedirect: true,
  // proxy.ts potrebuje surovú cestu vrátane koncovej lomky
  skipProxyUrlNormalize: true,
  // Vercel porovnával cesty s rozlíšením veľkosti písmen (/SUROVINY = 404)
  experimental: { caseSensitiveRoutes: true },
  async redirects() {
    return redirects();
  },
  async rewrites() {
    // P7: /ingest → PostHog (lib/analytics-routes.ts)
    return { beforeFiles: analyticsRewrites(), afterFiles: [], fallback: rewrites() };
  },
  async headers() {
    return headers();
  },
};

export default nextConfig;
