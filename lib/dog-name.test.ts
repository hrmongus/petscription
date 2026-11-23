import { describe, expect, it } from 'vitest';
import { dogCases } from './dog-name';
import { noAutoLink } from './emails';

describe('dogCases', () => {
  it('veľké začiatočné písmeno', () => {
    expect(dogCases('gut', 'pes')).toMatchObject({ nom: 'Gut', acc: 'Guta', dat: 'Gutovi' });
    expect(dogCases('bodka', 'fenka')).toMatchObject({ nom: 'Bodka', acc: 'Bodku', dat: 'Bodke' });
    expect(dogCases('šarik', 'pes').nom).toBe('Šarik');
    expect(dogCases('bruno-max', 'pes').nom).toBe('Bruno-Max');
    expect(dogCases('McQueen', 'pes').nom).toBe('McQueen');
  });
});

describe('noAutoLink', () => {
  it('za číslice vloží U+200C, viditeľný text sa nemení', () => {
    const s = noAutoLink('Hlavná 12, 040 01 Košice');
    expect(s.replace(/‌/g, '')).toBe('Hlavná 12, 040 01 Košice');
    expect(s).not.toContain('12, 040 01');
  });
});
