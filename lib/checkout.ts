import type Stripe from 'stripe';
import { z } from 'zod';
import { boxesAllowed, isMethodAllowed, METHODS, shippingPrice, type DeliveryMethod } from './carriers';
import { findPoint, type DeliveryPoint, type PointService } from './delivery-points';
import { quote, QuoteError, skuItems, type Answers, type Quote } from './engine-server';
import { normalizePhone, type ShipTo } from './fhb/build-order';
import { APP_METADATA } from './stripe';

/*
 * POST /api/checkout: príprava objednávky (SPEC §0, P1, P1b). Z prehliadača prichádzajú iba odpovede dotazníka,
 * plán, balenie a doručenie. Cena, dávka, D, cena dopravy, položky a údaje výdajného miesta sa určia TU:
 *   - quote() z engine-server (predvolené PARAMS),
 *   - spôsob doručenia povolený pre balenie (doprava-config.js), boxy podľa BOXES,
 *   - výdajné miesto existuje v aktuálnom zozname FHB (názov a adresa sa berú z FHB, nie z prehliadača),
 *   - telefón v medzinárodnom tvare, e-mail ≤ 50 znakov (FHB).
 */

export class CheckoutError extends Error {
  constructor(message: string, readonly field?: string) {
    super(message);
    this.name = 'CheckoutError';
  }
}

const DeliverySchema = z.object({
  method: z.enum(['packeta_point', 'dpd_pickup', 'sps_courier']),
  firstName: z.string().trim().min(1).max(60),
  lastName: z.string().trim().min(1).max(60),
  email: z.string().trim().toLowerCase().email().max(50),
  phone: z.string().trim().min(6).max(30),
  point: z.object({ id: z.string().trim().min(1).max(40) }).nullable().optional(),
  address: z
    .object({ street: z.string().trim().min(1).max(120), zip: z.string().trim().max(10), city: z.string().trim().min(1).max(80) })
    .nullable()
    .optional(),
});

export const CheckoutInputSchema = z.object({
  answers: z.unknown(),
  plan: z.unknown(),
  bag: z.unknown(),
  delivery: DeliverySchema,
  // P7: id dotazníka (quiz_sessions) a súhlas s cookies v čase nákupu; neplatné hodnoty sa ignorujú, nákup nezastavia
  quizSession: z.string().uuid().optional().catch(undefined),
  consent: z.object({ analytics: z.boolean(), marketing: z.boolean() }).partial().optional().catch(undefined),
  // políčko „Ak objednávku nedokončíš, pripomenieme ti ju e-mailom“ (predvolene nezaškrtnuté)
  reminder: z.boolean().optional().catch(undefined),
});

export type PreparedCheckout = {
  quote: Quote;
  answers: Answers;
  method: DeliveryMethod;
  shippingCents: number;
  totalCents: number;
  items: { sku: string; qty: number }[];
  customer: { email: string; firstName: string; lastName: string; name: string; phone: string };
  point: DeliveryPoint | null;
  /** snapshot pre orders.ship_to a FHB */
  shipTo: ShipTo;
  /** P7: quiz_sessions.id z prehliadača (alebo null) */
  quizSessionId: string | null;
  /** P7: súhlas s analytickými (PostHog) a marketingovými (Klaviyo) cookies v čase nákupu */
  consent: { analytics: boolean; marketing: boolean };
  /** P7: súhlas s pripomenutím nedokončenej objednávky emailom (iba true = súhlas) */
  reminderConsent: boolean;
};

const POINT_SERVICE: Partial<Record<DeliveryMethod, PointService>> = { packeta_point: 'packeta', dpd_pickup: 'dpd' };

