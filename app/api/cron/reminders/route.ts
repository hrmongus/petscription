import { defaultMailer } from '@/lib/email';
import { sendRenewalReminders } from '@/lib/reminders';
import { runCron } from '@/lib/secret';

/* Vercel Cron: pripomienka pred platbou predplatného (24–72 h vopred, SPEC P5). */
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export function GET(req: Request) {
  return runCron(req, 'reminders', async () => ({
    reminders: await sendRenewalReminders({ mail: await defaultMailer(), siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.granula.sk' }),
  }));
}
