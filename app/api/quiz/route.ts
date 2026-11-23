import { QuizInputSchema, saveQuizStep, supabaseQuizStore } from '@/lib/quiz';

/*
 * POST /api/quiz — priebežné uloženie dotazníka po každom kroku (SPEC P7, tabuľka quiz_sessions).
 * Bez emailu anonymné. Nepatrí pod prepínač predaja: dotazník funguje vždy (aj pri predregistrácii).
 * Prehliadač posiela cez navigator.sendBeacon alebo fetch keepalive; odpoveď nič nenesie a chyba nič nerozbije.
 */
export const dynamic = 'force-dynamic';

const MAX_BODY = 16_000;
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

export async function POST(req: Request) {
  const text = await req.text();
  if (text.length > MAX_BODY) return json({ error: 'too large' }, 413);
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return json({ error: 'invalid json' }, 400);
  }
  const parsed = QuizInputSchema.safeParse(body);
  if (!parsed.success) return json({ error: 'invalid', field: parsed.error.issues[0]?.path.join('.') }, 422);
  try {
    const r = await saveQuizStep(parsed.data, await supabaseQuizStore(), { ownHost: new URL(req.url).hostname });
    return json({ ok: true, ...r });
  } catch (e) {
    console.error('[quiz] uloženie zlyhalo', e);
    return json({ error: 'save failed' }, 500);
  }
}
