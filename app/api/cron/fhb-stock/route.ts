import { checkStock, jobDepsFromEnv } from '@/lib/fhb/jobs';
import { cronAuth } from '@/lib/secret';

/* Vercel Cron: nízky sklad (free_quantity vs. spotreba predplatných za 5 týždňov) → interné upozornenie (SPEC P2). */
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: Request) {
  const denied = cronAuth(req);
  if (denied) return denied;
  const low = await checkStock(await jobDepsFromEnv());
  console.info('[cron fhb-stock]', JSON.stringify(low));
  return Response.json({ low });
}
