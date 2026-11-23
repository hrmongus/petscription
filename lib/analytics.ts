import { createHash, randomUUID } from 'node:crypto';

/*
 * P7: server-side udalosti do PostHogu (webhook: objednávka, obnovenie, zrušenie; odstúpenie z P4).
 * Bez SDK: jeden POST na capture endpoint (NEXT_PUBLIC_POSTHOG_HOST /i/v0/e/), časový limit 3 s, chyba sa iba zaloguje.
 *
 * Súhlas (SPEC §10 P7.3, P7.15):
 *   - so súhlasom s analytickými cookies (Stripe metadata ph = 1): distinct_id = customer_id (tá istá osoba, ktorú
 *     prehliadač identifikoval v checkoute), uuid odvodené z kľúča udalosti, všetky vlastnosti,
 *   - bez súhlasu: ŽIADNY identifikátor ani nič z neho odvodené (ani hash). distinct_id aj uuid sú náhodné
 *     (crypto.randomUUID()), $process_person_profile = false a iba neosobné vlastnosti z ANON_PROPERTIES.
 * Ochrana pred duplicitou je na našej strane: pred odoslaním sa kľúč zapíše do analytics_sent (insert, PK); ak už je
 * zapísaný, udalosť sa neposiela. Najviac raz — zlyhané odoslanie sa neopakuje.
 */

export type ServerEvent = {
  event: string;
  /** customer_id; použije sa iba so súhlasom */
  customerId?: string | null;
  consent: boolean;
  /** stabilný kľúč na deduplikáciu v našej DB (napr. `order:<id>`); do PostHogu bez súhlasu nikdy neodíde */
  key: string;
  properties?: Record<string, unknown>;
  timestamp?: Date;
};

/** Neosobné vlastnosti, ktoré smú odísť bez súhlasu: suma, typ nákupu, receptúra, balenie, doprava, nový/vracajúci sa. */
export const ANON_PROPERTIES = [
  'revenue', 'shipping', 'amount', 'currency', // suma
  'order_kind', 'plan', // typ nákupu
  'recipe', 'bag', // receptúra, veľkosť balenia
  'carrier', 'delivery_method', // doprava
  'customer_type', 'is_first_order', // nový / vracajúci sa
] as const;

/** deterministické UUID (formát v4) z textu — iba pre udalosti so súhlasom */
export function uuidFrom(text: string): string {
  const h = createHash('sha256').update(text).digest('hex');
  const v = ((parseInt(h[16], 16) & 0x3) | 0x8).toString(16);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-${v}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

export function buildCapture(e: ServerEvent, apiKey: string, random: () => string = randomUUID) {
  const timestamp = (e.timestamp ?? new Date()).toISOString();
  if (e.consent && e.customerId) {
    return {
      api_key: apiKey,
      event: e.event,
      uuid: uuidFrom(`${e.key}:${e.event}`),
      distinct_id: String(e.customerId),
      timestamp,
      properties: { ...e.properties, source: 'server', $lib: 'granula-server' },
    };
  }
  const props: Record<string, unknown> = {};
  for (const k of ANON_PROPERTIES) if (e.properties && e.properties[k] !== undefined) props[k] = e.properties[k];
  return {
    api_key: apiKey,
    event: e.event,
    uuid: random(),
    distinct_id: random(),
    timestamp,
    properties: { ...props, source: 'server', $lib: 'granula-server', $process_person_profile: false },
  };
}

export type Capture = (e: ServerEvent) => Promise<void>;
/** true = kľúč sa práve zapísal (poslať), false = už bol zapísaný (neposielať) */
export type Once = (key: string, event: string) => Promise<boolean>;

/** analytics_sent v Supabase: insert s PK; konflikt = už odoslané */
export const supabaseOnce: Once = async (key, event) => {
  const { db } = await import('./db');
  const { error } = await db().from('analytics_sent').insert({ key: `${key}:${event}`, event });
  if (error?.code === '23505') return false;
  if (error) throw new Error(error.message);
  return true;
};

export function posthogCapture(env: Record<string, string | undefined> = process.env, fetchImpl: typeof fetch = fetch, once: Once = supabaseOnce): Capture {
  const key = env.NEXT_PUBLIC_POSTHOG_KEY;
  const host = (env.NEXT_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com').replace(/\/+$/, '');
  return async (e) => {
    if (!key) return;
    try {
      if (!(await once(e.key, e.event))) return;
      const r = await fetchImpl(`${host}/i/v0/e/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildCapture(e, key)),
        signal: AbortSignal.timeout(3000),
      });
      if (!r.ok) console.error('[analytics] PostHog', r.status, e.event);
    } catch (err) {
      console.error('[analytics] PostHog nedostupný', e.event, (err as Error).message);
    }
  };
}

/**
 * P4 (`/odstupenie`, `/ucet`): po zázname v `withdrawals` zavolať
 *   await trackWithdrawal({ withdrawalId, customerId, orderId, subscriptionId, consent })
 * consent = súhlas s analytickými cookies (GranulaConsent.has('analytics') v prehliadači, alebo `ph` z metadata
 * predplatného); bez neho anonymne bez akéhokoľvek id. Nikdy nehodí chybu, odíde najviac raz na odstúpenie.
 */
export async function trackWithdrawal(
  w: { withdrawalId: string; customerId?: string | null; orderId?: string | null; subscriptionId?: string | null; consent?: boolean; reason?: string | null },
  capture: Capture = posthogCapture(),
) {
  await capture({
    event: 'withdrawal_submitted',
    key: `withdrawal:${w.withdrawalId}`,
    customerId: w.customerId,
    consent: !!w.consent,
    properties: { order_id: w.orderId ?? null, subscription_id: w.subscriptionId ?? null, has_reason: !!w.reason },
  });
}
