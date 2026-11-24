/*
 * Pripomienka pred platbou predplatného (SPEC P5: „3 dni pred platbou: posunúť / preskočiť“). Denný cron
 * /api/cron/reminders: aktívne predplatné s platbou o 24–72 h → email (kľúč predplatné + deň platby v email_log,
 * takže sa nepošle dvakrát a po posune dátumu príde nová). Ak cron jeden deň vynechá, pripomienka príde deň neskôr.
 * Nie hneď po kúpe: predplatné mladšie ako 4 dni sa preskočí (potvrdenie objednávky už dátum platby uvádza).
 */
import type { Tables } from './database.types';
import { shippingPrice, type DeliveryMethod } from './carriers';
import type { Mailer } from './email';
import { renewalReminderEmail } from './emails';
import { serverParams, type BagId } from './engine-server';

const H = 3_600_000;
export const REMINDER_WINDOW = { minH: 24, maxH: 72, minAgeH: 96 };

type Sub = Pick<Tables<'subscriptions'>, 'id' | 'status' | 'next_charge_at' | 'created_at'>;

export function dueForReminder<T extends Sub>(subs: T[], now: Date): T[] {
  return subs.filter((s) => {
    if (s.status !== 'active' || !s.next_charge_at) return false;
    const inH = (Date.parse(s.next_charge_at) - now.getTime()) / H;
    const ageH = (now.getTime() - Date.parse(s.created_at)) / H;
    return inH > REMINDER_WINDOW.minH && inH <= REMINDER_WINDOW.maxH && ageH >= REMINDER_WINDOW.minAgeH;
  });
}

export async function sendRenewalReminders(deps: { mail: Mailer; siteUrl: string; now?: () => Date }) {
  const { db } = await import('./db');
  const now = deps.now?.() ?? new Date();
  const from = new Date(now.getTime() + REMINDER_WINDOW.minH * H).toISOString();
  const to = new Date(now.getTime() + REMINDER_WINDOW.maxH * H).toISOString();
  const { data, error } = await db()
    .from('subscriptions')
    .select('*, customers(email, name), dogs(name, answers), addresses(*)')
    .eq('status', 'active')
    .gt('next_charge_at', from)
    .lte('next_charge_at', to);
  if (error) throw new Error(error.message);
  const P = serverParams() as unknown as { shipping: number };
  const out: { subscription: string; result: string }[] = [];
  for (const s of dueForReminder(data ?? [], now)) {
    const c = s.customers as unknown as { email: string; name: string | null } | null;
    const d = s.dogs as unknown as { name: string; answers: { sex?: string } | null } | null;
    const a = s.addresses as unknown as Tables<'addresses'> | null;
    if (!c?.email || !a) continue;
    const pickup = a.delivery_method !== 'sps_courier';
    const shipTo = { delivery_method: a.delivery_method, point_label: a.point_label, street: a.street, city: a.city, zip: a.zip, point_address: pickup && a.point_street ? { street: a.point_street, city: a.point_city ?? '', zip: a.point_zip ?? '' } : null };
    const shippingCents = Math.round(shippingPrice(a.delivery_method as DeliveryMethod, s.bag_id as BagId, P.shipping, 'mesiac') * 100);
    try {
      const r = await deps.mail(
        renewalReminderEmail({
          subscriptionId: s.id,
          to: c.email,
          name: c.name,
          dog: d ? { name: d.name, sex: d.answers?.sex ?? null } : null,
          siteUrl: deps.siteUrl,
          product: { productId: s.product_id, bagId: s.bag_id, days: s.days_per_bag },
          nextCharge: new Date(s.next_charge_at!),
          foodCents: s.unit_amount_cents,
          shippingCents,
          shipTo,
        }),
      );
      out.push({ subscription: s.id, result: r });
    } catch (e) {
      out.push({ subscription: s.id, result: `chyba: ${(e as Error).message}` });
    }
  }
  return out;
}
