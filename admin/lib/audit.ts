import type { Json } from '@lib/database.types';
import { db } from '@lib/db';

/*
 * Stopa každej akcie admina v audit_log (SPEC P3). actor = e-mail admina. Na rozdiel od supabaseStore.audit
 * (systém, rovnaký záznam iba raz) sa tu zapisuje každá akcia, aj opakovaná.
 */
export async function audit(actor: string, action: string, entity: string, entityId: string | null, before?: unknown, after?: unknown) {
  const { error } = await db()
    .from('audit_log')
    .insert({ actor, action, entity, entity_id: entityId, before: (before ?? null) as Json, after: (after ?? null) as Json });
  if (error) console.error('[admin audit] zápis zlyhal', action, entityId, error.message);
}
