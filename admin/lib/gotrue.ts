/*
 * Supabase Auth (GoTrue) cez REST: prihlásenie heslom, obnovenie tokenu, 2FA (TOTP) a odhlásenie.
 * REST namiesto supabase-js, lebo admin drží tokeny v httpOnly cookies na serveri (žiadna session v prehliadači)
 * a supabase-js MFA metódy potrebujú uloženú session v klientovi. Používa sa iba anon kľúč + token používateľa.
 */

export type AuthSession = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  expires_at?: number;
  user?: AuthUser;
};

export type AuthFactor = { id: string; factor_type: string; status: 'verified' | 'unverified'; friendly_name?: string | null };

export type AuthUser = {
  id: string;
  email?: string;
  app_metadata?: { role?: string; [k: string]: unknown };
  factors?: AuthFactor[] | null;
};

export class AuthError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code?: string,
  ) {
    super(message);
    this.name = 'AuthError';
  }
}

type Env = Record<string, string | undefined>;

function config(env: Env = process.env) {
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) throw new Error('[auth] NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY nie sú nastavené');
  return { url: url.replace(/\/$/, ''), anon };
}

async function call<T>(path: string, init: { method?: string; token?: string; body?: unknown } = {}, fetchFn: typeof fetch = fetch): Promise<T> {
  const { url, anon } = config();
  const res = await fetchFn(`${url}/auth/v1${path}`, {
    method: init.method ?? (init.body ? 'POST' : 'GET'),
    headers: {
      apikey: anon,
      'content-type': 'application/json',
      ...(init.token ? { authorization: `Bearer ${init.token}` } : {}),
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
    cache: 'no-store',
  });
  const text = await res.text();
  const json = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  if (!res.ok) {
    const msg = String(json.msg ?? json.message ?? json.error_description ?? json.error ?? res.statusText);
    throw new AuthError(res.status, msg, (json.error_code ?? json.code) as string | undefined);
  }
  return json as T;
}

export const gotrue = {
  signInWithPassword: (email: string, password: string) => call<AuthSession>('/token?grant_type=password', { body: { email, password } }),
  refresh: (refresh_token: string) => call<AuthSession>('/token?grant_type=refresh_token', { body: { refresh_token } }),
  /** aktuálny používateľ (overí token na serveri Supabase) vrátane faktorov 2FA */
  user: (token: string) => call<AuthUser>('/user', { token }),
  logout: (token: string) => call<unknown>('/logout?scope=local', { method: 'POST', token }).catch(() => null),
  enrollTotp: (token: string, friendlyName: string) =>
    call<{ id: string; totp: { qr_code: string; secret: string; uri: string } }>('/factors', { token, body: { factor_type: 'totp', friendly_name: friendlyName, issuer: 'Granula manažér' } }),
  unenroll: (token: string, factorId: string) => call<unknown>(`/factors/${factorId}`, { method: 'DELETE', token }),
  challenge: (token: string, factorId: string) => call<{ id: string }>(`/factors/${factorId}/challenge`, { token, body: {} }),
  verify: (token: string, factorId: string, challengeId: string, code: string) =>
    call<AuthSession>(`/factors/${factorId}/verify`, { token, body: { challenge_id: challengeId, code } }),
};

/** Payload JWT bez overenia podpisu (podpis overuje Supabase v gotrue.user / auth.getUser). */
export function jwtPayload(token: string): { exp?: number; aal?: string; sub?: string; email?: string; app_metadata?: { role?: string } } {
  try {
    const part = token.split('.')[1];
    return JSON.parse(Buffer.from(part.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
  } catch {
    return {};
  }
}
