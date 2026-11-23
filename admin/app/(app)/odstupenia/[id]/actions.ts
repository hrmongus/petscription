'use server';

import { revalidatePath } from 'next/cache';
import { db } from '@lib/db';
import { OrderActionError, refundOrder } from '@lib/order-actions';
import { cancel } from '@lib/subscription-schedule';
import { adminAction, str, UserError } from '@admin/lib/action';
import { audit } from '@admin/lib/audit';
import { orderStore, stripe } from '@admin/lib/deps';
import { eur } from '@admin/lib/format';
import { mailCustomer } from '@admin/lib/notify-customer';
import { refundEmail, subscriptionCancelledEmail } from '@lib/emails-admin';
import { canRefund, RETURN_CONDITION, RETURN_STATUS, type Withdrawal } from '@admin/lib/withdrawals';

const STATUSES = ['received', 'return_pending', 'refunded', 'rejected'];

async function load(id: string) {
  const { data, error } = await db().from('withdrawals').select('*').eq('id', id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new UserError('Odstúpenie neexistuje.');
  return data;
}

/** Stav a interná poznámka; uložením sa odstúpenie označí ako posúdené. */
export const statusAction = adminAction(async (admin, fd) => {
  const id = str(fd, 'id');
  const status = str(fd, 'status');
  if (!STATUSES.includes(status)) throw new UserError('Neplatný stav.');
  const w = await load(id);
  const patch = { status, review_note: str(fd, 'note') || null, needs_review: false };
  const { error } = await db().from('withdrawals').update(patch as never).eq('id', id);
  if (error) throw new Error(error.message);
  await audit(admin.email, 'withdrawal.updated', 'withdrawal', id, { status: w.status, review_note: (w as { review_note?: string }).review_note ?? null }, patch);
  revalidatePath(`/odstupenia/${id}`);
  return 'Uložené.';
});

/** Vrátenie tovaru: prijatie a stav vráteného vrecka (refund sa povolí až potom). */
export const returnAction = adminAction(async (admin, fd) => {
  const id = str(fd, 'id');
  const st = str(fd, 'return_status');
  if (!(st in RETURN_STATUS)) throw new UserError('Neplatný stav vrátenia.');
  const cond = str(fd, 'return_condition');
  if (st === 'received' && !(cond in RETURN_CONDITION)) throw new UserError('Pri prijatom tovare vyber stav vrecka.');
  const date = str(fd, 'return_received_at');
  if (st === 'received' && date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new UserError('Neplatný dátum prijatia.');
  const w = (await load(id)) as Withdrawal;
  const patch = {
    return_status: st,
    return_received_at: st === 'received' ? (date ? new Date(`${date}T12:00:00Z`).toISOString() : new Date().toISOString()) : null,
    return_condition: st === 'received' ? cond : null,
    return_note: str(fd, 'return_note') || null,
    ...(st === 'awaiting' && w.status === 'received' ? { status: 'return_pending' } : {}),
  };
  const { error } = await db().from('withdrawals').update(patch as never).eq('id', id);
  if (error) throw new Error(error.message);
  await audit(admin.email, 'withdrawal.return', 'withdrawal', id, { return_status: w.return_status ?? null, return_condition: w.return_condition ?? null }, patch);
  revalidatePath(`/odstupenia/${id}`);
  return st === 'received' ? `Tovar prijatý (${RETURN_CONDITION[cond as keyof typeof RETURN_CONDITION]}). Teraz môžeš vrátiť peniaze.` : `Uložené: ${RETURN_STATUS[st as keyof typeof RETURN_STATUS]}.`;
});

/** Refund objednávky zo zmluvy; voliteľne označí odstúpenie ako vyriešené (peniaze vrátené). */
export const withdrawalRefundAction = adminAction(async (admin, fd) => {
  const id = str(fd, 'id');
  const orderId = str(fd, 'order');
  const raw = str(fd, 'amount').replace(',', '.');
  const amount = raw ? Math.round(Number(raw) * 100) : null;
  if (raw && !Number.isFinite(amount)) throw new UserError('Neplatná suma.');
  const w = (await load(id)) as Withdrawal;
  const gate = canRefund(w);
  if (!gate.ok) throw new UserError(gate.reason);
  const r = await refundOrder(orderId, amount, { store: await orderStore(), stripe: stripe(), reason: 'odstúpenie od zmluvy' }).catch((e) => {
    if (e instanceof OrderActionError) throw new UserError(e.message);
    throw e;
  });
  await audit(admin.email, 'order.refunded', 'order', orderId, { status: r.before }, { ...r, withdrawal: id });
  await audit(admin.email, 'withdrawal.refund', 'withdrawal', id, null, { order: orderId, amount: r.refund.amount });
  const done = {
    refunded_at: new Date().toISOString(),
    refund_amount_cents: (w.refund_amount_cents ?? 0) + r.refund.amount,
    stripe_refund_id: r.refund.id,
    ...(fd.get('resolve') === 'on' ? { status: 'refunded', needs_review: false } : {}),
  };
  const { error } = await db().from('withdrawals').update(done as never).eq('id', id);
  if (error) throw new Error(error.message);
  const order = (await (await orderStore()).getOrder(orderId))!;
  const mail = await mailCustomer(admin.email, (rc) => refundEmail({ ...rc, order, refundId: r.refund.id, amountCents: r.refund.amount, full: r.full }), { customerId: order.customer_id, subscriptionId: order.subscription_id }, { type: 'order', id: orderId });
  revalidatePath(`/odstupenia/${id}`);
  return `Vrátené ${eur(r.refund.amount)}${r.full ? ' (celá platba)' : ''}.${mail}`;
});

/** Okamžité zrušenie predplatného zo zmluvy (ak ho P4 nezrušilo, napr. bez zhody e-mailu). */
export const withdrawalCancelSubAction = adminAction(async (admin, fd) => {
  const id = str(fd, 'id');
  const subId = str(fd, 'sub');
  const { data: sub } = await db().from('subscriptions').select('*').eq('id', subId).maybeSingle();
  if (!sub?.stripe_subscription_id) throw new UserError('Predplatné sa nenašlo.');
  if (sub.status === 'cancelled') throw new UserError('Predplatné už je zrušené.');
  await cancel(sub.stripe_subscription_id, 'now', stripe());
  await db().from('subscriptions').update({ status: 'cancelled' }).eq('id', sub.id);
  await audit(admin.email, 'subscription.cancel_now', 'subscription', sub.id, { status: sub.status }, { mode: 'now', withdrawal: id });
  await audit(admin.email, 'withdrawal.subscription_cancelled', 'withdrawal', id, null, { subscription: sub.id });
  const mail = await mailCustomer(admin.email, (rc) => subscriptionCancelledEmail({ ...rc, sub, mode: 'now' }), { customerId: sub.customer_id, subscriptionId: sub.id }, { type: 'subscription', id: sub.id });
  revalidatePath(`/odstupenia/${id}`);
  return `Predplatné zrušené okamžite.${mail}`;
});
