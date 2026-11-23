import { resolveDelivery } from '../checkout';
import { db } from '../db';
import { findPoint, type PointService } from '../delivery-points';
import { defaultMailer } from '../email';
import { serverParams } from '../engine-server';
import { FhbClient, fhbConfigFromEnv } from '../fhb/client';
import { sendOptionsFromEnv } from '../fhb/send';
import { supabaseOrderActionStore, updateOrderDelivery } from '../order-actions';
import { stripe } from '../stripe';
import { applyPlanChange, previewPlanChange, supabaseApplyStore, syncShipping } from '../subscription-actions';
import { moveNextCharge, pause, resume } from '../subscription-schedule';
import type { ActionDeps } from './actions';

/* Závislosti akcií /ucet nad Supabase (service role), Stripe, FHB a Resend; prepočet a objednávky = spoločné funkcie s adminom. */

const one = async <T>(p: PromiseLike<{ data: T | null; error: { message: string } | null }>) => {
  const { data, error } = await p;
  if (error) throw new Error(error.message);
  return data;
};
const ok = async (p: PromiseLike<{ error: { message: string } | null }>) => {
  const { error } = await p;
  if (error) throw new Error(error.message);
};

function fhbOrNull() {
  try {
    fhbConfigFromEnv();
    return { client: FhbClient.fromEnv(), options: sendOptionsFromEnv() };
  } catch {
    return null;
  }
}

export async function actionDepsFromEnv(): Promise<ActionDeps> {
  const P = serverParams();
  const fhb = fhbOrNull();
  const applyStore = await supabaseApplyStore();
  const orderStore = await supabaseOrderActionStore();
  return {
    store: {
      getSubscription: (id) => one(db().from('subscriptions').select('*').eq('id', id).maybeSingle()),
      getDog: (id) => one(db().from('dogs').select('*').eq('id', id).maybeSingle()),
      getAddress: (id) => one(db().from('addresses').select('*').eq('id', id).maybeSingle()),
      ordersOfSubscription: async (id) => (await one(db().from('orders').select('*').eq('subscription_id', id).order('number'))) ?? [],
      updateSubscription: (id, patch) => ok(db().from('subscriptions').update(patch).eq('id', id)),
      updateCustomer: (id, patch) => ok(db().from('customers').update(patch).eq('id', id)),
      insertAddress: async (row) => (await one(db().from('addresses').insert(row).select('*').single()))!,
      audit: (row) => ok(db().from('audit_log').insert(row)),
    },
    stripe: {
      move: (id, at) => moveNextCharge(id, at),
      pause: (id) => pause(id),
      resume: (id, at) => resume(id, at),
      cancelAtPeriodEnd: (id, on) => stripe().subscriptions.update(id, { cancel_at_period_end: on }),
    },
    plan: {
      preview: (ctx, input) => previewPlanChange(ctx, input),
      apply: (ctx, p) => applyPlanChange(ctx, p, { stripe: stripe(), store: applyStore }),
      syncShipping: (sub, method) => syncShipping(sub, method, stripe()),
    },
    resolveDelivery: (d, bagId) => resolveDelivery(d, bagId),
    updateOrderDelivery: async (orderId, shipTo) => {
      if (!fhb) throw new Error('FHB nie je nastavené');
      return updateOrderDelivery(orderId, shipTo, { store: orderStore, fhb: fhb.client, fhbOptions: fhb.options });
    },
    isBox: async (method, pointId) => {
      const service: PointService | null = method === 'packeta_point' ? 'packeta' : method === 'dpd_pickup' ? 'dpd' : null;
      if (!service) return false;
      return (await findPoint(service, pointId))?.kind === 'box';
    },
    cycle: { leadDays: P.reorderLeadDays, shipDays: P.shipDays },
    mail: await defaultMailer(),
    siteUrl: process.env.NEXT_PUBLIC_SITE_URL || 'https://www.granula.sk',
  };
}
