import { gateFromRequest } from '@/lib/checkout-gate';

// Či dotazník ukáže doručenie a platbu (lib/checkout-gate.ts). Nikdy sa necacheuje.
// Pri otvorenom predaji aj verejný kľúč Packeta widgetu (je určený pre prehliadač, nie je tajný; tajné je API heslo).
export const dynamic = 'force-dynamic';

export function GET(req: Request) {
  const { open, mode } = gateFromRequest(req);
  const body = open ? { open, mode, packetaKey: process.env.PACKETA_API_KEY ?? '' } : { open, mode };
  return Response.json(body, { headers: { 'Cache-Control': 'no-store, max-age=0', 'X-Robots-Tag': 'noindex' } });
}
