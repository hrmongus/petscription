/*
 * Overenie cyklu predplatného na Stripe test clocks (PROJEKT-1, krok 4; SPEC §1):
 *   1. predplatné s intervalom D dní (ako Checkout), prvá platba hneď,
 *   2. trial_end na prvé obnovenie (ako webhook checkout.session.completed),
 *   3. posun hodín na prvé obnovenie → nová faktúra (billing_reason, suma),
 *   4. zmena D a ceny jedným update (changePlan) → NESMIE vzniknúť okamžitá platba,
 *   5. posun na nový dátum → platba podľa nového intervalu.
 *   npx tsx scripts/stripe-test-clock.ts
 * Beží IBA s test kľúčom (sk_test_…); všetko vytvára na test clocku, ktorý sa na konci zmaže.
 */
import Stripe from 'stripe';
import { stripeMode } from '../lib/env-mode';
import { addDays, changePlan, chargeTime, estimatedDelivery, firstRenewal } from '../lib/subscription-schedule';

const C = { leadDays: 7, shipDays: 3 };
const D1 = 37, D2 = 45;
const unix = (d: Date) => Math.floor(d.getTime() / 1000);
const fmt = (s: number | null | undefined) => (s ? new Date(s * 1000).toISOString().slice(0, 16).replace('T', ' ') : '—');

async function advance(s: Stripe, clockId: string, to: Date) {
  await s.testHelpers.testClocks.advance(clockId, { frozen_time: unix(to) });
  for (let i = 0; i < 60; i++) {
    const c = await s.testHelpers.testClocks.retrieve(clockId);
    if (c.status === 'ready') return;
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error('test clock sa nedostal do stavu ready');
}

async function invoices(s: Stripe, sub: string) {
  return (await s.invoices.list({ subscription: sub, limit: 20 })).data.map((i) => `${i.billing_reason} ${i.status} ${(i.amount_paid / 100).toFixed(2)} € @ ${fmt(i.created)}`);
}

async function main() {
  if (stripeMode() !== 'test') throw new Error('Iba so Stripe TEST kľúčom (STRIPE_SECRET_KEY=sk_test_…).');
  const s = new Stripe(process.env.STRIPE_SECRET_KEY!);
  const start = new Date(Date.UTC(2027, 0, 4, 10)); // pondelok 10:00 UTC
  const clock = await s.testHelpers.testClocks.create({ frozen_time: unix(start), name: 'granula cyklus' });
  console.log('test clock', clock.id, 'štart', start.toISOString());
  try {
    const customer = await s.customers.create({ test_clock: clock.id, email: 'test-clock@granula.sk', metadata: { app: 'granula' } });
    const pm = await s.paymentMethods.attach('pm_card_visa', { customer: customer.id });
    await s.customers.update(customer.id, { invoice_settings: { default_payment_method: pm.id } });
    const food = await s.products.create({ name: 'TEST krmivo 9 kg', metadata: { app: 'granula' } });
    const ship = await s.products.create({ name: 'TEST doprava', metadata: { app: 'granula' } });
    const rec = (n: number) => ({ interval: 'day' as const, interval_count: n });

    // 1. predplatné ako z Checkoutu: prvá platba hneď
    const sub = await s.subscriptions.create({
      customer: customer.id,
      items: [{ price_data: { currency: 'eur', product: food.id, unit_amount: 6750, recurring: rec(D1) } }, { price_data: { currency: 'eur', product: ship.id, unit_amount: 490, recurring: rec(D1) } }],
      metadata: { app: 'granula' },
    });
    console.log('1. vytvorené', sub.id, sub.status, '| faktúry:', await invoices(s, sub.id));

    // 2. trial_end na prvé obnovenie (doručenie odhad +3, + D − 7)
    const first = firstRenewal({ deliveredAt: estimatedDelivery(start, C), days: D1, ...C, now: start });
    await s.subscriptions.update(sub.id, { trial_end: unix(first), proration_behavior: 'none' });
    console.log('2. trial_end', first.toISOString(), '| faktúry:', await invoices(s, sub.id));

    // 3. posun na prvé obnovenie
    await advance(s, clock.id, new Date(first.getTime() + 3600_000));
    console.log('3. po prvom obnovení | faktúry:', await invoices(s, sub.id));
    const afterRenewal = await s.subscriptions.retrieve(sub.id);
    console.log('   stav', afterRenewal.status, '| ďalšia platba', fmt(afterRenewal.items.data[0].current_period_end));

    // 4. zmena D a ceny v jednom update → žiadna okamžitá platba
    const before = (await s.invoices.list({ subscription: sub.id, limit: 20 })).data.length;
    const next = chargeTime(addDays(first, D2));
    await changePlan(sub.id, { productId: food.id, unitAmountCents: 6900, days: D2, shippingCents: 490, shippingProductId: ship.id, nextCharge: next }, s);
    const after = (await s.invoices.list({ subscription: sub.id, limit: 20 })).data.length;
    console.log(`4. zmena D ${D1} → ${D2}, cena 69,00 € | nové faktúry hneď: ${after - before} (má byť 0) | ďalšia platba`, next.toISOString());

    // 5. posun na nový dátum
    await advance(s, clock.id, new Date(next.getTime() + 3600_000));
    const last = (await s.invoices.list({ subscription: sub.id, limit: 1 })).data[0];
    console.log('5. po novom dátume | posledná faktúra:', last.billing_reason, last.status, (last.amount_paid / 100).toFixed(2), '€ @', fmt(last.created));
    console.log('   všetky faktúry:', await invoices(s, sub.id));
  } finally {
    await s.testHelpers.testClocks.del(clock.id);
    console.log('test clock zmazaný');
  }
}

main().catch((e) => {
  console.error('CHYBA:', e?.message ?? e);
  process.exit(1);
});
