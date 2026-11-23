import config from '../public/granula/doprava-config.js';

/*
 * Server: pravidlá dopravcov z public/granula/doprava-config.js (jediný konfiguračný súbor, ten istý ako v dotazníku).
 * Kód služby FHB sa dá prepísať env FHB_SERVICE_PACKETA / FHB_SERVICE_DPD / FHB_SERVICE_SPS_COURIER.
 */
export type DeliveryMethod = 'packeta_point' | 'dpd_pickup' | 'sps_courier';
export type Carrier = 'packeta' | 'dpd' | 'sps';
export type BagKey = '4' | '9' | '18';

export const METHODS = config.METHODS as Record<DeliveryMethod, { label: string; eta: string; etaEmail?: string; logo?: string; carrier: Carrier; pickup: boolean; maxKg: number | null; fhbService: string }>;
export const DELIVERY_METHODS = Object.keys(METHODS) as DeliveryMethod[];

export const methodsFor = (bag: BagKey) => config.methodsFor(bag) as DeliveryMethod[];
export const defaultMethodFor = (bag: BagKey) => config.defaultFor(bag) as DeliveryMethod;
export const isMethodAllowed = (method: string, bag: BagKey): method is DeliveryMethod => config.allowed(method, bag);
/** sú pri tomto balení povolené boxy (Z-BOX, AlzaBox, DPD Pickup Box…)? 18 kg do DPD boxu nie. */
export const boxesAllowed = (method: DeliveryMethod, bag: BagKey): boolean => config.boxes(method, bag);
/** cena dopravy pre zákazníka v € (konečná cena, 0 = zadarmo) podľa plánu; `fallback` = PARAMS.shipping z engine */
export const shippingPrice = (method: DeliveryMethod, bag: BagKey, fallback: number, plan: 'raz' | 'mesiac'): number => config.price(method, bag, fallback, plan);

const ENV_KEY: Record<DeliveryMethod, string> = { packeta_point: 'FHB_SERVICE_PACKETA', dpd_pickup: 'FHB_SERVICE_DPD', sps_courier: 'FHB_SERVICE_SPS_COURIER' };

/** kód služby FHB (parcel_service); undefined = predvolená služba účtu */
export function fhbServiceFor(method: DeliveryMethod, env: Record<string, string | undefined> = process.env): string | undefined {
  return env[ENV_KEY[method]] || METHODS[method].fhbService || undefined;
}
