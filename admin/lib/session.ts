import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { cache } from 'react';
import { gotrue, jwtPayload, type AuthSession, type AuthUser } from './gotrue';

/*
 * Prihlásenie do admina (SPEC P3): Supabase Auth, iba používateľ s app_metadata.role = "admin" a 2FA (aal2).
 * Tokeny sú v httpOnly cookies (prehliadač k nim nemá prístup z JS), obnovuje ich admin/proxy.ts.
 * Každá stránka a každá serverová akcia volá requireAdmin(): token overí Supabase (GET /auth/v1/user), rola sa berie
 * z aktuálneho app_metadata používateľa (nie zo starého tokenu), 2FA z tokenu (aal).
 */

export const AT_COOKIE = 'ga_at';
export const RT_COOKIE = 'ga_rt';
/** prihlásenie platí najviac 7 dní bez aktivity (refresh token) */
export const SESSION_DAYS = 7;

export type Admin = { id: string; email: string };

export const isAdminUser = (u: Pick<AuthUser, 'app_metadata'> | null | undefined) => u?.app_metadata?.role === 'admin';

export function cookieOptions(maxAgeSeconds: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: maxAgeSeconds,
  };
}

export async function setSession(s: AuthSession) {
  const jar = await cookies();
  jar.set(AT_COOKIE, s.access_token, cookieOptions(Math.max(60, s.expires_in)));
  jar.set(RT_COOKIE, s.refresh_token, cookieOptions(SESSION_DAYS * 86_400));
}

export async function clearSession() {
  const jar = await cookies();
  jar.delete(AT_COOKIE);
  jar.delete(RT_COOKIE);
}

export async function accessToken(): Promise<string | null> {
  return (await cookies()).get(AT_COOKIE)?.value ?? null;
}

export type SessionState =
  | { state: 'none' }
  | { state: 'forbidden'; email: string }
  | { state: 'mfa'; user: AuthUser; token: string }
  | { state: 'admin'; admin: Admin; token: string };

/** Stav prihlásenia v tejto požiadavke (raz na požiadavku). */
export const sessionState = cache(async (): Promise<SessionState> => {
  const dev = devAdmin();
  if (dev) return { state: 'admin', admin: dev, token: '' };
  const token = await accessToken();
  if (!token) return { state: 'none' };
  let user: AuthUser;
  try {
    user = await gotrue.user(token);
  } catch {
    return { state: 'none' };
  }
  if (!isAdminUser(user)) return { state: 'forbidden', email: user.email ?? '' };
  if (jwtPayload(token).aal !== 'aal2') return { state: 'mfa', user, token };
  return { state: 'admin', admin: { id: user.id, email: user.email ?? user.id }, token };
});

/**
 * Iba lokálny vývoj (`next dev`, NODE_ENV=development) s ADMIN_DEV_USER=<email>: bez prihlásenia, na skúšanie UI
 * proti testovacím dátam. V produkčnom builde (next build/start, Vercel) je NODE_ENV vždy production → nikdy neplatí.
 */
export function devAdmin(env: Record<string, string | undefined> = process.env): Admin | null {
  if (env.NODE_ENV !== 'development' || !env.ADMIN_DEV_USER) return null;
  return { id: 'dev', email: `${env.ADMIN_DEV_USER} (dev)` };
}

/** Pre stránky a serverové akcie: prihlásený admin s 2FA, inak presmerovanie na prihlásenie. */
export async function requireAdmin(): Promise<Admin> {
  const s = await sessionState();
  if (s.state === 'admin') return s.admin;
  if (s.state === 'mfa') redirect('/login/2fa');
  redirect('/login');
}
