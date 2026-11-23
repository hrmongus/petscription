import { matchOrder, submitWithdrawal, WithdrawalFormSchema, WithdrawalMismatch, WithdrawalRateLimited } from '@/lib/withdrawal';
import { supabaseWithdrawalStore, withdrawalDepsFromEnv } from '@/lib/withdrawal-store';

/*
 * POST /api/odstupenie { name, email, contractRef, reason?, confirm } (SPEC P4, §10.35)
 *   confirm: false → iba kontrola, či e-mail sedí s objednávkou (krok 1 → 2), nič sa nezaloží
 *   confirm: true  → záznam, akcie, potvrdzovací e-mail → čas prijatia
 * Nezhoda / neexistujúca objednávka → 422 s hláškou, nič sa nezaloží ani nezruší.
 * Verejné, bez prihlásenia a BEZ prepínača predaja (odstúpiť sa musí dať vždy). Záznam, e-mail a akcie: lib/withdrawal.ts.
 * Odpoveď obsahuje iba to, čo zákazník zadal, + čas prijatia (nič o objednávke, aby sa nedalo hádať cudzie údaje).
 */
export const dynamic = 'force-dynamic';

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Neplatná požiadavka.' }, 400);
  }
  const parsed = WithdrawalFormSchema.safeParse(body);
  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path[0];
    if (field === 'website') return json({ error: 'Neplatná požiadavka.' }, 400);
    return json({ error: parsed.error.issues[0]?.message ?? 'Skontroluj údaje vo formulári.', field }, 400);
  }
  const f = parsed.data;
  try {
    if (!f.confirm) {
      await matchOrder({ email: f.email, contractRef: f.contractRef }, supabaseWithdrawalStore);
      return json({ ok: true, checked: true });
    }
    const r = await submitWithdrawal(
      {
        name: f.name,
        email: f.email,
        contractRef: f.contractRef,
        reason: f.reason ?? null,
        source: 'web',
        analyticsConsent: f.consent === true,
        ip: (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || req.headers.get('x-real-ip'),
        userAgent: req.headers.get('user-agent'),
      },
      await withdrawalDepsFromEnv(),
    );
    return json({ ok: true, ...r, id: undefined });
  } catch (e) {
    if (e instanceof WithdrawalMismatch) return json({ error: e.message, field: 'email' }, 422);
    if (e instanceof WithdrawalRateLimited) return json({ error: 'Z tohto e-mailu sme dnes dostali už veľa odstúpení. Napíš nám prosím na podpora@granula.sk.' }, 429);
    console.error('[odstupenie] záznam zlyhal', e);
    return json({ error: 'Odstúpenie sa nepodarilo uložiť. Skús to prosím znova alebo nám ho pošli e-mailom na podpora@granula.sk.' }, 500);
  }
}
