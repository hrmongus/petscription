import { accountView, loadAccount } from '@/lib/ucet/account';
import { fail, json } from '@/lib/ucet/http';
import { requireCustomer } from '@/lib/ucet/session';

/* GET /api/ucet/ja → údaje pre /ucet (čítanie cez RLS). 401 = zobraziť prihlásenie. */
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const s = await requireCustomer();
    const view = accountView(await loadAccount(s.sb, s.customer));
    return json({ ok: true, ...view, packetaKey: process.env.PACKETA_API_KEY ?? '' });
  } catch (e) {
    return fail(e);
  }
}
