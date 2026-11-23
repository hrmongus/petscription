import type { Mailer } from './email';
import { adminEmail } from './emails';

/** Interné upozornenie na ADMIN_EMAIL (chyba FHB, nízky sklad, vrátená zásielka). Bez adresy iba konzola. */
export async function notifyAdmin(mail: Mailer | undefined, to: string | null | undefined, m: { key: string; kind: string; subject: string; lines: string[] }) {
  console.warn(`[admin] ${m.subject}: ${m.lines.join(' | ')}`);
  if (!mail || !to) return;
  await mail(adminEmail({ ...m, to })).catch((e) => console.error('[admin] email zlyhal', m.key, e));
}

export async function notifyFhbError(deps: { mail?: Mailer; adminTo?: string | null }, o: { id: string; number: number }, error: unknown) {
  await notifyAdmin(deps.mail, deps.adminTo, {
    key: `admin-fhb-error:${o.id}`,
    kind: 'admin_fhb_error',
    subject: `Chyba FHB pri objednávke ${o.number}`,
    lines: [`Objednávka ${o.number} (${o.id}) sa nedostala do FHB a čaká na riešenie.`, `Chyba: ${JSON.stringify(error).slice(0, 1500)}`],
  });
}
