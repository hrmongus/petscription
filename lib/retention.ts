import type Stripe from 'stripe';

/*
 * P7 retencia (SPEC P7, §10 P7.8): nedokončené nákupy s emailom sa po 90 dňoch zmažú alebo anonymizujú.
 *   1. quiz_sessions bez objednávky, posledná zmena pred > 90 dňami → email, customer_id, dog_id = null,
 *      meno psa z odpovedí preč (ostanú anonymné odpovede na štatistiku; týka sa aj sessions bez emailu).
 *   2. customers bez objednávky a bez predplatného, vytvorený aj naposledy zmenený pred > 90 dňami → zmazať
 *      Stripe zákazníka (iba náš, metadata.app = granula) a riadok customers (psy a adresy kaskádou).
 *      Poistka: ak má Stripe zákazník úspešnú platbu (objednávka by mala existovať, napr. zlyhal webhook),
 *      nemaže sa nič a ostane stopa v audit_log na ručné riešenie.
 * Zákazník s prihlásením do účtu (auth_user_id) sa nemaže automaticky.
 */

export const RETENTION_DAYS = 90;

export type RetentionCandidate = { id: string; stripe_customer_id: string | null; auth_user_id: string | null };

export type RetentionStore = {
  /** anonymizuje sessions (krok 1), vráti počet */
  anonymizeQuizSessions(before: string): Promise<number>;
  /** zákazníci bez objednávky a predplatného, vytvorení aj zmenení pred `before` */
  candidates(before: string, limit: number): Promise<RetentionCandidate[]>;
  /** anonymizuje sessions zákazníka a zmaže ho (psy, adresy kaskádou) */
  deleteCustomer(id: string): Promise<void>;
  audit(action: string, customerId: string, after: Record<string, unknown>): Promise<void>;
};

export type RetentionResult = { cutoff: string; anonymizedSessions: number; deleted: number; skipped: { id: string; reason: string }[]; dryRun: boolean };

export async function runRetention(deps: { store: RetentionStore; stripe: Stripe | null; now?: Date; dryRun?: boolean; limit?: number }): Promise<RetentionResult> {
  const now = deps.now ?? new Date();
  const cutoff = new Date(now.getTime() - RETENTION_DAYS * 86_400_000).toISOString();
  const res: RetentionResult = { cutoff, anonymizedSessions: 0, deleted: 0, skipped: [], dryRun: !!deps.dryRun };
  const list = await deps.store.candidates(cutoff, deps.limit ?? 200);
  if (!deps.dryRun) res.anonymizedSessions = await deps.store.anonymizeQuizSessions(cutoff);

  for (const c of list) {
    if (c.auth_user_id) {
      res.skipped.push({ id: c.id, reason: 'auth_user' });
      continue;
    }
    if (c.stripe_customer_id) {
      if (!deps.stripe) {
        res.skipped.push({ id: c.id, reason: 'stripe_not_configured' });
        continue;
      }
      const sc = await deps.stripe.customers.retrieve(c.stripe_customer_id).catch((e: { statusCode?: number }) => (e?.statusCode === 404 ? null : Promise.reject(e)));
      if (sc && !('deleted' in sc && sc.deleted)) {
        if ((sc as Stripe.Customer).metadata?.app !== 'granula') {
          res.skipped.push({ id: c.id, reason: 'stripe_not_ours' });
          continue;
        }
        const paid = await deps.stripe.charges.list({ customer: c.stripe_customer_id, limit: 10 });
        if (paid.data.some((ch) => ch.status === 'succeeded')) {
          res.skipped.push({ id: c.id, reason: 'stripe_has_payment' });
          if (!deps.dryRun) await deps.store.audit('retention.skipped_paid', c.id, { stripe_customer: c.stripe_customer_id });
          continue;
        }
        if (!deps.dryRun) await deps.stripe.customers.del(c.stripe_customer_id);
      }
    }
    if (!deps.dryRun) {
      await deps.store.deleteCustomer(c.id);
      await deps.store.audit('retention.customer_deleted', c.id, { stripe_customer: c.stripe_customer_id, cutoff });
    }
    res.deleted++;
  }
  return res;
}

/** Supabase úložisko (service role). */
export async function supabaseRetentionStore(): Promise<RetentionStore> {
  const { db } = await import('./db');
  // email, zákazník a pes preč; z odpovedí iba meno psa (ostatné odpovede nie sú osobné údaje)
  const strip = async (rows: { id: string; answers: unknown }[] | null) => {
    for (const r of rows ?? []) {
      const { dogname: _d, ...answers } = (r.answers ?? {}) as Record<string, unknown>;
      const { error } = await db().from('quiz_sessions').update({ email: null, customer_id: null, dog_id: null, answers: answers as never }).eq('id', r.id);
      if (error) throw new Error(error.message);
    }
    return rows?.length ?? 0;
  };
  return {
    async anonymizeQuizSessions(before) {
      // s emailom, alebo anonymné, ktoré ešte nesú meno psa
      const { data, error } = await db().from('quiz_sessions').select('id, answers').is('order_id', null).lt('updated_at', before)
        .or('email.not.is.null,answers->>dogname.not.is.null').limit(1000);
      if (error) throw new Error(error.message);
      return strip(data);
    },
    async candidates(before, limit) {
      const { data, error } = await db()
        .from('customers')
        .select('id, stripe_customer_id, auth_user_id, orders(id), subscriptions(id)')
        .lt('created_at', before)
        .lt('updated_at', before)
        .order('created_at')
        .limit(limit * 5);
      if (error) throw new Error(error.message);
      return (data ?? [])
        .filter((c) => !(c.orders as unknown[]).length && !(c.subscriptions as unknown[]).length)
        .slice(0, limit)
        .map(({ id, stripe_customer_id, auth_user_id }) => ({ id, stripe_customer_id, auth_user_id }));
    },
    async deleteCustomer(id) {
      const { data, error } = await db().from('quiz_sessions').select('id, answers').eq('customer_id', id);
      if (error) throw new Error(error.message);
      await strip(data);
      const { error: e2 } = await db().from('customers').delete().eq('id', id);
      if (e2) throw new Error(e2.message);
    },
    async audit(action, customerId, after) {
      const { error } = await db().from('audit_log').insert({ actor: 'system', action, entity: 'customer', entity_id: customerId, after: after as never });
      if (error) throw new Error(error.message);
    },
  };
}
