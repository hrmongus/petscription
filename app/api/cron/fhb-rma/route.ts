import { jobDepsFromEnv, syncRma } from '@/lib/fhb/jobs';
import { runCron } from '@/lib/secret';

/* Vercel Cron: vrátené zásielky z GET /rma/list → stav `returned` + interné upozornenie (SPEC P2). */
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export function GET(req: Request) {
  return runCron(req, 'fhb-rma', async () => ({ returned: await syncRma(await jobDepsFromEnv()) }));
}
