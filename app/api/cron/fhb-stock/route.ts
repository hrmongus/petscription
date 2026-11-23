import { checkStock, jobDepsFromEnv } from '@/lib/fhb/jobs';
import { runCron } from '@/lib/secret';

/* Vercel Cron: nízky sklad (free_quantity vs. spotreba predplatných za 5 týždňov) → interné upozornenie (SPEC P2). */
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export function GET(req: Request) {
  return runCron(req, 'fhb-stock', async () => ({ low: await checkStock(await jobDepsFromEnv()) }));
}
