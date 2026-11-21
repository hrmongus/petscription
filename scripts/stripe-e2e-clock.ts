/*
 * End-to-end overenie obnovenia predplatného na Stripe test clocku cez SKUTOČNÚ cestu nákupu (PROJEKT-1, krok 4):
 *   1. test clock (štart = teraz) + Stripe zákazník na ňom; zákazník v DB s týmto stripe_customer_id,
 *   2. POST <site>/api/checkout s ?test tokenom → draft pes/adresa v DB + Embedded Checkout Session (produkčný kód),
 *   3. zaplatenie kartou 4242 v Embedded Checkout (Playwright, lokálna stránka so stripe.js),
 *   4. produkčný webhook checkout.session.completed → predplatné + objednávka `first` v Supabase → FHB sandbox,
 *      trial_end = prvé obnovenie (doručenie + D − LEAD),
 *   5. posun hodín za prvé obnovenie → invoice.paid (subscription_cycle) → objednávka `renewal` v Supabase → FHB.
 *
 *   npx tsx scripts/stripe-e2e-clock.ts [--site=https://www.granula.sk] [--keep-clock] [--no-delivery] [--fail-renewal]
 *   4b (predvolene): SIMULÁCIA stavov FHB (odoslané, doručené o 5 dní) cez applyFhbOrder → prepočet prvého obnovenia
 *   --fail-renewal: pred obnovením karta, ktorá zlyhá → past_due, email „platba neprešla“, žiadna objednávka
 * Iba so sk_test_ a FHB sandboxom. Na konci zmaže test clock (predplatné sa zruší → DB `cancelled`);
 * objednávky v DB a vo FHB sandboxe ostávajú ako dôkaz (premažú sa pred spustením predaja).
 */
import http from 'node:http';
import Stripe from 'stripe';
import { db } from '../lib/db';
import { FhbClient } from '../lib/fhb/client';
import { fhbOrderId } from '../lib/fhb/build-order';
import { jobDepsFromEnv } from '../lib/fhb/jobs';
import { applyFhbOrder, type DbOrder } from '../lib/fhb/sync';
import { addDays, chargeTime } from '../lib/subscription-schedule';
import { fhbMode, stripeMode } from '../lib/env-mode';

// Playwright je v prostredí predinštalovaný globálne (nie je v package.json)
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { chromium } = require('playwright') as { chromium: { launch(): Promise<any> } }; // eslint-disable-line @typescript-eslint/no-explicit-any

const arg = (k: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split('=')[1];
const SITE = arg('site') ?? 'https://www.granula.sk';
const KEEP = process.argv.includes('--keep-clock');
const FAIL = process.argv.includes('--fail-renewal');
const unix = (d: Date) => Math.floor(d.getTime() / 1000);
const iso = (s: number | null | undefined) => (s ? new Date(s * 1000).toISOString() : '—');
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const failures: string[] = [];
function check(ok: boolean, msg: string) {
  console.log(`   ${ok ? 'OK ' : 'CHYBA'} ${msg}`);
  if (!ok) failures.push(msg);
}

async function poll<T>(what: string, fn: () => Promise<T | null | undefined>, timeoutMs = 120_000): Promise<T> {
  const end = Date.now() + timeoutMs;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > end) throw new Error(`čakanie vypršalo: ${what}`);
    await sleep(3000);
  }
}

async function advance(s: Stripe, clockId: string, to: Date) {
  await s.testHelpers.testClocks.advance(clockId, { frozen_time: unix(to) });
  await poll('test clock ready', async () => (await s.testHelpers.testClocks.retrieve(clockId)).status === 'ready', 180_000);
}

/** lokálna stránka s Embedded Checkout (rovnaké volanie ako kviz.js) */
function serve(publishableKey: string, clientSecret: string): Promise<{ url: string; close: () => void }> {
  const html = `<!doctype html><meta charset="utf-8"><script src="https://js.stripe.com/dahlia/stripe.js"></script>
<div id="checkout"></div><script>
(async () => { const s = Stripe(${JSON.stringify(publishableKey)});
  const c = await s.createEmbeddedCheckoutPage({ clientSecret: ${JSON.stringify(clientSecret)} }); c.mount('#checkout'); })();
</script>`;
  return new Promise((resolve) => {
    const srv = http.createServer((_q, r) => { r.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); r.end(html); });
    srv.listen(0, '127.0.0.1', () => {
      const port = (srv.address() as { port: number }).port;
      resolve({ url: `http://localhost:${port}/`, close: () => srv.close() });
    });
  });
}

