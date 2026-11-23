import { createServerClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import type { Database, Tables } from '../database.types';
import { db } from '../db';

/*
 * Session zákazníka v /ucet (SPEC P4). Supabase Auth s cookie (httpOnly: v prehliadači nie je žiadny Supabase klient,
 * cookie číta iba server). Čítanie dát klientom s JWT používateľa → platia RLS policies (iba vlastné riadky,
 * migrácia p4_ucet). Zápisy robí server service rolou po kontrole vlastníctva (lib/ucet/actions.ts).
 */

export class UcetAuthError extends Error {}

export async function userClient(): Promise<SupabaseClient<Database>> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) throw new Error('[ucet] NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY nie sú nastavené');
  const store = await cookies();
  const secure = (process.env.NEXT_PUBLIC_SITE_URL ?? '').startsWith('https://');
  return createServerClient<Database>(url, anon, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        for (const c of list) store.set(c.name, c.value, { ...c.options, httpOnly: true, secure, sameSite: 'lax', path: '/' });
      },
    },
  });
}

export type Session = { sb: SupabaseClient<Database>; userId: string; email: string; customer: Tables<'customers'> };

/** Prihlásený zákazník alebo UcetAuthError (→ 401). Zákazník sa číta cez RLS (vlastný riadok). */
export async function requireCustomer(): Promise<Session> {
  const sb = await userClient();
  const { data, error } = await sb.auth.getUser();
  if (error || !data.user?.email) throw new UcetAuthError('neprihlásený');
  const { data: customer } = await sb.from('customers').select('*').eq('auth_user_id', data.user.id).maybeSingle();
  if (!customer) throw new UcetAuthError('účet nie je prepojený so zákazníkom');
  return { sb, userId: data.user.id, email: data.user.email, customer };
}

/** Po overení kódu: prepojiť zákazníka (podľa overeného e-mailu) s auth používateľom. Service role. */
export async function linkCustomer(userId: string, email: string): Promise<Tables<'customers'> | null> {
  const { data: c, error } = await db().from('customers').select('*').ilike('email', email.replace(/[\\%_]/g, (x) => `\\${x}`)).maybeSingle();
  if (error) throw new Error(error.message);
  if (!c) return null;
  if (c.auth_user_id !== userId) {
    const { error: e2 } = await db().from('customers').update({ auth_user_id: userId }).eq('id', c.id);
    if (e2) throw new Error(e2.message);
  }
  return { ...c, auth_user_id: userId };
}

/** Ochrana proti CSRF pri POST: Origin musí byť náš (cookie je sameSite=lax, toto je druhá poistka). */
export function sameOrigin(req: Request): boolean {
  const origin = req.headers.get('origin');
  if (!origin) return true; // niektoré prehliadače pri same-origin fetch neposielajú; sameSite=lax chráni
  try {
    return new URL(origin).host === new URL(req.url).host || new URL(origin).host === req.headers.get('x-forwarded-host') || new URL(origin).host === req.headers.get('host');
  } catch {
    return false;
  }
}

export const ipOf = (req: Request) => (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || req.headers.get('x-real-ip') || null;
