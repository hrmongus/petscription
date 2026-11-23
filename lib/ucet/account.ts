import type { SupabaseClient } from '@supabase/supabase-js';
import { METHODS, type DeliveryMethod } from '../carriers';
import type { Database, Tables } from '../database.types';
import { dogCases } from '../dog-name';
import { withdrawalDeadline } from '../withdrawal';
import { currentShippingCents } from './actions';
import { productName } from './plan';

/*
 * Údaje pre stránku /ucet (GET /api/ucet/ja). Čítanie klientom s JWT zákazníka → RLS (iba vlastné riadky).
 * Pohľad (accountView) je čistá funkcia nad riadkami DB, testuje sa zvlášť.
 */

type Sub = Tables<'subscriptions'>;
type Order = Tables<'orders'>;
type W = Tables<'withdrawals'>;

const STATUS: Record<string, string> = {
  paid: 'Pripravujeme',
  fhb_error: 'Pripravujeme',
  sent_to_fhb: 'Pripravujeme',
  confirmed: 'Balí sa',
  sent: 'Na ceste',
  delivered: 'Doručené',
  returned: 'Vrátené',
  cancelled: 'Zrušené',
  refunded: 'Peniaze vrátené',
};
const SUB_STATUS: Record<string, string> = { active: 'Aktívne', paused: 'Pozastavené', past_due: 'Platba neprešla', cancelled: 'Zrušené' };

export type AccountRows = {
  customer: Tables<'customers'>;
  subscriptions: Sub[];
  dogs: Tables<'dogs'>[];
  addresses: Tables<'addresses'>[];
  orders: Order[];
  withdrawals: W[];
};

export async function loadAccount(sb: SupabaseClient<Database>, customer: Tables<'customers'>): Promise<AccountRows> {
  const q = async <T>(p: PromiseLike<{ data: T[] | null; error: { message: string } | null }>) => {
    const { data, error } = await p;
    if (error) throw new Error(error.message);
    return data ?? [];
  };
  const [subscriptions, dogs, addresses, orders, withdrawals] = await Promise.all([
    q(sb.from('subscriptions').select('*').eq('customer_id', customer.id).order('created_at', { ascending: false })),
    q(sb.from('dogs').select('*').eq('customer_id', customer.id)),
    q(sb.from('addresses').select('*').eq('customer_id', customer.id)),
    q(sb.from('orders').select('*').eq('customer_id', customer.id).order('number', { ascending: false }).limit(50)),
    q(sb.from('withdrawals').select('*').eq('customer_id', customer.id)),
  ]);
  return { customer, subscriptions, dogs, addresses, orders, withdrawals };
}

/** Odstúpenie v /ucet: objednávka (zmluva) v lehote 14 dní od prevzatia prvého tovaru a bez odstúpenia. */
export function withdrawalInfo(order: Order, all: Order[], withdrawals: W[], now: Date): { eligible: boolean; deadline: string | null } {
  if (['cancelled', 'refunded', 'returned'].includes(order.status)) return { eligible: false, deadline: null };
  const contract = order.subscription_id ? all.filter((o) => o.subscription_id === order.subscription_id) : [order];
  if (withdrawals.some((w) => w.order_id === order.id || (order.subscription_id && w.subscription_id === order.subscription_id))) return { eligible: false, deadline: null };
  const first = contract.map((o) => o.delivered_at).filter((d): d is string => !!d).sort()[0];
  const deadline = first ? withdrawalDeadline(new Date(first)) : null;
  // pri predplatnom iba posledná objednávka zmluvy (tlačidlo raz na zmluvu)
  if (order.subscription_id) {
    const latest = contract.filter((o) => !['cancelled', 'refunded'].includes(o.status)).sort((a, b) => b.number - a.number)[0];
    if (latest?.id !== order.id) return { eligible: false, deadline: deadline?.toISOString() ?? null };
  }
  return { eligible: !deadline || now <= deadline, deadline: deadline?.toISOString() ?? null };
}