async function pay(publishableKey: string, clientSecret: string) {
  const page = await serve(publishableKey, clientSecret);
  const browser = await chromium.launch();
  try {
    const p = await browser.newPage({ viewport: { width: 1100, height: 1400 } });
    await p.goto(page.url);
    const frame = p.frameLocator('iframe[name^="embedded-checkout"], iframe[src*="checkout.stripe.com"]').first();
    await frame.locator('#cardNumber').waitFor({ timeout: 60_000 });
    await frame.locator('#cardNumber').fill('4242424242424242');
    await frame.locator('#cardExpiry').fill('12 / 34');
    await frame.locator('#cardCvc').fill('123');
    const name = frame.locator('#billingName');
    if (await name.isVisible().catch(() => false)) await name.fill('Test Clock');
    const country = frame.locator('#billingCountry');
    if (await country.isVisible().catch(() => false)) await country.selectOption('SK').catch(() => {});
    await frame.locator('.SubmitButton, button[type=submit]').first().click();
    // Embedded Checkout po úspechu presmeruje na return_url (/granule-na-mieru?session_id=…)
    await p.waitForURL(/session_id=/, { timeout: 90_000 }).catch(async () => {
      await p.screenshot({ path: '/tmp/e2e-clock-pay.png', fullPage: true });
      throw new Error('platba sa nedokončila (snímka /tmp/e2e-clock-pay.png)');
    });
  } finally {
    await browser.close();
    page.close();
  }
}

