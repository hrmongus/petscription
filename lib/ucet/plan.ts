import engine from '../../public/granula/engine.js';
import { answersAt } from '../checkout';
import { AnswersSchema, computeServer } from '../engine-server';

/*
 * Vhodné receptúry pre /ucet (SPEC P4, §10.8: zákazník smie iba vhodné). Samotný prepočet dávky, D, ceny a dátumu
 * robí spoločná funkcia s adminom `previewPlanChange` (lib/subscription-actions.ts); admin smie aj menej vhodnú.
 */

export class PlanError extends Error {}

export const productName = (id: string) => engine.PRODUCTS.find((p) => p.id === id)?.name ?? id;

export type Eligible = { recommendedId: string; products: { id: string; name: string; recommended: boolean }[] };

/** odporúčaná a vhodné receptúry pre odpovede psa (vek z dátumu narodenia, voliteľne nová váha) */
export function eligibleProducts(i: { answers: unknown; birthDate: string | null; now: Date; kg?: number | null }): Eligible {
  let a = AnswersSchema.parse(i.answers);
  if (i.birthDate) a = answersAt(a, i.birthDate, i.now);
  if (i.kg != null) a = { ...a, kg: i.kg };
  const r = computeServer({ ...a, recipe: '', recipeFor: '' }).result;
  if (!r.recommended) throw new PlanError('Pre tieto údaje sa nedá vybrať receptúra. Napíš nám na podpora@granula.sk.');
  const ok = new Set(r.products.filter((e) => e.eligible).map((e) => e.product.id));
  ok.add(r.recommended.id);
  return { recommendedId: r.recommended.id, products: engine.PRODUCTS.filter((p) => ok.has(p.id)).map((p) => ({ id: p.id, name: p.name, recommended: p.id === r.recommended!.id })) };
}

/**
 * Receptúra pre zmenu v /ucet: zvolená musí byť vhodná; bez voľby ostane súčasná, ak je stále vhodná (napr. po zmene
 * váhy), inak odporúčaná (`switched`).
 */
export function chooseProduct(e: Eligible, current: string, requested?: string | null): { productId: string; switched: boolean } {
  if (requested) {
    if (!engine.PRODUCTS.some((p) => p.id === requested)) throw new PlanError('Neznáma receptúra.');
    if (!e.products.some((p) => p.id === requested)) throw new PlanError('Táto receptúra sa pre tvojho psa nehodí. Vyber niektorú z ponúknutých.');
    return { productId: requested, switched: false };
  }
  return e.products.some((p) => p.id === current) ? { productId: current, switched: false } : { productId: e.recommendedId, switched: true };
}
