import { describe, expect, it } from 'vitest';
import { daysLeft, refundDeadline } from './withdrawals';

describe('lehota na vrátenie peňazí pri odstúpení', () => {
  it('prijaté 23. 11. → posledný deň 7. 12., v deň prijatia zostáva 14 dní', () => {
    const d = refundDeadline({ submitted_at: '2026-11-23T10:25:00Z' });
    expect(d.toISOString().slice(0, 10)).toBe('2026-12-07');
    expect(daysLeft(d, new Date('2026-11-23T18:00:00Z'))).toBe(14);
    expect(daysLeft(d, new Date('2026-12-07T20:00:00Z'))).toBe(0);
    expect(daysLeft(d, new Date('2026-12-09T08:00:00Z'))).toBe(-2);
  });
});
