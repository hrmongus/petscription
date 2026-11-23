import { describe, expect, test } from 'vitest';
import { dailyUnits, lowStock } from './stock';
import { cronAuth, safeEqual } from './secret';

describe('sklad', () => {
  test('spotreba: 18 kg = 2 × 9 kg, pauza a zrušené sa nerátajú', () => {
    const u = dailyUnits([
      { product_id: 'hovadzie', bag_id: '9', days_per_bag: 30, status: 'active' },
      { product_id: 'hovadzie', bag_id: '18', days_per_bag: 60, status: 'active' },
      { product_id: 'jahna', bag_id: '4', days_per_bag: 20, status: 'paused' },
    ]);
    expect(u.get('GRAN-hovadzie-9')).toBeCloseTo(1 / 30 + 2 / 60);
    expect(u.has('GRAN-jahna-4')).toBe(false);
  });
  test('nízky sklad: free_quantity pod 35 dňami spotreby; sady a nepredávané sa ignorujú', () => {
    const per = new Map([['GRAN-hovadzie-9', 1], ['GRAN-jahna-4', 0.1]]);
    const low = lowStock([{ id: 'GRAN-hovadzie-9', free_quantity: 20 }, { id: 'GRAN-jahna-4', free_quantity: 10 }, { id: 'GRAN-hovadzie-18', free_quantity: 0, type: 'multi' }, { id: '000000', free_quantity: 0 }], per);
    expect(low).toEqual([{ sku: 'GRAN-hovadzie-9', free: 20, perDay: 1, threshold: 35, coverDays: 20 }]);
  });
});

describe('tajomstvá', () => {
  test('safeEqual a cronAuth', () => {
    expect(safeEqual('a', 'a')).toBe(true);
    expect(safeEqual('a', 'b')).toBe(false);
    expect(safeEqual(null, 'a')).toBe(false);
    const req = (h?: string) => new Request('https://x/api/cron/fhb-orders', { headers: h ? { authorization: h } : {} });
    expect(cronAuth(req('Bearer s'), {})?.status).toBe(503);
    expect(cronAuth(req(), { CRON_SECRET: 's' })?.status).toBe(401);
    expect(cronAuth(req('Bearer x'), { CRON_SECRET: 's' })?.status).toBe(401);
    expect(cronAuth(req('Bearer s'), { CRON_SECRET: 's' })).toBeNull();
  });
});
