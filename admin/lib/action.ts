import { cookies } from 'next/headers';
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
    let res: NonNullable<ActionResult>;
    try {
      const r = await fn(admin, fd);
      res = typeof r === 'string' ? { ok: true, msg: r, at: Date.now() } : { ok: true, msg: r.msg, data: r.data, at: Date.now() };
    } catch (e) {
      unstable_rethrow(e); // redirect / notFound z Next.js
      if (!(e instanceof UserError)) console.error('[admin action]', e);
      res = { ok: false, msg: (e as Error).message || String(e), at: Date.now() };
    }
    await flash(res);
    return res;
  };
}

export const str = (fd: FormData, k: string) => String(fd.get(k) ?? '').trim();

export const FLASH_COOKIE = 'ga_flash';

/**
 * Výsledok akcie aj pre hlavičku stránky (components/flash.tsx): formulár po akcii často zmizne (napr. storno),
 * hlásenie musí ostať viditeľné.
 */
async function flash(r: NonNullable<ActionResult>) {
  if (!r.msg) return;
  (await cookies()).set(FLASH_COOKIE, encodeURIComponent(JSON.stringify({ ok: r.ok, msg: r.msg.slice(0, 1500), at: r.at })), { path: '/', maxAge: 60, sameSite: 'lax' });
}
