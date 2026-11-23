import type Stripe from 'stripe';
import { answersAt, birthDateFrom, productIdFor, SHIPPING_PRODUCT_ID } from './checkout';
import { isMethodAllowed, shippingPrice, type DeliveryMethod } from './carriers';
import type { Json, Tables, TablesUpdate } from './database.types';
import { allSkus, quote, serverParams, skuItems, type Answers, type BagId, type Quote } from './engine-server';
import { ensureProduct } from './stripe-products';
import { addDays, changePlan, nextChargeAfterChange, type CycleParams } from './subscription-schedule';

/*
 * Zmena predplatného s prepočtom (SPEC §1, P3 admin, P4 portál): receptúra, balenie, váha, vek psa.
 * Všetko sa počíta na serveri cez engine s predvolenými PARAMS (quote); náhľad (preview) aj vykonanie (apply)
 * volajú ten istý výpočet, apply nič neprevezme z náhľadu.
 *
 *   nové D rovnaké     → ďalšia platba ostáva (mení sa iba cena / produkt)
 *   nové D iné         → ďalšia platba = posledné_doručenie + D_nové − LEAD (najskôr zajtra), SPEC §1
 *   posledné doručenie = last_delivered_at, inak odhad z poslednej objednávky (vytvorená + SHIP_DAYS)
 * Stripe: changePlan = položky + trial_end v JEDNOM update, bez prorácie (žiadna okamžitá platba).
 */

export type SubRow = Tables<'subscriptions'>;
export type DogRow = Tables<'dogs'>;
export type AddressRow = Tables<'addresses'>;

export type PlanChangeInput = {
  /** receptúra (PRODUCTS[].id); prázdne = odporúčaná engine */
  productId?: string | null;
  bagId?: BagId | null;
  /** aktuálna hmotnosť psa v kg */
  kg?: number | null;
  /** vek psa (roky, mesiace); prázdne = z dátumu narodenia */
  years?: number | null;
  months?: number | null;
};

export class PlanChangeError extends Error {
  name = 'PlanChangeError';
}

export type PlanPreview = {
  answers: Answers;
  birthDate: string | null;
  quote: Quote;
  shippingCents: number;
  method: DeliveryMethod;
  before: { productId: string; bagId: string; grams: number; days: number; unitCents: number };
  daysChanged: boolean;
  nextCharge: Date;
  /** posledné (alebo odhadnuté) doručenie, od ktorého sa počíta ďalšia platba */
  lastDelivery: Date;
  changed: boolean;
};

export function previewPlanChange(
  ctx: { sub: SubRow; dog: DogRow; address: Pick<AddressRow, 'delivery_method'>; lastOrderAt?: Date | null; cycle: CycleParams; now?: Date },
  input: PlanChangeInput,
): PlanPreview {
  const { sub, dog, cycle } = ctx;
  const now = ctx.now ?? new Date();
  if (sub.status === 'cancelled') throw new PlanChangeError('Zrušené predplatné sa nedá meniť.');
  const bagId = (input.bagId || sub.bag_id) as BagId;
  const method = ctx.address.delivery_method as DeliveryMethod;
  if (!isMethodAllowed(method, bagId)) throw new PlanChangeError(`Pri balení ${bagId} kg sa súčasný spôsob doručenia neponúka. Najprv zmeň doručenie.`);

  // vek: zadaný → nový dátum narodenia; inak aktuálny vek z dátumu narodenia
  let base = { ...(dog.answers as Answers) };
  let birthDate = dog.birth_date;
  if (input.years != null || input.months != null) {
    const years = String(Math.max(0, Math.floor(input.years ?? 0)));
    const months = String(Math.max(0, Math.min(11, Math.floor(input.months ?? 0))));
    base = { ...base, years, months, weeks: '' };
    birthDate = birthDateFrom(base, now);
  } else if (birthDate) {
    base = answersAt(base, birthDate, now);
  }
  if (input.kg != null) {
    if (!(input.kg >= 0.5 && input.kg <= 90)) throw new PlanChangeError('Hmotnosť musí byť 0,5 – 90 kg.');
    base = { ...base, kg: input.kg };
  }

  // receptúra: engine berie vlastnú voľbu iba spolu s odporúčanou (recipeFor), inak odporúčanú
  const plain = { ...base, recipe: '', recipeFor: '' };
  const rec = quote({ answers: plain, plan: 'mesiac', bagId });
  const wanted = input.productId || sub.product_id;
  const answers: Answers = wanted && wanted !== rec.recommendedId ? { ...plain, recipe: wanted, recipeFor: rec.recommendedId } : plain;
  const q = wanted && wanted !== rec.recommendedId ? quote({ answers, plan: 'mesiac', bagId }) : rec;
  if (wanted && q.productId !== wanted) throw new PlanChangeError(`Receptúru ${wanted} engine neprijal.`);
  skuItems(q.productId, bagId); // overí receptúru

  const P = serverParams();
  const shippingCents = Math.round(shippingPrice(method, bagId, P.shipping, 'mesiac') * 100);
  const lastDelivery = sub.last_delivered_at ? new Date(sub.last_delivered_at) : ctx.lastOrderAt ? addDays(ctx.lastOrderAt, cycle.shipDays) : addDays(now, cycle.shipDays);
  const daysChanged = q.daysPerBag !== sub.days_per_bag;
  const current = sub.next_charge_at ? new Date(sub.next_charge_at) : null;
  const nextCharge = !daysChanged && current && current > now ? current : nextChargeAfterChange({ lastDeliveredAt: lastDelivery, days: q.daysPerBag, ...cycle, now });
  return {
    answers: q.snapshot.answers,
    birthDate,
    quote: q,
    shippingCents,
    method,
    before: { productId: sub.product_id, bagId: sub.bag_id, grams: sub.grams_per_day, days: sub.days_per_bag, unitCents: sub.unit_amount_cents },
    daysChanged,
    nextCharge,
    lastDelivery,
    changed: daysChanged || q.productId !== sub.product_id || bagId !== sub.bag_id || q.unitAmountCents !== sub.unit_amount_cents || q.gramsPerDay !== sub.grams_per_day,
  };
}

