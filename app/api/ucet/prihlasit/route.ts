import { body, fail, json } from '@/lib/ucet/http';
import { loginDepsFromEnv, verifyCode, VerifySchema } from '@/lib/ucet/login';
import { ipOf, sameOrigin } from '@/lib/ucet/session';

/* POST /api/ucet/prihlasit { email, code } → session v cookie (Supabase verifyOtp type email). */
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  if (!sameOrigin(req)) return json({ error: 'Neplatná požiadavka.' }, 403);
  const parsed = VerifySchema.safeParse(await body(req));
  if (!parsed.success) return json({ error: 'Zadaj kód z e-mailu (iba číslice).' }, 400);
  try {
    await verifyCode(parsed.data.email, parsed.data.code, ipOf(req), await loginDepsFromEnv());
    return json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
