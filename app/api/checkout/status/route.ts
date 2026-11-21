import { gateFromRequest } from '@/lib/checkout-gate';

// Či dotazník ukáže doručenie a platbu (lib/checkout-gate.ts). Nikdy sa necacheuje.
export const dynamic = 'force-dynamic';

export function GET(req: Request) {
  const { open, mode } = gateFromRequest(req);
  return Response.json({ open, mode }, { headers: { 'Cache-Control': 'no-store, max-age=0', 'X-Robots-Tag': 'noindex' } });
}