export async function prepareCheckout(input: unknown, deps: { findPoint?: typeof findPoint } = {}): Promise<PreparedCheckout> {
  const parsed = CheckoutInputSchema.safeParse(input);
  if (!parsed.success) throw new CheckoutError('Skontroluj údaje o doručení.', parsed.error.issues[0]?.path.join('.'));
  const { delivery: d } = parsed.data;

  let q: Quote;
  try {
    q = quote({ answers: parsed.data.answers, plan: parsed.data.plan, bagId: parsed.data.bag });
  } catch (e) {
    if (e instanceof QuoteError || (e as Error).name === 'ZodError') throw new CheckoutError('Odpovede v dotazníku nie sú úplné. Prejdi ho prosím znova.', 'answers');
    throw e;
  }

  if (!isMethodAllowed(d.method, q.bagId)) throw new CheckoutError('Tento spôsob doručenia sa pri zvolenom balení neponúka.', 'delivery.method');
  const phone = normalizePhone(d.phone);
  if (!phone) throw new CheckoutError('Zadaj telefón v tvare +421 9XX XXX XXX.', 'delivery.phone');
  const name = `${d.firstName} ${d.lastName}`;

  let point: DeliveryPoint | null = null;
  let shipTo: ShipTo;
  const service = POINT_SERVICE[d.method];
  if (service) {
    if (!d.point?.id) throw new CheckoutError('Vyber výdajné miesto.', 'delivery.point');
    point = await (deps.findPoint ?? findPoint)(service, d.point.id);
    if (!point) throw new CheckoutError('Toto výdajné miesto teraz nie je dostupné. Vyber prosím iné.', 'delivery.point');
    if (point.kind === 'box' && !boxesAllowed(d.method, q.bagId)) throw new CheckoutError(`Pri balení ${q.bagId} kg vyber odberné miesto, nie box.`, 'delivery.point');
    shipTo = {
      name, email: d.email, phone, country: 'SK', delivery_method: d.method,
      point_id: point.id, point_label: `${point.name}, ${point.street}, ${point.zip} ${point.city}`,
      point_address: { street: point.street, city: point.city, zip: point.zip },
    };
  } else {
    const a = d.address;
    const zip = (a?.zip ?? '').replace(/\s/g, '');
    if (!a || !/^\d{5}$/.test(zip)) throw new CheckoutError('Doplň adresu doručenia (PSČ má 5 číslic).', 'delivery.address');
    shipTo = { name, email: d.email, phone, country: 'SK', delivery_method: d.method, street: a.street, city: a.city, zip };
  }

  // DPH (SPEC P1): firma zatiaľ nie je platiteľ DPH → ceny z engine sú konečné, DPH sa neodvádza ani neuvádza.
  const shippingCents = Math.round(shippingPrice(d.method, q.bagId, q.shippingCents / 100, q.plan === 'raz' ? 'raz' : 'mesiac') * 100);
  return {
    quote: q,
    answers: q.snapshot.answers,
    method: d.method,
    shippingCents,
    totalCents: q.unitAmountCents + shippingCents,
    items: skuItems(q.productId, q.bagId),
    customer: { email: d.email, firstName: d.firstName, lastName: d.lastName, name, phone },
    point,
    shipTo,
    quizSessionId: parsed.data.quizSession ?? null,
    consent: { analytics: parsed.data.consent?.analytics === true, marketing: parsed.data.consent?.marketing === true },
    reminderConsent: parsed.data.reminder === true,
  };
}

/** Približný dátum narodenia z veku v odpovediach (na prepočet dávky pri obnovení, SPEC §1 šteňatá). */
export function birthDateFrom(a: Pick<Answers, 'years' | 'months' | 'weeks'>, today = new Date()): string {
  const years = +a.years || 0, months = +a.months || 0, weeks = +(a.weeks || 0) || 0;
  const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  if (years === 0 && months <= 2 && weeks > 0) d.setUTCDate(d.getUTCDate() - weeks * 7);
  else d.setUTCMonth(d.getUTCMonth() - (years * 12 + months));
  return d.toISOString().slice(0, 10);
}

/** Odpovede s vekom k dátumu (z dátumu narodenia): roky, mesiace, pri šteňati do 13 týždňov aj týždne. */
export function answersAt(a: Answers, birthDate: string, at: Date): Answers {
  const b = new Date(`${birthDate}T00:00:00Z`);
  let months = (at.getUTCFullYear() - b.getUTCFullYear()) * 12 + (at.getUTCMonth() - b.getUTCMonth());
  if (at.getUTCDate() < b.getUTCDate()) months--;
  months = Math.max(0, months);
  const weeks = Math.floor((at.getTime() - b.getTime()) / (7 * 86_400_000));
  return { ...a, years: String(Math.floor(months / 12)), months: String(months % 12), weeks: months < 3 && weeks > 0 && weeks <= 13 ? String(weeks) : '' };
}

