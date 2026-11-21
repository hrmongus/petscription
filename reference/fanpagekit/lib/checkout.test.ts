import { describe, expect, it } from 'vitest';
import { checkoutModel, parseOrder } from './checkout';
import { PRICES } from './prices';

describe('launch price ended (full)', () => {
  it('a single pack paid once costs the list price', () => {
    const m = checkoutModel(parseOrder({ pack: 'golden-hour', plan: 'once', full: '1' }));
    expect(m.dueToday).toBe(PRICES.packWas);
    expect(m.orderWas).toBe('');
    expect(m.lines).toEqual([['Golden Hour', `$${PRICES.packWas}`]]);
  });
  it('without the flag the launch price stays', () => {
    expect(checkoutModel(parseOrder({ pack: 'golden-hour', plan: 'once' })).dueToday).toBe(PRICES.pack);
  });
  it('never touches the bundle or the monthly plan', () => {
    expect(checkoutModel(parseOrder({ pack: 'golden-hour', bundle: '1', plan: 'once', full: '1' })).dueToday).toBe(PRICES.bundle);
    expect(checkoutModel(parseOrder({ pack: 'golden-hour', plan: 'monthly', full: '1' })).dueToday).toBe(PRICES.packMonthly);
  });
});
