import { body, fail, json } from '@/lib/ucet/http';
import { EmailSchema, loginDepsFromEnv, requestCode } from '@/lib/ucet/login';
import { ipOf, sameOrigin } from '@/lib/ucet/session';

/* POST /api/ucet/kod { email } → kód e-mailom (iba existujúcemu zákazníkovi), odpoveď vždy rovnaká (SPEC §10.36). */
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  if (!sameOrigin(req)) return json({ error: 'Neplatná požiadavka.' }, 403);
  const parsed = EmailSchema.safeParse(await body(req));
  if (!parsed.success) return json({ error: 'Skontroluj e-mail.' }, 400);
  try {
    await requestCode(parsed.data.email, ipOf(req), await loginDepsFromEnv());
  } catch (e) {
    console.error('[ucet] kód sa nepodarilo poslať', e);
    return fail(e);
  }
  return json({ ok: true });
}
