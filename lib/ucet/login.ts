import { z } from 'zod';
import type { Mailer } from '../email';
import { loginCodeEmail } from '../emails';

/*
 * Prihlásenie do /ucet bez hesla: jednorazový kód e-mailom (Supabase email OTP, SPEC §10.25).
 *   1. POST /api/ucet/kod { email }: kód sa pošle IBA existujúcemu zákazníkovi; odpoveď je vždy rovnaká
 *      (nedá sa zistiť, kto je zákazník). Kód vygeneruje Supabase (auth.admin.generateLink → email_otp),
 *      e-mail pošleme my cez Resend v dizajne Granuly (šablóna 8), nie SMTP Supabase.
 *   2. POST /api/ucet/prihlasit { email, code }: supabase.auth.verifyOtp({ type: 'email' }) → session v cookie →
 *      prepojenie customers.auth_user_id.
 * Limity (ucet_login_attempts): najviac 5 kódov na e-mail za hodinu, 5 zlých pokusov za 15 min (potom nový kód).
 * Nový kód ruší predošlý (Supabase drží jeden platný token na používateľa).
 */

export const CODE_VALID_MINUTES = 10;
export const MAX_CODES_PER_HOUR = 5;
export const MAX_FAILED_PER_15MIN = 5;

export const EmailSchema = z.object({ email: z.string().trim().toLowerCase().max(254).email() });
export const VerifySchema = z.object({ email: z.string().trim().toLowerCase().max(254).email(), code: z.string().trim().regex(/^\d{6,10}$/) });

export type AttemptKind = 'code_sent' | 'code_ignored' | 'verify_failed' | 'verify_ok';

export type LoginDeps = {
  findCustomer(email: string): Promise<{ id: string; email: string; name: string | null } | null>;
  countAttempts(email: string, kind: AttemptKind, since: Date): Promise<number>;
  logAttempt(email: string, kind: AttemptKind, ip: string | null): Promise<void>;
  /** vytvorí auth používateľa (ak ešte nie je) a vráti nový jednorazový kód */
  issueCode(email: string): Promise<string>;
  /** overí kód a nastaví session (cookie); null = zlý alebo expirovaný kód */
  verify(email: string, code: string): Promise<{ userId: string } | null>;
  link(userId: string, email: string): Promise<{ id: string } | null>;
  signOut(): Promise<void>;
  mail: Mailer;
  siteUrl: string;
  now?: () => Date;
};

export class LoginError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

export async function requestCode(email: string, ip: string | null, deps: LoginDeps): Promise<void> {
  const now = deps.now?.() ?? new Date();
  const customer = await deps.findCustomer(email);
  if (!customer) return void (await deps.logAttempt(email, 'code_ignored', ip));
  if ((await deps.countAttempts(email, 'code_sent', new Date(now.getTime() - 3600_000))) >= MAX_CODES_PER_HOUR) return void (await deps.logAttempt(email, 'code_ignored', ip));
  const code = await deps.issueCode(email);
  await deps.mail(loginCodeEmail({ to: customer.email, name: customer.name, code, validMinutes: CODE_VALID_MINUTES, siteUrl: deps.siteUrl, key: `login-code:${customer.id}:${now.getTime()}` }));
  await deps.logAttempt(email, 'code_sent', ip);
}

export async function verifyCode(email: string, code: string, ip: string | null, deps: LoginDeps): Promise<{ customerId: string }> {
  const now = deps.now?.() ?? new Date();
  if ((await deps.countAttempts(email, 'verify_failed', new Date(now.getTime() - 15 * 60_000))) >= MAX_FAILED_PER_15MIN)
    throw new LoginError('Príliš veľa nesprávnych pokusov. Pošli si nový kód o pár minút.', 429);
  const ok = await deps.verify(email, code);
  if (!ok) {
    await deps.logAttempt(email, 'verify_failed', ip);
    throw new LoginError('Kód nesedí alebo už neplatí. Skontroluj ho, alebo si pošli nový.');
  }
  const customer = await deps.link(ok.userId, email);
  if (!customer) {
    await deps.signOut();
    await deps.logAttempt(email, 'verify_failed', ip);
    throw new LoginError('Kód nesedí alebo už neplatí. Skontroluj ho, alebo si pošli nový.');
  }
  await deps.logAttempt(email, 'verify_ok', ip);
  return { customerId: customer.id };
}

/** závislosti nad Supabase (route handlery) */
export async function loginDepsFromEnv(): Promise<LoginDeps> {
  const { db } = await import('../db');
  const { defaultMailer } = await import('../email');
  const { userClient, linkCustomer } = await import('./session');
  const sb = await userClient();
  const like = (e: string) => e.replace(/[\\%_]/g, (x) => `\\${x}`);
  return {
    async findCustomer(email) {
      const { data, error } = await db().from('customers').select('id, email, name').ilike('email', like(email)).maybeSingle();
      if (error) throw new Error(error.message);
      return data;
    },
    async countAttempts(email, kind, since) {
      const { count, error } = await db().from('ucet_login_attempts').select('id', { count: 'exact', head: true }).ilike('email', like(email)).eq('kind', kind).gte('at', since.toISOString());
      if (error) throw new Error(error.message);
      return count ?? 0;
    },
    async logAttempt(email, kind, ip) {
      const { error } = await db().from('ucet_login_attempts').insert({ email, kind, ip });
      if (error) console.error('[ucet] log pokusu zlyhal', error.message);
    },
    async issueCode(email) {
      const created = await db().auth.admin.createUser({ email, email_confirm: true });
      if (created.error && !/already|registered|exists/i.test(created.error.message)) throw new Error(created.error.message);
      const g = await db().auth.admin.generateLink({ type: 'magiclink', email });
      const otp = g.data?.properties?.email_otp;
      if (g.error || !otp) throw new Error(g.error?.message ?? 'Supabase nevrátil kód');
      return otp;
    },
    async verify(email, code) {
      const { data, error } = await sb.auth.verifyOtp({ email, token: code, type: 'email' });
      return error || !data.user ? null : { userId: data.user.id };
    },
    link: linkCustomer,
    signOut: async () => void (await sb.auth.signOut()),
    mail: await defaultMailer(),
    siteUrl: process.env.NEXT_PUBLIC_SITE_URL || 'https://www.granula.sk',
  };
}