async function main() {
  if (stripeMode() !== 'test') throw new Error('Iba so Stripe TEST kľúčom.');
  if (fhbMode() !== 'sandbox') throw new Error('Iba s FHB sandboxom.');
  const token = process.env.CHECKOUT_TEST_TOKEN;
  if (!token) throw new Error('Chýba CHECKOUT_TEST_TOKEN.');
  const s = new Stripe(process.env.STRIPE_SECRET_KEY!);
  const fhb = FhbClient.fromEnv();
  const sb = db();

  const start = new Date(Math.floor(Date.now() / 1000) * 1000);
  const clock = await s.testHelpers.testClocks.create({ frozen_time: unix(start), name: 'granula e2e obnovenie' });
  console.log(`site ${SITE}\ntest clock ${clock.id} štart ${start.toISOString()}`);
  try {
    // 1. zákazník na test clocku + v DB (POST /api/checkout ho nájde podľa e-mailu a použije jeho Stripe zákazníka)
    const email = `e2e-clock-${unix(start)}@granula.sk`;
    const sc = await s.customers.create({ test_clock: clock.id, email, name: 'Test Clock', phone: '+421905123456', preferred_locales: ['sk'], metadata: { app: 'granula', test_clock: '1' } });
    const { data: cust, error } = await sb.from('customers').insert({ email, name: 'Test Clock', phone: '+421905123456', stripe_customer_id: sc.id }).select('*').single();
    if (error) throw new Error(error.message);
    await s.customers.update(sc.id, { metadata: { app: 'granula', test_clock: '1', customer_id: cust.id } });
    console.log('1. zákazník', cust.id, sc.id, email);

    // 2. checkout cez produkčné API
    const body = {
      answers: { dogname: 'Clock', sex: 'pes', breed: 'krizenec-stredny', kg: 17, years: '4', months: '0', weeks: '', activity: 'mesto', neutered: 'ano', body: 'akurat', focus: [], allergies: [] },
      plan: 'mesiac',
      bag: '9',
      delivery: { method: 'dpd_pickup', firstName: 'Test', lastName: 'Clock', email, phone: '0905 123 456', point: { id: 'SK21286' } },
    };
    const res = await fetch(`${SITE}/api/checkout`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-checkout-test': token }, body: JSON.stringify(body) });
    const out = (await res.json()) as { clientSecret?: string; publishableKey?: string; error?: string };
    if (!res.ok || !out.clientSecret) throw new Error(`/api/checkout ${res.status}: ${out.error}`);
    const sessionId = out.clientSecret.split('_secret_')[0];
    const session = await s.checkout.sessions.retrieve(sessionId);
    const D = Number(session.metadata?.days);
    console.log('2. session', sessionId, '| D =', D, '| suma', (session.amount_total ?? 0) / 100, '€');
    check(session.customer === sc.id, 'Session patrí zákazníkovi na test clocku');

    // 3. platba
    await pay(out.publishableKey!, out.clientSecret);
    console.log('3. zaplatené (Embedded Checkout, 4242)');

    // 4. webhook → objednávka first
    const first = await poll('objednávka first v DB', async () => (await sb.from('orders').select('*').eq('stripe_ref', sessionId).maybeSingle()).data, 180_000);
    const sub = await poll('predplatné v DB', async () => (await sb.from('subscriptions').select('*').eq('id', first.subscription_id!).maybeSingle()).data);
    const firstSent = await poll('first odoslaná do FHB', async () => {
      const o = (await sb.from('orders').select('*').eq('id', first.id).single()).data!;
      return o.status !== 'paid' ? o : null;
    }, 60_000);
    const fhbFirst = await fhb.getOrder(fhbOrderId(first.number));
    console.log(`4. objednávka first #${first.number} ${first.id} | DB ${firstSent.status} | FHB ${fhbFirst?.status ?? '—'} | predplatné ${sub.id} ${sub.stripe_subscription_id}`);
    check(first.kind === 'first' && first.amount_cents === session.amount_total, `first: suma ${(first.amount_cents ?? 0) / 100} € = Session`);
    check(firstSent.status === 'sent_to_fhb' && !!fhbFirst, 'first je vo FHB sandboxe (sent_to_fhb)');
    const stripeSub = await poll('trial_end nastavený', async () => {
      const x = await s.subscriptions.retrieve(sub.stripe_subscription_id!);
      return x.trial_end ? x : null;
    });
    const expected = new Date(sub.next_charge_at!);
    check(stripeSub.trial_end === unix(expected), `trial_end ${iso(stripeSub.trial_end)} = next_charge_at v DB`);
    const days = (unix(expected) - unix(start)) / 86400;
    check(Math.abs(days - (D - 7 + 3)) <= 1, `prvé obnovenie ≈ zaplatené + SHIP_DAYS + D − LEAD (${days.toFixed(1)} dní, D=${D})`);

    // 4b. SIMULÁCIA FHB (sandbox stavy sám neposúva): odoslané s trackingom, doručené o 5 dní → skutočný applyFhbOrder
    //     nad DB a Stripe test clockom; prvé obnovenie sa má prepočítať na doručené + D − LEAD
    let renewalAt = expected;
    if (!process.argv.includes('--no-delivery')) {
      const deps = { ...(await jobDepsFromEnv()), stripe: s };
      const shippedAt = new Date(start.getTime() + 1 * 86400_000);
      const deliveredAt = new Date(start.getTime() + 5 * 86400_000);
      const row = () => sb.from('orders').select('*').eq('id', first.id).single().then((r) => r.data as DbOrder);
      await applyFhbOrder(await row(), { id: fhbOrderId(first.number), status: 'sent', shipped_at: shippedAt.toISOString(), tracking_numbers: ['SIM-123'], tracking_links: ['https://example.com/sledovanie/SIM-123'] } as never, deps);
      const afterSent = await row();
      const shippedMail = (await sb.from('email_log').select('key, status').eq('key', `shipped:${first.id}`).maybeSingle()).data;
      check(afterSent.status === 'sent' && JSON.stringify(afterSent.tracking).includes('SIM-123'), '4b. simulované „odoslané“: stav sent + tracking v DB');
      check(!!shippedMail, `4b. email „zásielka odoslaná“ v email_log (${shippedMail?.status})`);
      await applyFhbOrder(afterSent, { id: fhbOrderId(first.number), status: 'delivered', shipped_at: shippedAt.toISOString(), delivered_at: deliveredAt.toISOString(), tracking_numbers: ['SIM-123'], tracking_links: ['https://example.com/sledovanie/SIM-123'] } as never, deps);
      const afterDelivered = await row();
      const subNow = (await sb.from('subscriptions').select('*').eq('id', sub.id).single()).data!;
      const want = chargeTime(addDays(deliveredAt, D - 7));
      const st = await s.subscriptions.retrieve(sub.stripe_subscription_id!);
      console.log(`4b. SIMULÁCIA FHB: doručené ${deliveredAt.toISOString()} → prvé obnovenie ${subNow.next_charge_at} (pôvodne ${expected.toISOString()}), Stripe trial_end ${iso(st.trial_end)}`);
      check(afterDelivered.status === 'delivered' && new Date(subNow.last_delivered_at ?? 0).getTime() === deliveredAt.getTime(), '4b. simulované „doručené“: stav delivered + last_delivered_at');
      check(new Date(subNow.next_charge_at!).getTime() === want.getTime() && st.trial_end === unix(want), `4b. prvé obnovenie prepočítané na doručené + D − LEAD (${want.toISOString()}) v DB aj v Stripe`);
      renewalAt = want;
    }

    // 5. posun hodín za prvé obnovenie → renewal
    const expectedRenewal = renewalAt;
    if (FAIL) {
      // karta, ktorá sa pripojí, ale každá platba zlyhá → obnovenie: invoice.payment_failed
      const bad = await s.paymentMethods.attach('pm_card_chargeCustomerFail', { customer: sc.id });
      await s.subscriptions.update(sub.stripe_subscription_id!, { default_payment_method: bad.id });
      await s.customers.update(sc.id, { invoice_settings: { default_payment_method: bad.id } });
      await advance(s, clock.id, new Date(renewalAt.getTime() + 2 * 3600_000));
      const inv = (await s.invoices.list({ subscription: sub.stripe_subscription_id!, limit: 10 })).data.find((i) => i.billing_reason === 'subscription_cycle');
      console.log(`5. ZLYHANÉ OBNOVENIE | faktúra ${inv?.id} ${inv?.status} pokus ${inv?.attempt_count}`);
      check(inv?.status === 'open' && (inv?.amount_paid ?? 0) === 0, 'obnovenie: faktúra nezaplatená (open)');
      const subPd = await poll('predplatné past_due', async () => {
        const x = (await sb.from('subscriptions').select('status').eq('id', sub.id).single()).data!;
        return x.status === 'past_due' ? x : null;
      }, 90_000).catch(() => null);
      check(!!subPd, 'predplatné v DB: past_due');
      const mail = await poll('email neúspešná platba', async () => (await sb.from('email_log').select('key, status').like('key', `payment-failed:${inv?.id}:%`).maybeSingle()).data, 60_000).catch(() => null);
      check(!!mail, `email „platba neprešla“ v email_log (${mail?.key} ${mail?.status})`);
      const renewals = (await sb.from('orders').select('id').eq('subscription_id', sub.id).eq('kind', 'renewal')).data ?? [];
      check(renewals.length === 0, 'žiadna renewal objednávka (nič nejde do FHB)');
      if (failures.length) throw new Error(`${failures.length} kontrol zlyhalo`);
      console.log('VÝSLEDOK: všetky kontroly OK');
      return;
    }
    await advance(s, clock.id, new Date(renewalAt.getTime() + 2 * 3600_000));
    const inv = (await s.invoices.list({ subscription: sub.stripe_subscription_id!, limit: 10 })).data.find((i) => i.billing_reason === 'subscription_cycle');
    console.log(`5. hodiny ${iso(unix(expectedRenewal) + 7200)} | faktúra ${inv?.id} ${inv?.status} ${(inv?.amount_paid ?? 0) / 100} €`);
    check(inv?.status === 'paid', 'obnovenie: faktúra subscription_cycle zaplatená');
    check(Math.abs((inv?.created ?? 0) - unix(expectedRenewal)) < 3600, `obnovenie v plánovaný deň ${expectedRenewal.toISOString()}`);
    const renewal = await poll('objednávka renewal v DB', async () => (await sb.from('orders').select('*').eq('subscription_id', sub.id).eq('kind', 'renewal').maybeSingle()).data, 180_000);
    const renewalSent = await poll('renewal odoslaná do FHB', async () => {
      const o = (await sb.from('orders').select('*').eq('id', renewal.id).single()).data!;
      return o.status !== 'paid' ? o : null;
    }, 60_000);
    const fhbRenewal = await fhb.getOrder(fhbOrderId(renewal.number));
    console.log(`   objednávka renewal #${renewal.number} ${renewal.id} | DB ${renewalSent.status} | FHB ${fhbRenewal?.status ?? '—'} | stripe_ref ${renewal.stripe_ref}`);
    check(renewal.stripe_ref === inv?.id && renewal.amount_cents === inv?.amount_paid, 'renewal: stripe_ref = faktúra, suma = zaplatená suma');
    check(JSON.stringify(renewal.items) === JSON.stringify(first.items), `renewal: rovnaké položky ${JSON.stringify(renewal.items)}`);
    check(renewalSent.status === 'sent_to_fhb' && !!fhbRenewal, 'renewal je vo FHB sandboxe (sent_to_fhb)');
    const afterSub = await s.subscriptions.retrieve(sub.stripe_subscription_id!);
    check(afterSub.items.data[0].current_period_end - (inv?.created ?? 0) >= (D - 1) * 86400, `ďalšia platba o D=${D} dní (${iso(afterSub.items.data[0].current_period_end)})`);
  } finally {
    if (KEEP) console.log('test clock ponechaný:', clock.id);
    else {
      await s.testHelpers.testClocks.del(clock.id);
      console.log('test clock zmazaný (predplatné zrušené)');
    }
  }
  if (failures.length) throw new Error(`${failures.length} kontrol zlyhalo`);
  console.log('VÝSLEDOK: všetky kontroly OK');
}

main().catch((e) => {
  console.error('CHYBA:', e?.message ?? e);
  process.exit(1);
});
