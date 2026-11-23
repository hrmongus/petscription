/*
 * P7: reverse proxy pre PostHog (SPEC §10 P7.5). Prehliadač posiela udalosti na vlastnú doménu (/ingest/…),
 * Next ich prepíše na PostHog (NEXT_PUBLIC_POSTHOG_HOST, US cloud) a statické skripty na *-assets.
 * Blokovače reklám potom neskresľujú funnel; súhlas s analytickými cookies platí rovnako (cookies.js).
 * Rewrites idú do fázy beforeFiles (pred statický web v public/granula).
 */
export const INGEST_PATH = '/ingest';

export function posthogHosts(host = process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com') {
  const api = host.replace(/\/+$/, '');
  return { api, assets: api.replace('.i.posthog.com', '-assets.i.posthog.com'), ui: api.replace('.i.posthog.com', '.posthog.com') };
}

export function analyticsRewrites(host?: string) {
  const h = posthogHosts(host);
  return [
    { source: `${INGEST_PATH}/static/:path*`, destination: `${h.assets}/static/:path*` },
    { source: `${INGEST_PATH}/array/:path*`, destination: `${h.assets}/array/:path*` },
    { source: `${INGEST_PATH}/:path*`, destination: `${h.api}/:path*` },
  ];
}
