import { fail, json } from '@/lib/ucet/http';
import { invoicesOf } from '@/lib/ucet/portal';
import { requireCustomer } from '@/lib/ucet/session';
import { stripe } from '@/lib/stripe';

/* GET /api/ucet/faktury → faktúry zo Stripe (PDF a online verzia). Načíta sa zvlášť, aby Stripe nespomaľoval /ucet. */
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const s = await requireCustomer();
    if (!s.customer.stripe_customer_id) return json({ ok: true, invoices: [] });
    return json({ ok: true, invoices: await invoicesOf(stripe(), s.customer.stripe_customer_id) });
  } catch (e) {
    return fail(e);
  }
}
