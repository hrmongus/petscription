'use server';

import { revalidatePath } from 'next/cache';
import type { Json } from '@lib/database.types';
import { CheckoutError, resolveDelivery } from '@lib/checkout';
import { searchPoints, getPoints, type PointService } from '@lib/delivery-points';
import { bagOfItems, cancelOrder, createReship, OrderActionError, refundOrder, updateOrderDelivery } from '@lib/order-actions';
import { adminAction, str, UserError } from '@admin/lib/action';
import { audit } from '@admin/lib/audit';
import { eur } from '@admin/lib/format';
import { mailCustomer } from '@admin/lib/notify-customer';
import { orderCancelledEmail, refundEmail } from '@lib/emails-admin';
import { fhb, orderStore, sendOptionsFromEnv, sendToFhb, stripe } from '@admin/lib/deps';
import { requireAdmin } from '@admin/lib/session';

const done = (id: string) => revalidatePath(`/objednavky/${id}`);

/** chyby z lib → správa pre admina */
function userErr(e: unknown): never {
  if (e instanceof OrderActionError || e instanceof CheckoutError) throw new UserError(e.message);
  throw e;
}

export const resendAction = adminAction(async (admin, fd) => {
  const id = str(fd, 'id');
  const r = await sendToFhb(id).catch((e) => {
    throw new UserError(`FHB teraz neodpovedá, skús znova (${(e as Error).message}).`);
  });
  await audit(admin.email, 'order.resend_fhb', 'order', id, null, r as unknown as Json);
  done(id);
  if (r.state === 'fhb_error') throw new UserError(`FHB objednávku odmietol: ${r.error.message}. Pozri chybu vyššie, oprav doručenie a skús znova.`);
  if (r.state === 'skipped') return `Nič sa neodoslalo (${r.reason}).`;
  return r.state === 'already_in_fhb' ? 'Objednávka už vo FHB bola, stav je opravený.' : 'Odoslané do FHB.';
});

export const deliveryAction = adminAction(async (admin, fd) => {
  const id = str(fd, 'id');
  const store = await orderStore();
  const order = await store.getOrder(id);
  if (!order) throw new UserError('Objednávka neexistuje.');
  const method = str(fd, 'method') as 'packeta_point' | 'dpd_pickup' | 'sps_courier';
  const { shipTo } = await resolveDelivery(
    {
      method,
      name: str(fd, 'name'),
      email: str(fd, 'email'),
      phone: str(fd, 'phone'),
      point: str(fd, 'point') ? { id: str(fd, 'point') } : null,
      address: method === 'sps_courier' ? { street: str(fd, 'street'), zip: str(fd, 'zip'), city: str(fd, 'city') } : null,
    },
    bagOfItems(order.items),
  ).catch(userErr);
  const r = await updateOrderDelivery(id, shipTo, { store, fhb: fhb(), fhbOptions: sendOptionsFromEnv() }).catch(userErr);
  await audit(admin.email, 'order.delivery_changed', 'order', id, r.before, { ship_to: shipTo, where: r.mode });
  done(id);
  return r.mode === 'fhb' ? 'Doručenie zmenené u nás aj vo FHB.' : 'Doručenie zmenené. Objednávka ešte nie je vo FHB: odošli ju tlačidlom „Znova odoslať do FHB“.';
});

export const cancelAction = adminAction(async (admin, fd) => {
  const id = str(fd, 'id');
  const store = await orderStore();
  const order = await store.getOrder(id);
  if (!order) throw new UserError('Objednávka neexistuje.');
  const r = await cancelOrder(id, { store, fhb: fhb() }).catch(userErr);
  let refunded = 0;
  await audit(admin.email, 'order.cancelled', 'order', id, { status: r.before }, { status: 'cancelled', where: r.mode });
  let msg = r.mode === 'fhb' ? 'Stornované vo FHB aj u nás.' : 'Stornované (vo FHB nebola).';
  if (fd.get('refund') === 'on') {
    try {
      const rf = await refundOrder(id, null, { store, stripe: stripe(), reason: 'storno' });
      await audit(admin.email, 'order.refunded', 'order', id, { status: 'cancelled' }, rf);
      refunded = rf.refund.amount;
      msg += ` Peniaze vrátené (${eur(rf.refund.amount)}).`;
    } catch (e) {
      msg += ` Refund zlyhal: ${(e as Error).message}`;
    }
  }
  // jeden e-mail o storne (aj s vrátenou sumou), samostatný e-mail o refunde sa pri storne neposiela
  msg += await mailCustomer(admin.email, (rc) => orderCancelledEmail({ ...rc, order, refundedCents: refunded }), { customerId: order.customer_id, subscriptionId: order.subscription_id }, { type: 'order', id });
  done(id);
  return msg;
});

export const refundAction = adminAction(async (admin, fd) => {
  const id = str(fd, 'id');
  const raw = str(fd, 'amount').replace(',', '.');
  const amount = raw ? Math.round(Number(raw) * 100) : null;
  if (raw && !Number.isFinite(amount)) throw new UserError('Neplatná suma.');
  const store = await orderStore();
  const r = await refundOrder(id, amount, { store, stripe: stripe(), reason: str(fd, 'note') }).catch(userErr);
  await audit(admin.email, 'order.refunded', 'order', id, { status: r.before }, { ...r, note: str(fd, 'note') || null });
  const order = (await store.getOrder(id))!;
  const mail = await mailCustomer(admin.email, (rc) => refundEmail({ ...rc, order, refundId: r.refund.id, amountCents: r.refund.amount, full: r.full }), { customerId: order.customer_id, subscriptionId: order.subscription_id }, { type: 'order', id });
  done(id);
  return `Vrátené ${eur(r.refund.amount)} (Stripe ${r.refund.status}).${r.full ? ' Platba je vrátená celá.' : ''}${mail}`;
});

export const reshipAction = adminAction(async (admin, fd) => {
  const id = str(fd, 'id');
  const store = await orderStore();
  const n = await createReship(id, { store }).catch(userErr);
  await audit(admin.email, 'order.reshipped', 'order', id, null, { new_order: n.id, number: n.number });
  const r = await sendToFhb(n.id).catch((e) => ({ state: 'retry', error: { message: (e as Error).message } }) as const);
  done(id);
  return { msg: `Nová objednávka #${n.number} (bez platby) ${r.state === 'sent' || r.state === 'already_in_fhb' ? 'je vo FHB' : `sa neodoslala: ${'error' in r ? r.error.message : r.state}`}.`, data: { id: n.id } };
});

/** Hľadanie výdajného miesta pre formulár doručenia. */
export async function searchPointsAction(service: PointService, q: string, boxes: boolean) {
  await requireAdmin();
  const { points } = await getPoints(service);
  return searchPoints(points, q, 20, { boxes }).map((p) => ({ id: p.id, label: `${p.name}, ${p.street}, ${p.zip} ${p.city}`, kind: p.kind }));
}
