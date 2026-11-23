import type { Tables } from '@lib/database.types';
import { addDays } from '@lib/subscription-schedule';

/*
 * Odstúpenia od zmluvy (P4 zapisuje cez /odstupenie, admin rieši). Stĺpce deadline_at, in_deadline, needs_review,
 * review_note, actions a customer_id pridala migrácia p4_withdrawals (branch p3-portal); tu sú voliteľné, kým typy
 * z P4 nie sú na main.
 */
export type Withdrawal = Tables<'withdrawals'> & {
  customer_id?: string | null;
  deadline_at?: string | null;
  in_deadline?: boolean | null;
  needs_review?: boolean | null;
  review_note?: string | null;
  actions?: { type: string; ok: boolean; order?: number; status?: string; fhb?: string; error?: string }[] | null;
};

/** Peniaze treba vrátiť do 14 dní od doručenia odstúpenia (predávajúci môže počkať na vrátenie tovaru). */
export const REFUND_DAYS = 14;

/** posledný deň lehoty (prijaté 23. 11. → 7. 12.; lehota začína plynúť nasledujúci deň) */
export function refundDeadline(w: Pick<Withdrawal, 'submitted_at'>) {
  return addDays(new Date(w.submitted_at), REFUND_DAYS);
}

/** celé dni do posledného dňa lehoty (0 = dnes je posledný deň) */
export function daysLeft(deadline: Date, now = new Date()) {
  return Math.round((addDays(deadline, 0).getTime() - addDays(now, 0).getTime()) / 86_400_000);
}

export const OPEN_STATUSES = ['received', 'return_pending'];

export function actionText(a: NonNullable<Withdrawal['actions']>[number]) {
  const err = a.ok ? '' : ` – ZLYHALO: ${a.error ?? ''}`;
  switch (a.type) {
    case 'subscription_cancelled':
      return `Predplatné zrušené${err}`;
    case 'order_cancelled':
      return `Objednávka #${a.order} stornovaná${a.fhb ? ' (zmazaná vo FHB)' : ''}${err}`;
    case 'order_in_progress':
      return `Objednávka #${a.order} sa už balí (${a.status}) → tovar sa vráti`;
    case 'order_shipped':
      return `Objednávka #${a.order} odoslaná (${a.status}) → tovar sa vráti`;
    default:
      return `${a.type}${err}`;
  }
}
