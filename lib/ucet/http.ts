import { ActionError } from './actions';
import { LoginError } from './login';
import { UcetAuthError } from './session';

export const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' } });

export async function body(req: Request): Promise<Record<string, unknown>> {
  try {
    const b = await req.json();
    return b && typeof b === 'object' ? (b as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** spoločné spracovanie chýb route handlerov /api/ucet */
export function fail(e: unknown) {
  if (e instanceof UcetAuthError) return json({ error: 'Prihlás sa prosím znova.', auth: false }, 401);
  if (e instanceof ActionError || e instanceof LoginError) return json({ error: e.message }, e.status);
  console.error('[ucet]', e);
  return json({ error: 'Niečo sa pokazilo. Skús to prosím znova alebo nám napíš na podpora@granula.sk.' }, 500);
}
