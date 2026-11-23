'use server';

import { revalidatePath } from 'next/cache';
import { db } from '@lib/db';
import { OrderActionError, refundOrder } from '@lib/order-actions';
import { cancel } from '@lib/subscription-schedule';
import { adminAction, str, UserError } from '@admin/lib/action';
import { audit } from '@admin/lib/audit';
import { orderStore, stripe } from '@admin/lib/deps';
import { eur } from '@admin/lib/format';

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

/** Refund objednávky zo zmluvy; voliteľne označí odstúpenie ako vyriešené (peniaze vrátené). */
export const withdrawalRefundAction = adminAction(async (admin, fd) => {
  const id = str(fd, 'id');
  const orderId = str(fd, 'order');
  const raw = str(fd, 'amount').replace(',', '.');
  const amount = raw ? Math.round(Number(raw) * 100) : null;
  if (raw && !Number.isFinite(amount)) throw new UserError('Neplatná suma.');
  await load(id);
  const r = await refundOrder(orderId, amount, { store: await orderStore(), stripe: stripe(), reason: 'odstúpenie od zmluvy' }).catch((e) => {
    if (e instanceof OrderActionError) throw new UserError(e.message);
    throw e;
  });
  await audit(admin.email, 'order.refunded', 'order', orderId, { status: r.before }, { ...r, withdrawal: id });
  await audit(admin.email, 'withdrawal.refund', 'withdrawal', id, null, { order: orderId, amount: r.refund.amount });
  if (fd.get('resolve') === 'on') await db().from('withdrawals').update({ status: 'refunded', needs_review: false } as never).eq('id', id);
  revalidatePath(`/odstupenia/${id}`);
  return `Vrátené ${eur(r.refund.amount)}${r.full ? ' (celá platba)' : ''}.`;
});

/** Okamžité zrušenie predplatného zo zmluvy (ak ho P4 nezrušilo, napr. bez zhody e-mailu). */
export const withdrawalCancelSubAction = adminAction(async (admin, fd) => {
  const id = str(fd, 'id');
  const subId = str(fd, 'sub');
  const { data: sub } = await db().from('subscriptions').select('id, status, stripe_subscription_id').eq('id', subId).maybeSingle();
  if (!sub?.stripe_subscription_id) throw new UserError('Predplatné sa nenašlo.');
  if (sub.status === 'cancelled') throw new UserError('Predplatné už je zrušené.');
  await cancel(sub.stripe_subscription_id, 'now', stripe());
  await db().from('subscriptions').update({ status: 'cancelled' }).eq('id', sub.id);
  await audit(admin.email, 'subscription.cancel_now', 'subscription', sub.id, { status: sub.status }, { mode: 'now', withdrawal: id });
  await audit(admin.email, 'withdrawal.subscription_cancelled', 'withdrawal', id, null, { subscription: sub.id });
  revalidatePath(`/odstupenia/${id}`);
  return 'Predplatné zrušené okamžite.';
});
