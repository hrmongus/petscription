import { fail, json } from '@/lib/ucet/http';
import { cardUpdateUrl } from '@/lib/ucet/portal';
import { requireCustomer, sameOrigin } from '@/lib/ucet/session';
import { stripe } from '@/lib/stripe';

/* POST /api/ucet/karta → odkaz do Stripe Customer Portal rovno na zmenu karty. */
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  if (!sameOrigin(req)) return json({ error: 'Neplatná požiadavka.' }, 403);
  try {
    const s = await requireCustomer();
    if (!s.customer.stripe_customer_id) return json({ error: 'Zatiaľ nemáš uloženú kartu.' }, 409);
    return json({ ok: true, url: await cardUpdateUrl(stripe(), s.customer.stripe_customer_id, process.env.NEXT_PUBLIC_SITE_URL || 'https://www.granula.sk') });
  } catch (e) {
    return fail(e);
  }
}
