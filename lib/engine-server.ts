import { z } from 'zod';
import engine, { type EngineParams, type EngineResult } from '../public/granula/engine.js';

/*
 * Výpočet na serveri (SPEC §0): produkt, dávka, D, cena a dátumy sa počítajú IBA tu, cez public/granula/engine.js
 * s predvolenými PARAMS. Z prehliadača prichádzajú len odpovede dotazníka a voľby (plán, balenie), ktoré tu prejdú
 * whitelistom. Parametre z klienta (napr. localStorage `granula-engine-params` z admin-vypocet) sa nikdy nepoužijú:
 * schéma ich zahodí a compute() dostane vždy čerstvú kópiu predvolených PARAMS.
 */

const ids = <T extends { id: string }>(list: T[]) => list.map((x) => x.id) as [string, ...string[]];
const AGE = (max: number) =>
  z
    .union([z.string(), z.number()])
    .transform((v) => String(v).trim())
    .refine((v) => v === '' || (/^\d{1,2}$/.test(v) && +v <= max), `celé číslo 0–${max}`);

// hodnoty ako vo formulári granule-na-mieru.html (kviz.js → state)
export const FOCUS = ['alergia', 'energia', 'imunita', 'kby', 'nic', 'pankreas', 'srst', 'svaly', 'travenie', 'vaha', 'vyberavy'] as const;

export const AnswersSchema = z.object({
  dogname: z.string().trim().min(1).max(30),
  sex: z.enum(['pes', 'fenka']),
  breed: z.enum(ids(engine.BREEDS)),
  breedSet: z.boolean().optional(),
  kg: z.coerce.number().min(0.5).max(90),
  years: AGE(25),
  months: AGE(11),
  weeks: AGE(13).optional().default(''),
  activity: z.enum(['doma', 'mesto', 'sport', 'praca']),
  neutered: z.enum(['ano', 'nie', '']).optional().default(''),
  pregnant: z.enum(['early', 'late', 'nie', '']).optional().default(''),
  body: z.enum(['akurat', 'chudsi', 'navyse', '']).optional().default(''),
  focus: z.array(z.enum(FOCUS)).max(FOCUS.length).optional().default([]),
  allergies: z.array(z.enum([...ids(engine.ALLERGENS), 'ziadne'])).max(engine.ALLERGENS.length + 1).optional().default([]),
  // vlastná voľba receptúry (UI ponúka všetky receptúry, menej vhodné len označí); platí len k odporúčanej recipeFor
  recipe: z.enum([...ids(engine.PRODUCTS), '']).optional().default(''),
  recipeFor: z.enum([...ids(engine.PRODUCTS), '']).optional().default(''),
});
// z.object() neznáme kľúče (params, ceny, dni…) zahodí
export type Answers = z.infer<typeof AnswersSchema>;

export const PlanSchema = z.enum(['mesiac', 'raz']);
export const BagIdSchema = z.enum(['4', '9', '18']);
export type Plan = z.infer<typeof PlanSchema>;
export type BagId = z.infer<typeof BagIdSchema>;

/** Čerstvá hlboká kópia predvolených PARAMS (nikdy nie zdieľaný objekt, ktorý by sa dal zmeniť). */
export function serverParams(): EngineParams {
  return structuredClone(engine.PARAMS);
}

/** Overí odpovede a spočíta výsledok s predvolenými PARAMS. Vyhodí ZodError pri neplatných odpovediach. */
export function computeServer(input: unknown): { answers: Answers; result: EngineResult } {
  const answers = AnswersSchema.parse(input);
  return { answers, result: engine.compute({ ...answers }, serverParams()) };
}

export type Quote = {
  productId: string;
  recommendedId: string;
  swapped: boolean;
  eligible: boolean;
  gramsPerDay: number;
  /** D = dni, ktoré vrece vydrží = interval predplatného (SPEC §1) */
  daysPerBag: number;
  bagId: BagId;
  plan: Plan;
  discount: number;
  /** cena vreca po zľave plánu, v centoch */
  unitAmountCents: number;
  shippingCents: number;
  totalCents: number;
  /** deň od doručenia, keď príde ďalšie vrece (D − LEAD + SHIP_DAYS) */
  nextDay: number;
  leadDays: number;
  shipDays: number;
  /** vstupy a výstup engine pre subscriptions.engine_snapshot */
  snapshot: { answers: Answers; params: EngineParams; productId: string; gramsPerDay: number; daysPerBag: number; bagId: BagId };
};

