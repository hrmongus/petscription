import engine from '../public/granula/engine.js';
import { supabaseOnce, type Once } from './analytics';

/*
 * P7: pripomienka nedokončenej objednávky cez Klaviyo zo servera (SPEC §10 P7.16).
 *   „Started Checkout“ — POST /api/checkout, iba so zaškrtnutým políčkom pripomenutia (reminder_consent), nezávisle
 *                        od cookies. Jedna udalosť na dotazník (prvý checkout so súhlasom).
 *   „Placed Order“     — webhook (nová objednávka), iba ak dotazník tejto objednávky mal súhlas s pripomenutím:
 *                        flow opusteného košíka vďaka nej skončí.
 * Bez KLAVIYO_PRIVATE_KEY sa nič neposiela (ticho). Chyba Klaviyo nič nezastaví, iba sa zaloguje.
 * Duplicity: kľúč v analytics_sent (najviac raz z našej strany) + unique_id v Klaviyo rovnaké ako v prehliadači
 * (`checkout-<id dotazníka>`, `order-<číslo>`), takže ani súbeh s prehliadačom nevytvorí dve udalosti.
 * Kľúč (Settings → API Keys → Private, Events: Write, Profiles: Write) iba v env, nikdy NEXT_PUBLIC_.
 */

export const KLAVIYO_REVISION = '2024-10-15';
const API = 'https://a.klaviyo.com/api/events';

export type KlaviyoEvent = {
  metric: 'Started Checkout' | 'Placed Order';
  email: string;
  firstName?: string | null;
  uniqueId: string;
  value?: number | null;
  properties: Record<string, unknown>;
  time?: Date;
};

export function klaviyoConfigured(env: Record<string, string | undefined> = process.env) {
  return !!env.KLAVIYO_PRIVATE_KEY;
}

export function buildKlaviyoEvent(e: KlaviyoEvent) {
  return {
    data: {
      type: 'event',
      attributes: {
        properties: e.properties,
        time: (e.time ?? new Date()).toISOString(),
        ...(e.value != null ? { value: e.value, value_currency: 'EUR' } : {}),
        unique_id: e.uniqueId,
        metric: { data: { type: 'metric', attributes: { name: e.metric } } },
        profile: { data: { type: 'profile', attributes: { email: e.email, ...(e.firstName ? { first_name: e.firstName } : {}) } } },
      },
    },
  };
}

export type KlaviyoSend = (e: KlaviyoEvent) => Promise<boolean>;

/** Vráti true, ak Klaviyo udalosť prijal (202). Bez kľúča false. Nikdy nehodí chybu. */
export function klaviyoSender(env: Record<string, string | undefined> = process.env, fetchImpl: typeof fetch = fetch, once: Once = supabaseOnce): KlaviyoSend {
  const key = env.KLAVIYO_PRIVATE_KEY;
  return async (e) => {
    if (!key) return false;
    try {
      if (!(await once(`klaviyo:${e.uniqueId}`, e.metric))) return true; // už odoslané
      const r = await fetchImpl(API, {
        method: 'POST',
        headers: { Authorization: `Klaviyo-API-Key ${key}`, revision: KLAVIYO_REVISION, 'Content-Type': 'application/vnd.api+json', Accept: 'application/vnd.api+json' },
        body: JSON.stringify(buildKlaviyoEvent(e)),
        signal: AbortSignal.timeout(3000),
      });
      if (!r.ok) console.error('[klaviyo]', r.status, e.metric, (await r.text().catch(() => '')).slice(0, 300));
      return r.ok;
    } catch (err) {
      console.error('[klaviyo] nedostupné', e.metric, (err as Error).message);
      return false;
    }
  };
}

const BAG_LABEL: Record<string, string> = { '4': '4 kg', '9': '9 kg', '18': '18 kg (2 × 9 kg)' };

/** Rovnaký obsah ako prehliadač (kviz.js klaviyoCheckout): pes, recept, balenie, cena, obrázok, odkaz späť na výsledok. */
export function startedCheckoutEvent(c: {
  quizSessionId: string; email: string; firstName: string; dogName: string; productId: string; bagId: string; plan: string;
  unitCents: number; gramsPerDay: number; daysPerBag: number; carrier: string | null; siteUrl: string;
}): KlaviyoEvent {
  const p = engine.PRODUCTS.find((x) => x.id === c.productId);
  const site = c.siteUrl.replace(/\/+$/, '');
  const back = `${site}/granule-na-mieru?kviz=${c.quizSessionId}#vysledok`;
  const price = c.unitCents / 100;
  const name = `${p?.name ?? c.productId} ${BAG_LABEL[c.bagId] ?? `${c.bagId} kg`}`;
  const item = {
    ProductID: c.productId, SKU: `GRAN-${c.productId}-${c.bagId}`, ProductName: name, Quantity: 1, ItemPrice: price, RowTotal: price,
    ProductURL: back, ImageURL: p?.img ? `${site}/${p.img}` : null, Categories: ['Granule na mieru'],
  };
  return {
    metric: 'Started Checkout',
    email: c.email,
    firstName: c.firstName,
    uniqueId: `checkout-${c.quizSessionId}`,
    value: price,
    properties: {
      $event_id: `checkout-${c.quizSessionId}`, $value: price, ItemNames: [name], CheckoutURL: back, Items: [item],
      DogName: c.dogName, Recipe: p?.name ?? c.productId, RecipeId: c.productId, BagKg: c.bagId,
      Plan: c.plan === 'mesiac' ? 'predplatné' : 'jednorazovo', GramsPerDay: c.gramsPerDay, DaysPerBag: c.daysPerBag,
      Carrier: c.carrier, ReminderConsent: true, Source: 'server',
    },
  };
}

export function placedOrderEvent(o: { number: number; email: string; firstName?: string | null; amountCents: number; productId: string | null; bagId: string | null }): KlaviyoEvent {
  const value = o.amountCents / 100;
  return {
    metric: 'Placed Order',
    email: o.email,
    firstName: o.firstName,
    uniqueId: `order-${o.number}`,
    value,
    properties: { $event_id: `order-${o.number}`, $value: value, OrderId: String(o.number), RecipeId: o.productId, BagKg: o.bagId, Source: 'server' },
  };
}
