import { INGEST_PATH, posthogHosts } from '@/lib/analytics-routes';

/*
 * GET /api/analytics/config — verejná konfigurácia PostHogu pre public/granula/analytics.js (statický web nemá
 * prístup k env). Projektový kľúč PostHogu je verejný (phc_…, rovnako by bol v HTML). Volá sa iba po súhlase.
 */
export const dynamic = 'force-dynamic';

export function GET() {
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY || '';
  const body = key ? { posthog: { key, apiHost: INGEST_PATH, uiHost: posthogHosts().ui } } : { posthog: null };
  return Response.json(body, { headers: { 'Cache-Control': 'public, max-age=300, s-maxage=300' } });
}
