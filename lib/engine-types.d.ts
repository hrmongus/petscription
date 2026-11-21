/* Typy pre public/granula/engine.js (UMD, jediný zdroj pravdy výpočtu). Iba to, čo používa server. */
declare module '*/public/granula/engine.js' {
  type Bag = { id: '4' | '9' | '18'; kg: number; label: string };
  type Product = { id: string; name: string; allergens?: string[]; [k: string]: unknown };
  type BagResult = { bag: Bag; days: number; price: number | null; saving: number; nextDay: number };
  type Eligibility = { product: Product; eligible: boolean; reason: string };
  export type EngineParams = {
    shipping: number;
    vat: number;
    minBagDays: number;
    reorderLeadDays: number;
    shipDays: number;
    bagPrices: Record<string, number>;
    plans: Record<string, number>;
    [k: string]: unknown;
  };
  export type EngineResult = {
    params: EngineParams;
    derived: Record<string, unknown>;
    products: Eligibility[];
    product: Product | null;
    recommended: Product | null;
    swapped: boolean;
    dose: { product: Product; grams: number; me: number; raw: number } | null;
    bags: BagResult[];
    recBag: string | null;
    notes: string[];
    [k: string]: unknown;
  };
  const engine: {
    PARAMS: EngineParams;
    BREEDS: { id: string; name: string; size: string; avg: number }[];
    ALLERGENS: { id: string; label: string }[];
    PRODUCTS: Product[];
    BAGS: Bag[];
    compute(answers: Record<string, unknown>, params?: EngineParams): EngineResult;
    merge<T>(base: T, over: unknown): T;
  };
  export default engine;
}
