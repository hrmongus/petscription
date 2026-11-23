import { ORDER_STATUS, SUB_STATUS, WITHDRAWAL_STATUS } from '@admin/lib/format';

const LABELS: Record<string, Record<string, string>> = { order: ORDER_STATUS, sub: SUB_STATUS, withdrawal: WITHDRAWAL_STATUS };

export function Badge({ status, kind = 'order' }: { status: string; kind?: 'order' | 'sub' | 'withdrawal' }) {
  return <span className={`badge ${status}`}>{LABELS[kind][status] ?? status}</span>;
}
