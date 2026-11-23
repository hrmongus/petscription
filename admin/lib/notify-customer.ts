import type { Json } from '@lib/database.types';
import { db } from '@lib/db';
import { defaultMailer, type Mail } from '@lib/email';
import { audit } from './audit';

/*
 * E-mail zákazníkovi po akcii admina (lib/emails-admin.ts). Cez email_log → ten istý kľúč odíde iba raz.
 * Chyba e-mailu akciu nezruší (tá už prebehla): vráti text do hlásenia a zapíše audit email.failed.
 */

export type Recipient = { to: string; name: string | null; dog: { name: string; sex: string | null } | null; siteUrl: string };

export async function recipientOf(o: { customerId: string; subscriptionId?: string | null }): Promise<Recipient | null> {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (!siteUrl) return null;
  const { data: c } = await db().from('customers').select('email, name').eq('id', o.customerId).maybeSingle();
  if (!c) return null;
  let dog: { name: string; answers: Json } | null = null;
  if (o.subscriptionId) {
    const { data: s } = await db().from('subscriptions').select('dog_id').eq('id', o.subscriptionId).maybeSingle();
    if (s) dog = (await db().from('dogs').select('name, answers').eq('id', s.dog_id).maybeSingle()).data;
  }
  dog ??= (await db().from('dogs').select('name, answers').eq('customer_id', o.customerId).order('created_at', { ascending: false }).limit(1).maybeSingle()).data;
  return { to: c.email, name: c.name, dog: dog ? { name: dog.name, sex: (dog.answers as { sex?: string } | null)?.sex ?? null } : null, siteUrl };
}

/** Pošle e-mail; vráti krátku vetu do hlásenia admina. */
export async function mailCustomer(actor: string, build: (r: Recipient) => Mail, who: { customerId: string; subscriptionId?: string | null }, entity: { type: string; id: string }): Promise<string> {
  try {
    const r = await recipientOf(who);
    if (!r) return ' E-mail zákazníkovi sa neposlal (chýba zákazník alebo NEXT_PUBLIC_SITE_URL).';
    const mail = build(r);
    const res = await (await defaultMailer())(mail);
    return res === 'sent' ? ` Zákazník dostal e-mail (${r.to}).` : res === 'duplicate' ? ' E-mail o tom už zákazník dostal.' : ' E-mail sa iba zapísal (Resend nie je nastavený).';
  } catch (e) {
    const msg = String((e as Error).message ?? e).slice(0, 300);
    await audit(actor, 'email.failed', entity.type, entity.id, null, { error: msg });
    return ` E-mail zákazníkovi zlyhal: ${msg}`;
  }
}
