import { jobDepsFromEnv, retryPaid, syncOrders } from '@/lib/fhb/jobs';
import { runCron } from '@/lib/secret';

/* Vercel Cron: znova odoslať `paid` objednávky do FHB a dorovnať stavy z GET /order/history (SPEC P2). */
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export function GET(req: Request) {
  return runCron(req, 'fhb-orders', async () => {
    const deps = await jobDepsFromEnv();
    return { retried: await retryPaid(deps), synced: await syncOrders(deps) };
  });
}
