import { createHash } from 'node:crypto';

/*
 * P7: server-side udalosti do PostHogu (webhook: objednávka, obnovenie, zrušenie; odstúpenie z P4).
 * Bez SDK: jeden POST na capture endpoint (NEXT_PUBLIC_POSTHOG_HOST /i/v0/e/), časový limit 3 s, chyba sa iba zaloguje.
 *
 * Súhlas (SPEC §10 P7.3): so súhlasom s analytickými cookies (Stripe metadata ph = 1) ide udalosť na osobu
 * distinct_id = customer_id (tú istú, ktorú prehliadač identifikoval v checkoute). Bez súhlasu ide anonymne:
 * náhodné distinct_id a $process_person_profile = false (počty a tržby sedia, nič sa neprepája s osobou).
 * uuid je odvodené z kľúča udalosti (napr. id objednávky): opakovaný webhook udalosť v PostHogu nezdvojí.
 */

export type ServerEvent = {
  event: string;
  /** customer_id; použije sa iba so súhlasom */
  customerId?: string | null;
  consent: boolean;
  /** stabilný kľúč na deduplikáciu (napr. `order:<id>`) */
  key: string;
  properties?: Record<string, unknown>;
  timestamp?: Date;
};

/** deterministické UUID (formát v4) z textu */
export function uuidFrom(text: string): string {
  const h = createHash('sha256').update(text).digest('hex');
  const v = ((parseInt(h[16], 16) & 0x3) | 0x8).toString(16);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-${v}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

export function buildCapture(e: ServerEvent, apiKey: string) {
  const identified = e.consent && !!e.customerId;
  const uuid = uuidFrom(`${e.key}:${e.event}`);
  return {
    api_key: apiKey,
    event: e.event,
    uuid,
    distinct_id: identified ? String(e.customerId) : `anon-${uuid}`,
    timestamp: (e.timestamp ?? new Date()).toISOString(),
    properties: {
      ...e.properties,
      source: 'server',
      $lib: 'granula-server',
      ...(identified ? {} : { $process_person_profile: false }),
    },
  };
}

export type Capture = (e: ServerEvent) => Promise<void>;

export function posthogCapture(env: Record<string, string | undefined> = process.env, fetchImpl: typeof fetch = fetch): Capture {
  const key = env.NEXT_PUBLIC_POSTHOG_KEY;
  const host = (env.NEXT_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com').replace(/\/+$/, '');
  return async (e) => {
    if (!key) return;
    try {
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
 * predplatného); bez neho anonymne. Nikdy nehodí chybu.
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
