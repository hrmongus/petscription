import psc from '../public/granula/psc.js';

/** Platné slovenské PSČ (zoznam Slovenskej pošty v public/granula/psc.js; ten istý súbor používa dotazník). */
/** `city` pomôže pri 71 obciach s PSČ podľa súpisného čísla (v zozname pošty chýbajú) */
export const isValidPsc = (zip: string, city?: string): boolean => psc.valid(zip, city);
export const PSC_COUNT: number = psc.count;
