'use server';

import { redirect } from 'next/navigation';
import type { ActionResult } from '@admin/lib/action';
import { audit } from '@admin/lib/audit';
import { AuthError, gotrue } from '@admin/lib/gotrue';
import { accessToken, clearSession, isAdminUser, sessionState, setSession } from '@admin/lib/session';

const res = (ok: boolean, msg: string, data?: unknown): ActionResult => ({ ok, msg, data, at: Date.now() });

/** 1. krok: e-mail a heslo. Účet bez roly admin sa neprihlási. */
export async function loginAction(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const email = String(fd.get('email') ?? '').trim().toLowerCase();
  const password = String(fd.get('password') ?? '');
  if (!email || !password) return res(false, 'Zadaj e-mail a heslo.');
  let s;
  try {
    s = await gotrue.signInWithPassword(email, password);
  } catch (e) {
    if (e instanceof AuthError && (e.status === 400 || e.status === 401)) return res(false, 'Nesprávny e-mail alebo heslo.');
    if (e instanceof AuthError && e.status === 429) return res(false, 'Príliš veľa pokusov. Skús to o chvíľu.');
    console.error('[login]', e);
    return res(false, 'Prihlásenie teraz nefunguje. Skús to o chvíľu.');
  }
  if (!isAdminUser(s.user)) {
    await gotrue.logout(s.access_token);
    await audit(email, 'admin.login_denied', 'auth_user', s.user?.id ?? null, null, { reason: 'not_admin' });
    return res(false, 'Tento účet nemá prístup do manažéra.');
  }
  await setSession(s);
  redirect('/login/2fa');
}

/** 2FA: nový TOTP faktor (QR kód pre aplikáciu Google Authenticator, 1Password…). Nepotvrdené staré faktory sa zmažú. */
export async function enrollAction(_prev: ActionResult): Promise<ActionResult> {
  const st = await sessionState();
  if (st.state !== 'mfa') redirect('/login');
  if ((st.user.factors ?? []).some((f) => f.status === 'verified')) return res(false, 'Overenie už je nastavené, zadaj kód.');
  for (const f of st.user.factors ?? []) if (f.status === 'unverified') await gotrue.unenroll(st.token, f.id).catch(() => null);
  const f = await gotrue.enrollTotp(st.token, `manazer-${Date.now()}`);
  return res(true, '', { factorId: f.id, qr: f.totp.qr_code, secret: f.totp.secret });
}

/** 2FA: overenie 6-miestneho kódu → session s aal2. */
export async function verifyAction(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const st = await sessionState();
  if (st.state !== 'mfa') redirect(st.state === 'admin' ? '/' : '/login');
  const factorId = String(fd.get('factorId') ?? '');
  const code = String(fd.get('code') ?? '').replace(/\s/g, '');
  if (!/^\d{6}$/.test(code)) return res(false, 'Kód má 6 číslic.', { factorId });
  try {
    const ch = await gotrue.challenge(st.token, factorId);
    const s = await gotrue.verify(st.token, factorId, ch.id, code);
    await setSession(s);
  } catch (e) {
    if (e instanceof AuthError && e.status < 500) return res(false, 'Nesprávny kód. Skontroluj čas v telefóne a skús znova.', { factorId });
    console.error('[2fa]', e);
    return res(false, 'Overenie teraz nefunguje. Skús to o chvíľu.', { factorId });
  }
  await audit(st.user.email ?? st.user.id, 'admin.login', 'auth_user', st.user.id);
  redirect('/');
}

export async function logoutAction() {
  const t = await accessToken();
  if (t) await gotrue.logout(t);
  await clearSession();
  redirect('/login');
}
