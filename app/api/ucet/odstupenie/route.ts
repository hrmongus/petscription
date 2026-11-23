import { body, fail, json } from '@/lib/ucet/http';
import { ipOf, requireCustomer, sameOrigin } from '@/lib/ucet/session';
import { matchOrder, submitWithdrawal, WithdrawalMismatch, WithdrawalRateLimited } from '@/lib/withdrawal';
import { supabaseWithdrawalStore, withdrawalDepsFromEnv } from '@/lib/withdrawal-store';

/*
 * POST /api/ucet/odstupenie { orderNumber, reason?, confirm } → odstúpenie z účtu (predvyplnené: meno, e-mail, číslo).
 * Zhoda podľa prihláseného zákazníka. Rovnaký postup ako /odstupenie (lib/withdrawal.ts), zdroj „ucet“.
 */
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  if (!sameOrigin(req)) return json({ error: 'Neplatná požiadavka.' }, 403);
  const b = await body(req);
  const ref = String(b.orderNumber ?? '').trim();
  const reason = typeof b.reason === 'string' ? b.reason.trim().slice(0, 1000) : null;
  try {
    const s = await requireCustomer();
    const input = { name: s.customer.name || s.customer.email, email: s.customer.email, contractRef: ref, reason, customerId: s.customer.id, source: 'ucet' as const, analyticsConsent: b.consent === true, ip: ipOf(req), userAgent: req.headers.get('user-agent') };
    if (b.confirm !== true) {
      await matchOrder(input, supabaseWithdrawalStore);
      return json({ ok: true, checked: true });
    }
    const r = await submitWithdrawal(input, await withdrawalDepsFromEnv());
    return json({ ok: true, ...r, id: undefined });
  } catch (e) {
    if (e instanceof WithdrawalMismatch) return json({ error: 'Túto objednávku v tvojom účte nevidíme.' }, 422);
    if (e instanceof WithdrawalRateLimited) return json({ error: 'Dnes sme od teba dostali už veľa odstúpení. Napíš nám na podpora@granula.sk.' }, 429);
    return fail(e);
  }
}
