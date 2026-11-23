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

import { canRefund, dueOf, urgency } from './withdrawals';

describe('refund až po vrátení tovaru', () => {
  it('povolený iba bez vrátenia alebo po prijatí tovaru', () => {
    expect(canRefund({ return_status: 'not_needed' }).ok).toBe(true);
    expect(canRefund({ return_status: 'received' }).ok).toBe(true);
    expect(canRefund({ return_status: 'awaiting' }).ok).toBe(false);
    expect(canRefund({ return_status: 'not_returned' }).ok).toBe(false);
    expect(canRefund({ return_status: null }).ok).toBe(true);
  });
  it('lehota z refund_due_at, zvýraznenie', () => {
    const due = dueOf({ refund_due_at: '2026-12-07T22:59:59.999Z', submitted_at: '2026-11-23T11:00:00Z' });
    expect(due.toISOString()).toBe('2026-12-07T22:59:59.999Z');
    expect(urgency(due, new Date('2026-11-30T10:00:00Z'))).toBeNull();
    expect(urgency(due, new Date('2026-12-05T10:00:00Z'))).toBe('soon');
    expect(urgency(due, new Date('2026-12-08T10:00:00Z'))).toBe('overdue');
  });
});
