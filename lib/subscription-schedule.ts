import type Stripe from 'stripe';
import { stripe } from './stripe';

/*
 * Cyklus predplatného (SPEC §1) a úpravy Stripe predplatného. Projekty 2 (admin) a 3 (zákaznícky portál) volajú
 * tieto funkcie; nikde inde sa trial_end / interval nenastavuje.
 *
 *   D        = dni, ktoré vrece vydrží (engine) = interval predplatného (interval: day, interval_count: D)
 *   LEAD     = 7  (PARAMS.reorderLeadDays): platba a expedícia o toľko dní skôr, než sa vrece minie
 *   SHIP_DAYS= 3  (PARAMS.shipDays): odhad dní od platby po doručenie, kým FHB nepošle delivered_at
 *
 *   prvé obnovenie       = deň_doručenia + D − LEAD   (deň_doručenia = zaplatené + SHIP_DAYS, neskôr skutočné delivered_at)
 *   ďalšie obnovenia     = každých D dní (Stripe)
 *   zmena D (váha, vek…) = posledné_doručenie + D_nové − LEAD, najskôr zajtra
 *
 * Stripe: posun dátumu platby = trial_end + proration_behavior: "none". Zmena intervalu alebo ceny ide VŽDY
 * v jednom update spolu s trial_end, inak Stripe resetuje billing anchor a stiahne platbu hneď.
 * ⚠️ Overiť na Stripe test clocks pred nasadením (PROGRESS, krok 4).
 */

export const DAY_MS = 86_400_000;

export type CycleParams = { leadDays: number; shipDays: number };

/** začiatok dňa (UTC) + n dní */
export function addDays(d: Date, n: number): Date {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  return new Date(x.getTime() + n * DAY_MS);
}

/** platba prebehne o 06:00 UTC (8:00 / 7:00 SK), aby objednávka do FHB prišla ráno */
export function chargeTime(day: Date): Date {
  return new Date(addDays(day, 0).getTime() + 6 * 3600_000);
}

/** najskôr zajtra (Stripe trial_end musí byť v budúcnosti; dnešok by stiahol platbu hneď) */
function notBeforeTomorrow(d: Date, now: Date): Date {
  const tomorrow = chargeTime(addDays(now, 1));
  return d < tomorrow ? tomorrow : d;
}

/** odhad doručenia prvej zásielky */
export function estimatedDelivery(paidAt: Date, p: CycleParams): Date {
  return addDays(paidAt, p.shipDays);
}

/** prvé obnovenie = deň_doručenia + D − LEAD (najskôr zajtra) */
export function firstRenewal(opts: { deliveredAt: Date; days: number; now?: Date } & CycleParams): Date {
  return notBeforeTomorrow(chargeTime(addDays(opts.deliveredAt, opts.days - opts.leadDays)), opts.now ?? new Date());
}

/** po zmene D: posledné_doručenie + D_nové − LEAD (najskôr zajtra) */
export function nextChargeAfterChange(opts: { lastDeliveredAt: Date; days: number; now?: Date } & CycleParams): Date {
  return firstRenewal({ deliveredAt: opts.lastDeliveredAt, days: opts.days, leadDays: opts.leadDays, shipDays: opts.shipDays, now: opts.now });
}

/**
 * Prepočet prvého obnovenia, keď FHB pošle skutočné delivered_at (SPEC §1): iba ak sa líši o viac ako 1 deň
 * a nový dátum je v budúcnosti. Vráti null, keď sa nič nemení.
 */
export function recomputeOnDelivery(opts: { current: Date; deliveredAt: Date; days: number; now?: Date } & CycleParams): Date | null {
  const now = opts.now ?? new Date();
  const next = chargeTime(addDays(opts.deliveredAt, opts.days - opts.leadDays));
  if (next <= now) return null;
  return Math.abs(next.getTime() - opts.current.getTime()) > DAY_MS ? next : null;
}

const unix = (d: Date) => Math.floor(d.getTime() / 1000);

/* ---------------------------------------------------------------- úpravy predplatného v Stripe */

/** Posunúť alebo preskočiť dodávku: ďalšia platba v daný deň. */
export function moveNextCharge(subId: string, at: Date, s: Stripe = stripe()) {
  return s.subscriptions.update(subId, { trial_end: unix(at), proration_behavior: 'none' });
}

/** Preskočiť jednu dodávku: ďalšia platba o D dní neskôr ako plánovaná. */
export function skipDelivery(subId: string, plannedCharge: Date, days: number, s: Stripe = stripe()) {
  return moveNextCharge(subId, addDays(plannedCharge, days), s);
}

export type PlanChange = {
  /** Stripe Product tovaru (recept × balenie) */
  productId: string;
  /** cena vreca v centoch (po zľave predplatného) */
  unitAmountCents: number;
  /** D = nový interval v dňoch */
  days: number;
  /** cena dopravy v centoch a jej Stripe Product */
  shippingCents: number;
  shippingProductId: string;
  /** kedy má byť ďalšia platba (nextChargeAfterChange) */
  nextCharge: Date;
};

/**
 * Zmena D, ceny, receptúry alebo balenia v JEDNOM update: staré položky preč, nové s price_data, trial_end na
 * ďalšiu platbu, bez prorácie. Tak sa interval zmení bez okamžitej platby.
 */
export async function changePlan(subId: string, c: PlanChange, s: Stripe = stripe()) {
  const sub = await s.subscriptions.retrieve(subId);
  const recurring = { interval: 'day' as const, interval_count: c.days };
  return s.subscriptions.update(subId, {
    items: [
      ...sub.items.data.map((i) => ({ id: i.id, deleted: true })),
      { price_data: { currency: 'eur', product: c.productId, unit_amount: c.unitAmountCents, recurring }, quantity: 1 },
      { price_data: { currency: 'eur', product: c.shippingProductId, unit_amount: c.shippingCents, recurring }, quantity: 1 },
    ],
    trial_end: unix(c.nextCharge),
    proration_behavior: 'none',
  });
}

/** Pauza: faktúry sa nevytvárajú (void), voliteľne do dátumu. */
export function pause(subId: string, resumesAt?: Date, s: Stripe = stripe()) {
  return s.subscriptions.update(subId, { pause_collection: { behavior: 'void', ...(resumesAt ? { resumes_at: unix(resumesAt) } : {}) } });
}

/** Obnoviť po pauze, ďalšia platba v daný deň. */
export function resume(subId: string, nextCharge: Date, s: Stripe = stripe()) {
  return s.subscriptions.update(subId, { pause_collection: null, trial_end: unix(nextCharge), proration_behavior: 'none' } as Stripe.SubscriptionUpdateParams);
}

/** Zrušiť: zákazník ku koncu obdobia; pri odstúpení od zmluvy okamžite. */
export function cancel(subId: string, mode: 'period_end' | 'now', s: Stripe = stripe()) {
  return mode === 'now' ? s.subscriptions.cancel(subId) : s.subscriptions.update(subId, { cancel_at_period_end: true });
}
