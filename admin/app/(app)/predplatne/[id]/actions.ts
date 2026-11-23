'use server';

import { revalidatePath } from 'next/cache';
import type { Json } from '@lib/database.types';
import { CheckoutError, resolveDelivery } from '@lib/checkout';
import { db } from '@lib/db';
import type { BagId } from '@lib/engine-server';
import { applyPlanChange, PlanChangeError, previewPlanChange, supabaseApplyStore, syncShipping } from '@lib/subscription-actions';
import { addDays, cancel, chargeTime, moveNextCharge, pause, resume, skipDelivery, skippedCharge } from '@lib/subscription-schedule';
import { adminAction, str, UserError } from '@admin/lib/action';
import { audit } from '@admin/lib/audit';
import { cycle, stripe } from '@admin/lib/deps';
import { day, eur, productName } from '@admin/lib/format';
import { loadSubscription, planInput } from '@admin/lib/subscription';
import { mailCustomer } from '@admin/lib/notify-customer';
import { subscriptionCancelledEmail, subscriptionChangedEmail } from '@lib/emails-admin';

const done = (id: string) => revalidatePath(`/predplatne/${id}`);

async function ctx(fd: FormData) {
  const c = await loadSubscription(str(fd, 'id'));
  if (!c) throw new UserError('Predplatné neexistuje.');
  if (!c.sub.stripe_subscription_id) throw new UserError('Predplatné nemá Stripe id.');
  return { ...c, sid: c.sub.stripe_subscription_id };
}

/** dátum z formulára (YYYY-MM-DD) → platba v ten deň o 06:00 UTC; najskôr zajtra */
function chargeDate(v: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new UserError('Zadaj dátum.');
  const at = chargeTime(new Date(`${v}T00:00:00Z`));
  if (at < chargeTime(addDays(new Date(), 1))) throw new UserError('Dátum musí byť najskôr zajtra.');
  if (at > addDays(new Date(), 365)) throw new UserError('Najviac o rok.');
  return at;
}

const userErr = (e: unknown): never => {
  if (e instanceof PlanChangeError || e instanceof CheckoutError) throw new UserError(e.message);
  throw e;
};

export const moveAction = adminAction(async (admin, fd) => {
  const c = await ctx(fd);
  const at = chargeDate(str(fd, 'date'));
  await moveNextCharge(c.sid, at, stripe());
  await db().from('subscriptions').update({ next_charge_at: at.toISOString() }).eq('id', c.sub.id);
  await audit(admin.email, 'subscription.moved', 'subscription', c.sub.id, { next_charge_at: c.sub.next_charge_at }, { next_charge_at: at.toISOString() });
  done(c.sub.id);
  return `Ďalšia platba presunutá na ${day(at)}.`;
});

export const skipAction = adminAction(async (admin, fd) => {
  const c = await ctx(fd);
  if (!c.sub.next_charge_at) throw new UserError('Predplatné nemá naplánovanú platbu.');
  const planned = new Date(c.sub.next_charge_at);
  const next = skippedCharge(planned, c.sub.days_per_bag);
  await skipDelivery(c.sid, planned, c.sub.days_per_bag, stripe());
  await db().from('subscriptions').update({ next_charge_at: next.toISOString() }).eq('id', c.sub.id);
  await audit(admin.email, 'subscription.skipped', 'subscription', c.sub.id, { next_charge_at: c.sub.next_charge_at }, { next_charge_at: next.toISOString() });
  done(c.sub.id);
  return `Dodávka preskočená, ďalšia platba ${day(next)}.`;
});

export const pauseAction = adminAction(async (admin, fd) => {
  const c = await ctx(fd);
  if (c.sub.status === 'cancelled') throw new UserError('Predplatné je zrušené.');
  const until = str(fd, 'until') ? chargeDate(str(fd, 'until')) : undefined;
  await pause(c.sid, until, stripe());
  await db().from('subscriptions').update({ status: 'paused' }).eq('id', c.sub.id);
  await audit(admin.email, 'subscription.paused', 'subscription', c.sub.id, { status: c.sub.status }, { status: 'paused', resumes_at: until?.toISOString() ?? null });
  done(c.sub.id);
  return until ? `Pozastavené do ${day(until)}.` : 'Pozastavené (bez dátumu obnovenia).';
});

