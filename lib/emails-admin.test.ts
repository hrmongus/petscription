import { describe, expect, test } from 'vitest';
import { orderCancelledEmail, refundEmail, subscriptionCancelledEmail, subscriptionChangedEmail } from './emails-admin';

const base = { to: 'jan@example.sk', name: 'Ján Novák', dog: { name: 'bodka', sex: 'fenka' }, siteUrl: 'https://www.granula.sk' };
const order = { id: 'o1', number: 42, items: [{ sku: 'GRAN-hovadzie-9', qty: 1 }], amount_cents: 6750 };
const sub = { id: 's1', product_id: 'jahna', bag_id: '18', days_per_bag: 56, grams_per_day: 320, unit_amount_cents: 12600 };

const all = [
  refundEmail({ ...base, order, refundId: 're_1', amountCents: 6000, full: false }),
  orderCancelledEmail({ ...base, order, refundedCents: 6750 }),
  orderCancelledEmail({ ...base, order }),
  subscriptionCancelledEmail({ ...base, sub, mode: 'period_end' }),
  subscriptionChangedEmail({ ...base, sub, shippingCents: 0, nextCharge: new Date('2027-01-14T06:00:00Z') }),
];

describe('e-maily po akciách admina', () => {
  test('bez nevyplnených premenných a blokov, s pätičkou a odkazom na odstúpenie', () => {
    for (const m of all) {
      expect(m.html).not.toMatch(/\{\{|\}\}/);
      expect(m.html).toContain('Odstúpiť od zmluvy tu');
      expect(m.text).toContain('podpora@granula.sk');
      expect(m.html).not.toMatch(/s DPH/);
    }
  });
  test('kľúče: každý e-mail iba raz', () => {
    expect(all.map((m) => m.key)).toEqual([
      'refund:re_1',
      'order-cancelled:o1',
      'order-cancelled:o1',
      'subscription-cancelled:s1',
      'subscription-changed:s1:jahna:18:320:56:12600:2027-01-14',
    ]);
  });
  test('obsah', () => {
    expect(all[0].subject).toBe('Vrátili sme ti 60,00 € · objednávka 42');
    expect(all[0].html).toContain('časť platby');
    expect(all[1].text).toContain('Vrátené: 67,50 €');
    expect(all[2].html).not.toContain('Vrátené');
    expect(all[3].text).toContain('pre Bodku');
    expect(all[3].html).toContain('vrece-jahna-bataty-cucoriedky.jpg');
    expect(all[4].text).toContain('Ďalšia platba: 14. 1. 2027 · 126,00 €');
    expect(all[4].text).toContain('Doprava: zadarmo');
  });
});
