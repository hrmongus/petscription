import { jobDepsFromEnv, retryPaid, syncOrders } from '@/lib/fhb/jobs';
import { cronAuth } from '@/lib/secret';

/* Vercel Cron: znova odoslať `paid` objednávky do FHB a dorovnať stavy z GET /order/history (SPEC P2). */
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: Request) {
  const denied = cronAuth(req);
  if (denied) return denied;
  const deps = await jobDepsFromEnv();
  const retried = await retryPaid(deps);
  const synced = await syncOrders(deps);
  console.info('[cron fhb-orders]', JSON.stringify({ retried, synced }));
  return Response.json({ retried, synced });
}