export const resumeAction = adminAction(async (admin, fd) => {
  const c = await ctx(fd);
  const at = chargeDate(str(fd, 'date'));
  await resume(c.sid, at, stripe());
  await db().from('subscriptions').update({ status: 'active', next_charge_at: at.toISOString() }).eq('id', c.sub.id);
  await audit(admin.email, 'subscription.resumed', 'subscription', c.sub.id, { status: c.sub.status }, { status: 'active', next_charge_at: at.toISOString() });
  done(c.sub.id);
  return `Obnovené, ďalšia platba ${day(at)}.`;
});

export const cancelAction = adminAction(async (admin, fd) => {
  const c = await ctx(fd);
  const mode = str(fd, 'mode') === 'now' ? 'now' : 'period_end';
  await cancel(c.sid, mode, stripe());
  if (mode === 'now') await db().from('subscriptions').update({ status: 'cancelled' }).eq('id', c.sub.id);
  await audit(admin.email, `subscription.cancel_${mode}`, 'subscription', c.sub.id, { status: c.sub.status }, { mode, reason: str(fd, 'reason') || null });
  const mail = await mailCustomer(admin.email, (rc) => subscriptionCancelledEmail({ ...rc, sub: c.sub, mode }), { customerId: c.sub.customer_id, subscriptionId: c.sub.id }, { type: 'subscription', id: c.sub.id });
  done(c.sub.id);
  return (mode === 'now' ? 'Predplatné zrušené okamžite.' : `Predplatné sa zruší pred ďalšou platbou (${day(c.sub.next_charge_at)}); ďalšia platba už neprebehne.`) + mail;
});

export const uncancelAction = adminAction(async (admin, fd) => {
  const c = await ctx(fd);
  await stripe().subscriptions.update(c.sid, { cancel_at_period_end: false });
  await audit(admin.email, 'subscription.cancel_reverted', 'subscription', c.sub.id);
  done(c.sub.id);
  return 'Zrušenie odvolané, predplatné pokračuje.';
});

/** Náhľad prepočtu (nič nemení). */
export const previewAction = adminAction(async (_admin, fd) => {
  const c = await ctx(fd);
  const p = (() => {
    try {
      return previewPlanChange({ ...c, cycle: cycle() }, planInput(fd));
    } catch (e) {
      return userErr(e);
    }
  })();
  const q = p.quote;
  return {
    msg: p.changed ? 'Náhľad je pripravený, skontroluj a potvrď.' : 'Výpočet vychádza rovnako, nič sa nezmení.',
    data: {
      changed: p.changed,
      rows: [
        ['Receptúra', productName(p.before.productId), `${productName(q.productId)}${q.eligible ? '' : ' (menej vhodná)'}`],
        ['Balenie', `${p.before.bagId} kg`, `${q.bagId} kg`],
        ['Dávka', `${p.before.grams} g/deň`, `${q.gramsPerDay} g/deň`],
        ['D (interval)', `${p.before.days} dní`, `${q.daysPerBag} dní`],
        ['Cena vreca', eur(p.before.unitCents), eur(q.unitAmountCents)],
        ['Doprava', '', eur(p.shippingCents)],
        ['Ďalšia platba', day(c.sub.next_charge_at), `${day(p.nextCharge)}${p.daysChanged ? ` (doručenie ${day(p.lastDelivery)} + ${q.daysPerBag} − ${q.leadDays})` : ''}`],
      ],
    },
  };
});

