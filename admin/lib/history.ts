import { db } from '@lib/db';

export type HistoryItem = { at: string; who: string; what: string; detail?: unknown };

/** História objednávky alebo predplatného: audit_log (admin aj systém), FHB eventy, odoslané emaily. */
export async function historyOf(entity: 'order' | 'subscription', id: string): Promise<HistoryItem[]> {
  const audits = db().from('audit_log').select('at, actor, action, before, after').eq('entity', entity).eq('entity_id', id).order('at', { ascending: false }).limit(100);
  const fhbEv = entity === 'order' ? db().from('fhb_events').select('received_at, type, payload').eq('order_id', id).order('received_at', { ascending: false }).limit(50) : null;
  const emails = entity === 'order' ? db().from('email_log').select('sent_at, kind, to_email, status').eq('order_id', id).order('sent_at', { ascending: false }).limit(50) : null;
  const [a, f, e] = await Promise.all([audits, fhbEv, emails]);
  const out: HistoryItem[] = [];
  for (const r of a.data ?? []) out.push({ at: r.at, who: r.actor, what: r.action, detail: r.before || r.after ? { before: r.before, after: r.after } : undefined });
  for (const r of f?.data ?? []) out.push({ at: r.received_at, who: 'FHB', what: r.type, detail: r.payload ?? undefined });
  for (const r of e?.data ?? []) out.push({ at: r.sent_at, who: 'email', what: `${r.kind} → ${r.to_email} (${r.status})` });
  return out.sort((x, y) => y.at.localeCompare(x.at));
}
