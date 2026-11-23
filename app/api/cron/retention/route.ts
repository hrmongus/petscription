import { runRetention, supabaseRetentionStore } from '@/lib/retention';
import { runCron } from '@/lib/secret';
import { stripe, stripeConfigured } from '@/lib/stripe';

/* Vercel Cron: nedokončené nákupy s emailom po 90 dňoch zmazať / anonymizovať (SPEC P7). ?dry=1 iba spočíta. */
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export function GET(req: Request) {
  const dryRun = new URL(req.url).searchParams.get('dry') === '1';
  return runCron(req, 'retention', async () =>
    runRetention({ store: await supabaseRetentionStore(), stripe: stripeConfigured() ? stripe() : null, dryRun }),
  );
}
