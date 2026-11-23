import { unstable_rethrow } from 'next/navigation';
import { requireAdmin, type Admin } from './session';

/*
 * Serverové akcie admina: vždy najprv requireAdmin() (token, rola, 2FA), potom akcia. Výsledok pre formulár
 * (useActionState): { ok, msg }. Očakávané chyby (UserError) idú používateľovi priamo; neočakávané tiež
 * (ops potrebuje vidieť, čo zlyhalo), ale zalogujú sa.
 */
export type ActionResult = { ok: boolean; msg: string; at: number; data?: unknown } | null;

export class UserError extends Error {
  name = 'UserError';
}

export function adminAction(fn: (admin: Admin, fd: FormData) => Promise<string | { msg: string; data?: unknown }>) {
  return async (_prev: ActionResult, fd: FormData): Promise<ActionResult> => {
    const admin = await requireAdmin();
    try {
      const r = await fn(admin, fd);
      return typeof r === 'string' ? { ok: true, msg: r, at: Date.now() } : { ok: true, msg: r.msg, data: r.data, at: Date.now() };
    } catch (e) {
      unstable_rethrow(e); // redirect / notFound z Next.js
      if (!(e instanceof UserError)) console.error('[admin action]', e);
      return { ok: false, msg: (e as Error).message || String(e), at: Date.now() };
    }
  };
}

export const str = (fd: FormData, k: string) => String(fd.get(k) ?? '').trim();