export class QuoteError extends Error {}

const cents = (eur: number) => Math.round(eur * 100);

/** Cena a cyklus pre checkout. Všetko zo servera; z klienta len odpovede, plán a balenie. */
export function quote(input: { answers: unknown; plan: unknown; bagId: unknown }): Quote {
  const plan = PlanSchema.parse(input.plan);
  const bagId = BagIdSchema.parse(input.bagId);
  const { answers, result } = computeServer(input.answers);
  const P = result.params;
  if (!result.product || !result.recommended || !result.dose) throw new QuoteError('engine nevybral receptúru');
  const bag = result.bags.find((b) => b.bag.id === bagId);
  if (!bag || bag.price == null) throw new QuoteError(`balenie ${bagId} nemá cenu`);
  const discount = P.plans[plan] ?? 0;
  const unitAmountCents = cents(bag.price * (1 - discount));
  const shippingCents = cents(P.shipping);
  const eligible = result.products.find((e) => e.product.id === result.product!.id)?.eligible ?? false;
  return {
    productId: result.product.id,
    recommendedId: result.recommended.id,
    swapped: result.swapped,
    eligible,
    gramsPerDay: result.dose.grams,
    daysPerBag: bag.days,
    bagId,
    plan,
    discount,
    unitAmountCents,
    shippingCents,
    totalCents: unitAmountCents + shippingCents,
    nextDay: bag.nextDay,
    leadDays: P.reorderLeadDays,
    shipDays: P.shipDays,
    snapshot: { answers, params: P, productId: result.product.id, gramsPerDay: result.dose.grams, daysPerBag: bag.days, bagId },
  };
}

/*
 * FHB produkty (SPEC P0 → SKU): ID = `GRAN-<receptúra>-<kg>`, receptúra = PRODUCTS[].id v engine.js.
 * ID sa po založení NIKDY nemení (FHB páruje podľa id, produkt sa nedá zmazať, iba archivovať) → id receptúr
 * v engine.js sa nesmú premenovať.
 *   4 kg a 9 kg = bežné produkty (single), 18 kg = sada (multi) z 2 × 9 kg. Spolu 15 produktov.
 */
export const sku = (productId: string, kg: 4 | 9 | 18) => `GRAN-${productId}-${kg}`;

/** FHB položky objednávky pre receptúru a balenie: vždy jeden produkt (18 kg = sada GRAN-<receptúra>-18). */
export function skuItems(productId: string, bagId: BagId): { sku: string; qty: number }[] {
  if (!engine.PRODUCTS.some((p) => p.id === productId)) throw new QuoteError(`neznáma receptúra ${productId}`);
  return [{ sku: sku(productId, +bagId as 4 | 9 | 18), qty: 1 }];
}

export type FhbCatalogItem = {
  sku: string;
  productId: string;
  name: string;
  kg: 4 | 9 | 18;
  type: 'single' | 'multi';
  /** zložky sady (iba multi) */
  items?: { id: string; quantity: number }[];
};

/** Všetkých 15 produktov pre scripts/fhb-sync-products.ts: najprv bežné (4, 9 kg), potom sady (18 kg). */
export function allSkus(): FhbCatalogItem[] {
  const singles = engine.PRODUCTS.flatMap((p) =>
    ([4, 9] as const).map((kg): FhbCatalogItem => ({ sku: sku(p.id, kg), productId: p.id, name: `${p.name} ${kg} kg`, kg, type: 'single' })),
  );
  const sets = engine.PRODUCTS.map((p): FhbCatalogItem => ({
    sku: sku(p.id, 18), productId: p.id, name: `${p.name} 18 kg (2 × 9 kg)`, kg: 18, type: 'multi', items: [{ id: sku(p.id, 9), quantity: 2 }],
  }));
  return [...singles, ...sets];
}