function deliveryText(a: Tables<'addresses'> | undefined) {
  if (!a) return { method: null, label: '', address: '' };
  const m = a.delivery_method as DeliveryMethod;
  const address = m === 'sps_courier' ? `${a.street ?? ''}, ${a.zip ?? ''} ${a.city ?? ''}`.trim() : a.point_label || `${a.street ?? ''}, ${a.zip ?? ''} ${a.city ?? ''}`;
  return { method: m, label: METHODS[m]?.label ?? m, address, pointId: a.point_id, name: a.name };
}

export function accountView(r: AccountRows, now = new Date()) {
  const dogs = new Map(r.dogs.map((d) => [d.id, d]));
  const addresses = new Map(r.addresses.map((a) => [a.id, a]));
  const visibleSubs = r.subscriptions.filter((s) => s.stripe_subscription_id);
  const subscriptions = visibleSubs.map((s) => {
    const dog = dogs.get(s.dog_id);
    const addr = addresses.get(s.address_id);
    const subOrders = r.orders.filter((o) => o.subscription_id === s.id);
    const open = subOrders.filter((o) => ['paid', 'fhb_error', 'sent_to_fhb', 'confirmed'].includes(o.status)).sort((a, b) => b.number - a.number)[0];
    const answers = (dog?.answers ?? {}) as { sex?: string };
    const shippingCents = addr ? currentShippingCents(addr.delivery_method as DeliveryMethod, s.bag_id) : 0;
    return {
      id: s.id,
      status: s.status,
      statusText: s.cancel_at && s.status !== 'cancelled' ? 'Zrušené ku koncu obdobia' : SUB_STATUS[s.status] ?? s.status,
      dog: dog ? { name: dogCases(dog.name, answers.sex).nom, kg: dog.weight_kg != null ? Number(dog.weight_kg) : null } : null,
      productId: s.product_id,
      productName: productName(s.product_id),
      bagId: s.bag_id,
      gramsPerDay: s.grams_per_day,
      daysPerBag: s.days_per_bag,
      unitAmountCents: s.unit_amount_cents,
      shippingCents,
      totalCents: s.unit_amount_cents + shippingCents,
      nextChargeAt: s.status === 'cancelled' ? null : s.next_charge_at,
      cancelAt: s.cancel_at,
      delivery: deliveryText(addr),
      openOrder: open ? { number: open.number, status: open.status, packing: open.status === 'confirmed' } : null,
      canEdit: ['active', 'paused'].includes(s.status) && !s.cancel_at,
    };
  });
  const orders = r.orders
    .filter((o) => o.status !== 'cancelled' || r.withdrawals.some((w) => w.order_id === o.id))
    .map((o) => {
      const tracking = (o.tracking ?? {}) as { links?: string[]; numbers?: string[] };
      const w = withdrawalInfo(o, r.orders, r.withdrawals, now);
      const withdrawn = r.withdrawals.find((x) => x.order_id === o.id || (o.subscription_id && x.subscription_id === o.subscription_id));
      return {
        number: o.number,
        kind: o.kind,
        createdAt: o.created_at,
        amountCents: o.amount_cents,
        status: o.status,
        statusText: STATUS[o.status] ?? o.status,
        product: productOfItems(o.items),
        trackingUrl: tracking.links?.[0] ?? null,
        deliveredAt: o.delivered_at,
        withdrawal: { eligible: w.eligible, deadline: w.deadline, submittedAt: withdrawn?.submitted_at ?? null },
      };
    });
  return {
    customer: { name: r.customer.name, email: r.customer.email, phone: r.customer.phone, hasStripe: !!r.customer.stripe_customer_id },
    subscriptions,
    orders,
    hasSubscription: visibleSubs.some((s) => s.status !== 'cancelled'),
  };
}

function productOfItems(items: unknown) {
  const sku = (Array.isArray(items) ? (items as { sku: string }[]) : [])[0]?.sku ?? '';
  const m = /^GRAN-(.+)-(4|9|18)$/.exec(sku);
  return m ? `${productName(m[1])}, ${m[2]} kg` : sku;
}
