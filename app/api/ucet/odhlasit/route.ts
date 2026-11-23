import { json } from '@/lib/ucet/http';
import { sameOrigin, userClient } from '@/lib/ucet/session';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  if (!sameOrigin(req)) return json({ error: 'Neplatná požiadavka.' }, 403);
  await (await userClient()).auth.signOut().catch(() => {});
  return json({ ok: true });
}
