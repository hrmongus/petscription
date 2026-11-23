import type { Tables } from '@lib/database.types';
import { addDays } from '@lib/subscription-schedule';

/*
 * Odstúpenia od zmluvy (P4 zapisuje cez /odstupenie, admin rieši). Stĺpce deadline_at, in_deadline, needs_review,
 * review_note, actions a customer_id pridala migrácia p4_withdrawals, refund_due_at, return_* a refunded_at /
 * refund_amount_cents / stripe_refund_id migrácia p4_withdrawal_refund (branch p3-portal); tu sú voliteľné, kým typy
 * z P4 nie sú na main.
 */
export type Withdrawal = Tables<'withdrawals'> & {
  customer_id?: string | null;
  deadline_at?: string | null;
  in_deadline?: boolean | null;
  needs_review?: boolean | null;
  review_note?: string | null;
  actions?: { type: string; ok: boolean; order?: number; status?: string; fhb?: string; error?: string }[] | null;
  refund_due_at?: string | null;
  return_status?: ReturnStatus | null;
  return_received_at?: string | null;
  return_condition?: ReturnCondition | null;
  return_note?: string | null;
  refunded_at?: string | null;
  refund_amount_cents?: number | null;
  stripe_refund_id?: string | null;
};

export type ReturnStatus = 'not_needed' | 'awaiting' | 'received' | 'not_returned';
export type ReturnCondition = 'ok' | 'opened' | 'damaged';

export const RETURN_STATUS: Record<ReturnStatus, string> = {
  not_needed: 'Netreba vracať',
  awaiting: 'Čakáme na vrátenie',
  received: 'Tovar prijatý',
  not_returned: 'Tovar nevrátený',
};
export const RETURN_CONDITION: Record<ReturnCondition, string> = { ok: 'v poriadku (neotvorené)', opened: 'otvorené', damaged: 'poškodené' };

/**
 * Refund až po vrátení tovaru: povolený, keď vrátenie netreba (napr. storno pred odoslaním) alebo je tovar prijatý.
 * Pri čakaní na tovar alebo nevrátenom tovare nie (predávajúci môže refund zadržať do vrátenia).
 */
export function canRefund(w: Pick<Withdrawal, 'return_status'>): { ok: boolean; reason: string } {
  const st = w.return_status ?? 'not_needed';
  if (st === 'not_needed' || st === 'received') return { ok: true, reason: '' };
  if (st === 'awaiting') return { ok: false, reason: 'Najprv zapíš prijatie vráteného tovaru (stav vrecka), potom vráť peniaze.' };
  return { ok: false, reason: 'Tovar je označený ako nevrátený. Ak ho napokon zákazník vrátil, zmeň stav vrátenia na „Tovar prijatý“.' };
}

/** lehota na refund: refund_due_at z P4, inak 14 dní od prijatia odstúpenia */
export function dueOf(w: Pick<Withdrawal, 'refund_due_at' | 'submitted_at'>) {
  return w.refund_due_at ? new Date(w.refund_due_at) : refundDeadline(w);
}

/** stupeň naliehavosti pre zvýraznenie: prešvihnuté, ≤ 3 dni, inak nič */
export function urgency(due: Date, now = new Date()): 'overdue' | 'soon' | null {
  const d = daysLeft(due, now);
  return d < 0 ? 'overdue' : d <= 3 ? 'soon' : null;
}

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