export const applyAction = adminAction(async (admin, fd) => {
  const c = await ctx(fd);
  let p;
  try {
    p = previewPlanChange({ ...c, cycle: cycle() }, planInput(fd));
  } catch (e) {
    userErr(e);
  }
  if (!p!.changed) throw new UserError('Nič sa nemení.');
  await applyPlanChange({ sub: c.sub, dog: c.dog }, p!, { stripe: stripe(), store: await supabaseApplyStore() });
  const q = p!.quote;
  await audit(admin.email, 'subscription.plan_changed', 'subscription', c.sub.id, { ...p!.before, next_charge_at: c.sub.next_charge_at, kg: (c.dog.answers as { kg?: number }).kg }, { productId: q.productId, bagId: q.bagId, grams: q.gramsPerDay, days: q.daysPerBag, unitCents: q.unitAmountCents, shippingCents: p!.shippingCents, next_charge_at: p!.nextCharge.toISOString(), kg: p!.answers.kg, input: planInput(fd) } as Json);
  const changed = { ...c.sub, product_id: q.productId, bag_id: q.bagId, grams_per_day: q.gramsPerDay, days_per_bag: q.daysPerBag, unit_amount_cents: q.unitAmountCents };
  const mail = await mailCustomer(admin.email, (rc) => subscriptionChangedEmail({ ...rc, dog: { name: c.dog.name, sex: (p!.answers as { sex?: string }).sex ?? null }, sub: changed, shippingCents: p!.shippingCents, nextCharge: p!.nextCharge }), { customerId: c.sub.customer_id, subscriptionId: c.sub.id }, { type: 'subscription', id: c.sub.id });
  done(c.sub.id);
  return `Zmenené: ${productName(q.productId)} ${q.bagId} kg, ${q.gramsPerDay} g/deň, každých ${q.daysPerBag} dní za ${eur(q.unitAmountCents + p!.shippingCents)}. Ďalšia platba ${day(p!.nextCharge)}.${mail}`;
});

/** Nová adresa pre ďalšie dodávky (nový riadok addresses, predplatné naň ukáže). Už vytvorené objednávky sa nemenia. */
export const addressAction = adminAction(async (admin, fd) => {
  const c = await ctx(fd);
  const method = str(fd, 'method') as 'packeta_point' | 'dpd_pickup' | 'sps_courier';
  const { shipTo } = await resolveDelivery(
    { method, name: str(fd, 'name'), email: c.customer.email, phone: str(fd, 'phone'), point: str(fd, 'point') ? { id: str(fd, 'point') } : null, address: method === 'sps_courier' ? { street: str(fd, 'street'), zip: str(fd, 'zip'), city: str(fd, 'city') } : null },
    c.sub.bag_id as BagId,
  ).catch(userErr);
  const pickup = method !== 'sps_courier';
  const { data: addr, error } = await db()
    .from('addresses')
    .insert({
      customer_id: c.customer.id,
      name: shipTo.name,
      street: pickup ? shipTo.point_address?.street ?? null : shipTo.street ?? null,
      city: pickup ? shipTo.point_address?.city ?? null : shipTo.city ?? null,
      zip: pickup ? shipTo.point_address?.zip ?? null : shipTo.zip ?? null,
      country: 'SK',
      carrier: method === 'packeta_point' ? 'packeta' : method === 'dpd_pickup' ? 'dpd' : 'sps',
      delivery_method: method,
      point_id: shipTo.point_id ?? null,
      point_label: shipTo.point_label ?? null,
    })
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  const ship = await syncShipping(c.sub, method, stripe()).catch(userErr);
  await db().from('subscriptions').update({ address_id: addr.id }).eq('id', c.sub.id);
  if (shipTo.phone !== c.customer.phone) await db().from('customers').update({ phone: shipTo.phone }).eq('id', c.customer.id);
  await audit(admin.email, 'subscription.address_changed', 'subscription', c.sub.id, c.address, { ...addr, shipping_cents: ship });
  done(c.sub.id);
  return `Adresa pre ďalšie dodávky zmenená${ship.changed ? `, doprava ${eur(ship.before)} → ${eur(ship.after)}` : ''}. Objednávky, ktoré už vznikli, uprav v ich detaile.`;
});
