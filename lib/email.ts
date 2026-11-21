/*
 * Transakčné emaily cez Resend HTTP API (vzor reference/fanpagekit/lib/email.ts, SPEC P5).
 *
 * Idempotencia: každý email má kľúč (napr. `order-confirm:<order_id>`). Pred odoslaním sa pozrie do email_log;
 * Resend navyše dostane Idempotency-Key (platí 24 h). Webhook retry, cron ani FHB notifikácia teda nikdy
 * nepošlú ten istý email dvakrát.
 *
 * Odchýlka od FanpageKit: bez RESEND_API_KEY / EMAIL_FROM sa email iba zaloguje (status `skipped`), NIKDY nehodí
 * chybu ani v produkcii. Produkcia (granula.sk) beží zatiaľ v test mode a email nesmie zablokovať webhook.
 */
import type { TablesInsert } from './database.types';

export type Mail = {
  key: string;
  kind: string;
  to: string;
  subject: string;
  html: string;
  text: string;
  orderId?: string | null;
};

export type MailResult = 'sent' | 'duplicate' | 'skipped';
export type Mailer = (mail: Mail) => Promise<MailResult>;

export type EmailLog = {
  has(key: string): Promise<boolean>;
  insert(row: TablesInsert<'email_log'>): Promise<void>;
};

type Env = Record<string, string | undefined>;

export function createMailer(log: EmailLog, env: Env = process.env, fetchFn: typeof fetch = fetch): Mailer {
  return async (mail) => {
    if (await log.has(mail.key)) return 'duplicate';
    const key = env.RESEND_API_KEY;
    const from = env.EMAIL_FROM;
    if (!key || !from) {
      console.warn(`[email] RESEND_API_KEY / EMAIL_FROM nie sú nastavené, neodoslané: ${mail.kind} → ${mail.to} (${mail.subject})`);
      await log.insert({ key: mail.key, kind: mail.kind, to_email: mail.to, order_id: mail.orderId ?? null, status: 'skipped' });
      return 'skipped';
    }
    const res = await fetchFn('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'Idempotency-Key': mail.key },
      body: JSON.stringify({
        from,
        to: mail.to,
        subject: mail.subject,
        html: mail.html,
        text: mail.text,
        ...(env.EMAIL_REPLY_TO ? { reply_to: env.EMAIL_REPLY_TO } : {}),
      }),
    });
    // 409: kľúč už bol použitý (alebo rovnaké odoslanie práve beží) → neposiela sa druhýkrát
    if (res.status === 409) {
      await log.insert({ key: mail.key, kind: mail.kind, to_email: mail.to, order_id: mail.orderId ?? null, status: 'sent' }).catch(() => {});
      return 'duplicate';
    }
    if (!res.ok) throw new Error(`Resend ${res.status}: ${(await res.text()).slice(0, 500)}`);
    const body = (await res.json().catch(() => ({}))) as { id?: string };
    await log.insert({ key: mail.key, kind: mail.kind, to_email: mail.to, order_id: mail.orderId ?? null, status: 'sent', provider_id: body.id ?? null });
    console.info(`[email] odoslané ${mail.kind} → ${mail.to}`);
    return 'sent';
  };
}

/** email_log nad Supabase (service role) */
export async function supabaseEmailLog(): Promise<EmailLog> {
  const { db } = await import('./db');
  return {
    async has(key) {
      const { data, error } = await db().from('email_log').select('key').eq('key', key).maybeSingle();
      if (error) throw new Error(error.message);
      return !!data;
    },
    async insert(row) {
      const { error } = await db().from('email_log').insert(row);
      if (error && error.code !== '23505') throw new Error(error.message);
    },
  };
}

let cached: Mailer | null = null;
/** Mailer pre route handlery (Supabase email_log + Resend z env) */
export async function defaultMailer(): Promise<Mailer> {
  cached ??= createMailer(await supabaseEmailLog());
  return cached;
}
