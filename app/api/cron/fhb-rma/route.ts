import { jobDepsFromEnv, syncRma } from '@/lib/fhb/jobs';
import { cronAuth } from '@/lib/secret';

/* Vercel Cron: vrátené zásielky z GET /rma/list → stav `returned` + interné upozornenie (SPEC P2). */
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: Request) {
  const denied = cronAuth(req);
  if (denied) return denied;
  const returned = await syncRma(await jobDepsFromEnv());
  console.info('[cron fhb-rma]', JSON.stringify(returned));
  return Response.json({ returned });
}
