import { z } from 'zod';
import { restorable, supabaseQuizStore } from '@/lib/quiz';

/*
 * GET /api/quiz/<id> — obnovenie dotazníka z odkazu „späť na výsledok“ (Klaviyo, opustený košík, SPEC P7).
 * Iba dokončená, nezaplatená session do 90 dní. Vráti odpovede a voľby, nič iné (email ani zákazníka nie).
 */
export const dynamic = 'force-dynamic';

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!z.string().uuid().safeParse(id).success) return json({ error: 'not found' }, 404);
  try {
    const row = await (await supabaseQuizStore()).get(id);
    if (!restorable(row)) return json({ error: 'not found' }, 404);
    return json({ answers: row.answers, plan: row.plan, bag: row.bag_id });
  } catch (e) {
    console.error('[quiz] obnovenie zlyhalo', e);
    return json({ error: 'failed' }, 500);
  }
}
