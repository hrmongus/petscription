import { db } from '@lib/db';
import type { PlanChangeInput } from '@lib/subscription-actions';
import type { BagId } from '@lib/engine-server';

/** Predplatné so psom, adresou a poslednou objednávkou (vstup pre previewPlanChange). */
export async function loadSubscription(id: string) {
  const { data: sub, error } = await db().from('subscriptions').select('*').eq('id', id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!sub) return null;
  const [dog, address, customer, last] = await Promise.all([
    db().from('dogs').select('*').eq('id', sub.dog_id).single(),
    db().from('addresses').select('*').eq('id', sub.address_id).single(),
    db().from('customers').select('*').eq('id', sub.customer_id).single(),
    db().from('orders').select('created_at').eq('subscription_id', sub.id).order('created_at', { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (!dog.data || !address.data || !customer.data) throw new Error('Chýba pes, adresa alebo zákazník predplatného.');
  return { sub, dog: dog.data, address: address.data, customer: customer.data, lastOrderAt: last.data ? new Date(last.data.created_at) : null };
}

const num = (v: FormDataEntryValue | null) => {
  const s = String(v ?? '').trim().replace(',', '.');
  return s === '' ? null : Number(s);
};

export function planInput(fd: FormData): PlanChangeInput {
  const bag = String(fd.get('bag') ?? '');
  return {
    productId: String(fd.get('product') ?? '') || null,
    bagId: (['4', '9', '18'].includes(bag) ? bag : null) as BagId | null,
    kg: num(fd.get('kg')),
    years: num(fd.get('years')),
    months: num(fd.get('months')),
  };
}
