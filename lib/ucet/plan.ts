import engine from '../../public/granula/engine.js';
import { isMethodAllowed, shippingPrice, type DeliveryMethod } from '../carriers';
import { answersAt } from '../checkout';
import { AnswersSchema, BagIdSchema, computeServer, quote, serverParams, type Answers, type BagId } from '../engine-server';

/*
 * Prepočet predplatného pre /ucet (SPEC P4): zmena váhy psa, receptúry, balenia. Všetko na serveri cez engine.js
 * s predvolenými PARAMS (SPEC §0); z prehliadača iba nová váha / id receptúry / balenie.
 *   - vek sa obnoví z dátumu narodenia (šteňatá),
 *   - receptúra: iba vhodné podľa engine (SPEC §10.8); pri zmene váhy ostane súčasná, ak je stále vhodná, inak odporúčaná,
 *   - balenie: musí sedieť so spôsobom doručenia (doprava-config.js), inak najprv zmeniť doručenie.
 */

export class PlanError extends Error {}

export const productName = (id: string) => engine.PRODUCTS.find((p) => p.id === id)?.name ?? id;

export type PlanInput = {
  answers: unknown;
  birthDate: string | null;
  now: Date;
  current: { productId: string; bagId: string };
  method: DeliveryMethod;
  kg?: number;
  productId?: string;
  bagId?: string;
};

export type PlanResult = {
  answers: Answers;
  productId: string;
  productName: string;
  recommendedId: string;
  /** receptúra sa zmenila sama (súčasná sa pre novú váhu/vek nehodí) */
  productSwitched: boolean;
  products: { id: string; name: string; eligible: boolean; recommended: boolean }[];
  bagId: BagId;
  gramsPerDay: number;
  daysPerBag: number;
  unitAmountCents: number;
  shippingCents: number;
  totalCents: number;
};

export function computePlan(i: PlanInput): PlanResult {
  let answers = AnswersSchema.parse(i.answers);
  if (i.birthDate) answers = answersAt(answers, i.birthDate, i.now);
  if (i.kg != null) {
    if (!(i.kg >= 0.5 && i.kg <= 90)) throw new PlanError('Zadaj váhu psa od 0,5 do 90 kg.');
    answers = { ...answers, kg: Math.round(i.kg * 10) / 10 };
  }
  const bagParsed = BagIdSchema.safeParse(i.bagId ?? i.current.bagId);
  if (!bagParsed.success) throw new PlanError('Neznáme balenie.');
  const bagId = bagParsed.data;

  // odporúčaná receptúra a vhodnosť pre aktuálne odpovede (bez vlastnej voľby)
  const base = computeServer({ ...answers, recipe: '', recipeFor: '' }).result;
  if (!base.recommended) throw new PlanError('Pre tieto údaje sa nedá vybrať receptúra. Napíš nám na podpora@granula.sk.');
  const recommendedId = base.recommended.id;
  const eligible = new Set(base.products.filter((e) => e.eligible).map((e) => e.product.id));
  eligible.add(recommendedId);

  let productId: string;
  let productSwitched = false;
  if (i.productId) {
    if (!engine.PRODUCTS.some((p) => p.id === i.productId)) throw new PlanError('Neznáma receptúra.');
    if (!eligible.has(i.productId)) throw new PlanError('Táto receptúra sa pre tvojho psa nehodí. Vyber niektorú z ponúknutých.');
    productId = i.productId;
  } else if (eligible.has(i.current.productId)) {
    productId = i.current.productId;
  } else {
    productId = recommendedId;
    productSwitched = true;
  }

  if (!isMethodAllowed(i.method, bagId)) throw new PlanError(`Pri balení ${bagId} kg sa tvoj spôsob doručenia neponúka. Najprv zmeň doručenie.`);

  const chosen = { ...answers, recipe: productId === recommendedId ? '' : productId, recipeFor: productId === recommendedId ? '' : recommendedId };
  const q = quote({ answers: chosen, plan: 'mesiac', bagId });
  if (q.productId !== productId) throw new PlanError('Receptúru sa nepodarilo prepočítať.');
  const P = serverParams();
  const shippingCents = Math.round(shippingPrice(i.method, bagId, P.shipping, 'mesiac') * 100);
  return {
    answers: q.snapshot.answers,
    productId,
    productName: productName(productId),
    recommendedId,
    productSwitched,
    products: engine.PRODUCTS.filter((p) => eligible.has(p.id)).map((p) => ({ id: p.id, name: p.name, eligible: true, recommended: p.id === recommendedId })),
    bagId,
    gramsPerDay: q.gramsPerDay,
    daysPerBag: q.daysPerBag,
    unitAmountCents: q.unitAmountCents,
    shippingCents,
    totalCents: q.unitAmountCents + shippingCents,
  };
}
