import { describe, expect, it } from 'vitest';
import { isValidPsc, PSC_COUNT } from './psc';

describe('PSČ (zoznam Slovenskej pošty)', () => {
  it('platné PSČ prejdú, aj s medzerou', () => {
    for (const z of ['040 01', '04001', '81101', '96501', '98201', '01001', '85101']) expect(isValidPsc(z)).toBe(true);
  });
  it('neexistujúce alebo zlé PSČ neprejdú', () => {
    for (const z of ['00000', '04099', '12345', '99999', '0400', 'abcde', '']) expect(isValidPsc(z)).toBe(false);
  });
  it('obce s PSČ podľa súpisného čísla (v zozname pošty chýbajú) prejdú podľa názvu obce', () => {
    expect(isValidPsc('92527')).toBe(true); // Veľký Grob: z výdajných miest
    expect(isValidPsc('03299', 'Hybe')).toBe(true);
    expect(isValidPsc('03299', 'Košice')).toBe(false);
  });
  it('zoznam je úplný', () => expect(PSC_COUNT).toBeGreaterThan(3000));
});