/** Stripe Products tovaru a dopravy (rovnaké id a názov ako v /api/checkout); vzniknú pri prvom použití. */
export async function ensureStripeProducts(s: Stripe, productId: string, bagId: BagId) {
  const sku = skuItems(productId, bagId)[0].sku;
  await ensureProduct(s, productIdFor(sku), `Granula! ${allSkus().find((x) => x.sku === sku)?.name ?? sku}`, { sku });
  await ensureProduct(s, SHIPPING_PRODUCT_ID, 'Doprava');
}

/**
 * Cena dopravy predplatného po zmene spôsobu doručenia (napr. DPD zadarmo → SPS kuriér). Ak sa líši od Stripe,
 * zmení sa iba riadok dopravy (changePlan s tou istou cenou, D a dátumom ďalšej platby). Vráti novú a pôvodnú cenu.
 */
export async function syncShipping(sub: SubRow, method: DeliveryMethod, s: Stripe): Promise<{ before: number; after: number; changed: boolean }> {
  if (!sub.stripe_subscription_id || sub.status === 'cancelled') return { before: 0, after: 0, changed: false };
  const after = Math.round(shippingPrice(method, sub.bag_id as BagId, serverParams().shipping, 'mesiac') * 100);
  const live = await s.subscriptions.retrieve(sub.stripe_subscription_id);
  const ship = live.items.data.find((i) => (typeof i.price.product === 'string' ? i.price.product : i.price.product?.id) === SHIPPING_PRODUCT_ID);
  const before = ship ? (ship.price.unit_amount ?? 0) * (ship.quantity ?? 1) : 0;
  if (before === after) return { before, after, changed: false };
  const next = sub.next_charge_at ? new Date(sub.next_charge_at) : null;
  if (!next || next <= new Date()) throw new PlanChangeError('Predplatné nemá ďalšiu platbu v budúcnosti, cenu dopravy nejde zmeniť.');
  await ensureStripeProducts(s, sub.product_id, sub.bag_id as BagId);
  await changePlan(sub.stripe_subscription_id, {
    productId: productIdFor(skuItems(sub.product_id, sub.bag_id as BagId)[0].sku),
    unitAmountCents: sub.unit_amount_cents,
    days: sub.days_per_bag,
    shippingCents: after,
    shippingProductId: SHIPPING_PRODUCT_ID,
    nextCharge: next,
  }, s);
  return { before, after, changed: true };
}

export type ApplyStore = {
  updateSubscription(id: string, patch: TablesUpdate<'subscriptions'>): Promise<void>;
  updateDog(id: string, patch: TablesUpdate<'dogs'>): Promise<void>;
};

/** Vykoná zmenu (Stripe changePlan + DB). Volajúci predtým spraví previewPlanChange s tými istými vstupmi. */
export async function applyPlanChange(ctx: { sub: SubRow; dog: DogRow }, p: PlanPreview, deps: { stripe: Stripe; store: ApplyStore; now?: Date }) {
  const { sub, dog } = ctx;
  if (!sub.stripe_subscription_id) throw new PlanChangeError('Predplatné nemá Stripe id.');
  const q = p.quote;
  await ensureStripeProducts(deps.stripe, q.productId, q.bagId);
  await changePlan(
    sub.stripe_subscription_id,
    {
      productId: productIdFor(skuItems(q.productId, q.bagId)[0].sku),
      unitAmountCents: q.unitAmountCents,
      days: q.daysPerBag,
      shippingCents: p.shippingCents,
      shippingProductId: SHIPPING_PRODUCT_ID,
      nextCharge: p.nextCharge,
    },
    deps.stripe,
  );
  const at = (deps.now ?? new Date()).toISOString();
  await deps.store.updateSubscription(sub.id, {
    product_id: q.productId,
    bag_id: q.bagId,
    grams_per_day: q.gramsPerDay,
    days_per_bag: q.daysPerBag,
    unit_amount_cents: q.unitAmountCents,
    next_charge_at: p.nextCharge.toISOString(),
    engine_snapshot: { answers: p.answers, product_id: q.productId, bag_id: q.bagId, grams: q.gramsPerDay, days: q.daysPerBag, shipping_cents: p.shippingCents, at } as unknown as Json,
  });
  const a = p.answers;
  await deps.store.updateDog(dog.id, { answers: a as unknown as Json, weight_kg: a.kg, birth_date: p.birthDate });
}

export async function supabaseApplyStore(): Promise<ApplyStore> {
  const { db } = await import('./db');
  return {
    async updateSubscription(id, patch) {
      const { error } = await db().from('subscriptions').update(patch).eq('id', id);
      if (error) throw new Error(error.message);
    },
    async updateDog(id, patch) {
      const { error } = await db().from('dogs').update(patch).eq('id', id);
      if (error) throw new Error(error.message);
    },
  };
}