/* ---------------------------------------------------------------- Stripe Checkout Session */

/** Stripe Product tovaru (recept × balenie) a dopravy: stabilné ID, jeden produkt na SKU. */
export const productIdFor = (sku: string) => `granula-${sku}`;
export const SHIPPING_PRODUCT_ID = 'granula-doprava';

export type DraftIds = { customerId: string; dogId: string; addressId: string };

export function checkoutMetadata(p: PreparedCheckout, ids: DraftIds): Stripe.MetadataParam {
  return {
    ...APP_METADATA,
    customer_id: ids.customerId,
    dog_id: ids.dogId,
    address_id: ids.addressId,
    product_id: p.quote.productId,
    bag_id: p.quote.bagId,
    plan: p.quote.plan,
    days: String(p.quote.daysPerBag),
    grams: String(p.quote.gramsPerDay),
    unit_cents: String(p.quote.unitAmountCents),
    ship_cents: String(p.shippingCents),
    method: p.method,
    // P7: spárovanie objednávky s dotazníkom; súhlas pre server-side analytiku (ph = PostHog s profilom zákazníka)
    ...(p.quizSessionId ? { quiz_session: p.quizSessionId } : {}),
    ph: p.consent.analytics ? '1' : '0',
    kl: p.consent.marketing ? '1' : '0',
  };
}

export function sessionParams(p: PreparedCheckout, ids: DraftIds, opts: { origin: string; stripeCustomerId: string; productName: string }): Stripe.Checkout.SessionCreateParams {
  const q = p.quote;
  const metadata = checkoutMetadata(p, ids);
  const productId = productIdFor(skuItems(q.productId, q.bagId)[0].sku);
  const shippingLabel = METHODS[p.method].label;
  const base = {
    // vlastný platobný formulár v dizajne Granuly (Stripe Elements: Payment Element + Express Checkout Element),
    // v API dahlia sa „custom“ volá „elements“ (SPEC §10.17)
    ui_mode: 'elements' as const,
    // karta (Apple Pay / Google Pay sú kartové peňaženky) a Link; bez lokálnych metód (Bancontact…)
    payment_method_types: ['card', 'link'] as Stripe.Checkout.SessionCreateParams.PaymentMethodType[],
    customer: opts.stripeCustomerId,
    locale: 'sk' as const,
    // iba EUR (SPEC P1): Adaptive Pricing je na účte zapnuté a zahraničnej IP ponúkne USD s poplatkom 4 %
    adaptive_pricing: { enabled: false },
    return_url: `${opts.origin}/granule-na-mieru?session_id={CHECKOUT_SESSION_ID}#hotovo`,
    metadata,
  };
  if (q.plan === 'mesiac') {
    const recurring = { interval: 'day' as const, interval_count: q.daysPerBag };
    return {
      ...base,
      mode: 'subscription',
      line_items: [
        { quantity: 1, price_data: { currency: 'eur', product: productId, unit_amount: q.unitAmountCents, recurring } },
        ...(p.shippingCents > 0 ? [{ quantity: 1, price_data: { currency: 'eur', product: SHIPPING_PRODUCT_ID, unit_amount: p.shippingCents, recurring } }] : []),
      ],
      subscription_data: { description: `${opts.productName} · každých ${q.daysPerBag} dní · ${shippingLabel}`, metadata },
    };
  }
  return {
    ...base,
    mode: 'payment',
    line_items: [
      { quantity: 1, price_data: { currency: 'eur', product: productId, unit_amount: q.unitAmountCents } },
      ...(p.shippingCents > 0 ? [{ quantity: 1, price_data: { currency: 'eur', product: SHIPPING_PRODUCT_ID, unit_amount: p.shippingCents } }] : []),
    ],
    invoice_creation: { enabled: true, invoice_data: { metadata } },
    payment_intent_data: { description: `${opts.productName} · jednorazovo`, metadata, setup_future_usage: 'off_session' },
  };
}
