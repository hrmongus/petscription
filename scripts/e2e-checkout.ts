/*
 * Živý test nákupu cez skutočný dotazník na granula.sk s ?test=<CHECKOUT_TEST_TOKEN> (PROJEKT-1, krok 4 a 6).
 *   npx tsx scripts/e2e-checkout.ts <predplatne|jednorazovo|zamietnuta> [--site=https://www.granula.sk]
 *
 *   predplatne  – 9 kg, predplatné, DPD odberné miesto (zoznam), karta 4242 → objednávka first + predplatné v DB → FHB
 *   jednorazovo – 4 kg, jednorazovo, Packeta (zoznam), karta 4242 → objednávka one_off v DB → FHB
 *   zamietnuta  – 9 kg, predplatné, SPS kuriér, karta 4000 0000 0000 0002 → Checkout ukáže chybu, žiadna objednávka
 *
 * Odpovede dotazníka sa vložia do sessionStorage (rovnaký stav ako kviz.js), zvyšok ide cez UI: krok objednávky,
 * kontakt, doručenie, Embedded Checkout. Overenie: Supabase (orders, subscriptions) a FHB sandbox (GET /order).
 * Iba so sk_test_ a FHB sandboxom. Snímky: <scratch>/e2e-<scenár>-*.png (premenná E2E_SHOTS, inak /tmp).
 */
import Stripe from 'stripe';
import { db } from '../lib/db';
import { FhbClient } from '../lib/fhb/client';
import { fhbOrderId } from '../lib/fhb/build-order';
import { fhbMode, stripeMode } from '../lib/env-mode';

// Playwright je v prostredí predinštalovaný globálne (nie je v package.json)
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any
const { chromium } = require('playwright') as { chromium: { launch(): Promise<any> } };

type Scenario = 'predplatne' | 'jednorazovo' | 'zamietnuta';
const scenario = process.argv[2] as Scenario;
const SITE = process.argv.find((a) => a.startsWith('--site='))?.split('=')[1] ?? 'https://www.granula.sk';
const SHOTS = process.env.E2E_SHOTS ?? '/tmp';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const failures: string[] = [];
function check(ok: boolean, msg: string) {
  console.log(`   ${ok ? 'OK ' : 'CHYBA'} ${msg}`);
  if (!ok) failures.push(msg);
}
async function poll<T>(what: string, fn: () => Promise<T | null | undefined>, timeoutMs = 90_000): Promise<T> {
  const end = Date.now() + timeoutMs;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > end) throw new Error(`čakanie vypršalo: ${what}`);
    await sleep(3000);
  }
}

const ANSWERS = { dogname: 'Bruno', sex: 'pes', breed: 'krizenec-stredny', breedSet: true, kg: 17, years: '4', months: '0', weeks: '', activity: 'mesto', neutered: 'ano', pregnant: '', body: 'akurat', focus: ['nic'], allergies: ['ziadne'], ordered: false };

async function main() {
  if (!['predplatne', 'jednorazovo', 'zamietnuta'].includes(scenario)) throw new Error('scenár: predplatne | jednorazovo | zamietnuta');
  if (stripeMode() !== 'test' || fhbMode() !== 'sandbox') throw new Error('Iba so Stripe test kľúčom a FHB sandboxom.');
  const token = process.env.CHECKOUT_TEST_TOKEN;
  if (!token) throw new Error('Chýba CHECKOUT_TEST_TOKEN.');
  const s = new Stripe(process.env.STRIPE_SECRET_KEY!);
  const sb = db();
  const stamp = Math.floor(Date.now() / 1000);
  const email = `e2e-${scenario}-${stamp}@granula.sk`;
  const plan = scenario === 'jednorazovo' ? 'raz' : 'mesiac';
  const bag = scenario === 'jednorazovo' ? '4' : '9';
  const card = scenario === 'zamietnuta' ? '4000000000000002' : '4242424242424242';
  console.log(`scenár ${scenario} | ${SITE} | ${email} | plán ${plan} | ${bag} kg`);

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 1100 } });
  const shot = (n: string) => page.screenshot({ path: `${SHOTS}/e2e-${scenario}-${n}.png`, fullPage: true });
  let sessionId: string | null = null;
  page.on('response', async (r: { url(): string; request(): { method(): string }; json(): Promise<{ clientSecret?: string }> }) => {
    if (r.url().endsWith('/api/checkout') && r.request().method() === 'POST') {
      const j = await r.json().catch(() => ({}) as { clientSecret?: string });
      if (j.clientSecret) sessionId = j.clientSecret.split('_secret_')[0];
    }
  });
  try {
    await page.addInitScript((a: object) => sessionStorage.setItem('granula-quiz', JSON.stringify(a)), { ...ANSWERS, plan, bag });
    await page.goto(`${SITE}/granule-na-mieru?test=${encodeURIComponent(token)}#objednavka`);
    await page.getByRole('button', { name: 'Len nevyhnutné' }).click({ timeout: 10_000 }).catch(() => {});
    check(!page.url().includes('test='), 'token zmizol z URL');

    // plán a balenie
    await page.locator(`input[name="plan"][value="${plan}"]`).check({ force: true });
    const bagRadio = page.locator(`input[name="bag"][value="${bag}"]`);
    if (await bagRadio.count()) await bagRadio.check({ force: true });

    // kontakt
    await page.fill('#email', email);
    await page.fill('#phone', '0905 123 456');
    await page.fill('#fname', 'Test');
    await page.fill('#lname', scenario);

    // doručenie
    const method = scenario === 'predplatne' ? 'dpd_pickup' : scenario === 'jednorazovo' ? 'packeta_point' : 'sps_courier';
    await page.locator(`input[name="dmethod"][value="${method}"]`).check({ force: true });
    if (method === 'sps_courier') {
      await page.fill('#street', 'Hlavná 1');
      await page.fill('#zip', '040 01');
      await page.fill('#city', 'Košice');
    } else {
      const pick = page.locator(`.dl-pick[data-for="${method}"]`);
      if (method === 'packeta_point' && (await pick.locator('[data-list="packeta"]').isVisible())) await pick.locator('[data-list="packeta"]').click();
      else await pick.locator('[data-pick]').click();
      const listTab = page.locator('.dp-tabs button[data-view="list"]');
      if (await listTab.isVisible().catch(() => false)) await listTab.click();
      await page.fill('#dp-q', method === 'dpd_pickup' ? 'Tornaľa' : 'Žilina');
      await page.locator('#dp-q').press('Enter');
      await page.locator('#dp-list button[data-i]').first().waitFor({ timeout: 30_000 });
      await page.locator('#dp-list button[data-i]').first().click();
      await page.locator(`.dl-pick[data-for="${method}"] .dl-chosen`).waitFor({ state: 'visible', timeout: 10_000 });
      console.log('   miesto:', (await page.locator(`.dl-pick[data-for="${method}"] .dl-chosen`).innerText()).replace(/\s+/g, ' ').slice(0, 90));
    }
    const summary = (await page.locator('#s-submit').innerText()).trim();
    await shot('1-formular');

    // Embedded Checkout
    await page.locator('#s-submit').click();
    const frame = page.frameLocator('iframe[name^="embedded-checkout"], iframe[src*="checkout.stripe.com"]').first();
    await frame.locator('#cardNumber').waitFor({ timeout: 60_000 });
    check(!!sessionId, `Session ${sessionId}`);
    const session = await s.checkout.sessions.retrieve(sessionId!);
    console.log(`   Session: mode ${session.mode}, suma ${(session.amount_total ?? 0) / 100} €, D ${session.metadata?.days}, ${session.metadata?.method} | tlačidlo „${summary}“`);
    check(session.mode === (plan === 'raz' ? 'payment' : 'subscription'), `mode ${session.mode}`);
    check(session.metadata?.app === 'granula' && session.metadata?.method === method, 'metadata app=granula a spôsob doručenia');
    await frame.locator('#cardNumber').fill(card);
    await frame.locator('#cardExpiry').fill('12 / 34');
    await frame.locator('#cardCvc').fill('123');
    const name = frame.locator('#billingName');
    if (await name.isVisible().catch(() => false)) await name.fill(`Test ${scenario}`);
    const country = frame.locator('#billingCountry');
    if (await country.isVisible().catch(() => false)) await country.selectOption('SK');
    const zip = frame.locator('#billingPostalCode');
    if (await zip.isVisible().catch(() => false)) await zip.fill('04001');
    const link = frame.locator('#enableStripePass');
    if (await link.isVisible().catch(() => false) && (await link.isChecked())) await link.uncheck({ force: true });
    const usd = await frame.getByText('USD', { exact: true }).isVisible().catch(() => false);
    check(!usd, 'Checkout iba v EUR (bez Adaptive Pricing)');
    await shot('2-checkout');
    await frame.locator('.SubmitButton, button[type=submit]').first().click();

    if (scenario === 'zamietnuta') {
      const err = frame.locator('[role=alert], .FieldError, .ConfirmPaymentButton-error, #cardNumber-fieldset .FieldError').first();
      await err.waitFor({ timeout: 45_000 }).catch(() => {});
      const msg = (await err.innerText().catch(() => '')).trim();
      await shot('3-zamietnuta');
      console.log('   Checkout hlási:', msg || '(text chyby sa nenašiel, pozri snímku)');
      await sleep(15_000); // čas na prípadný (nesprávny) webhook
      const sess = await s.checkout.sessions.retrieve(sessionId!);
      const order = (await sb.from('orders').select('id').eq('stripe_ref', sessionId!).maybeSingle()).data;
      const cust = (await sb.from('customers').select('id').eq('email', email).maybeSingle()).data;
      const subs = cust ? (await sb.from('subscriptions').select('id').eq('customer_id', cust.id)).data ?? [] : [];
      check(sess.status === 'open' && sess.payment_status === 'unpaid', `Session ostáva open/unpaid (${sess.status}/${sess.payment_status})`);
      check(!order && subs.length === 0, 'žiadna objednávka ani predplatné v DB (draft zákazníka ostáva)');
      check(!page.url().includes('session_id='), 'bez presmerovania na Hotovo');
    } else {
      await page.waitForURL(/session_id=/, { timeout: 90_000 });
      await page.locator('[data-screen="hotovo"]').waitFor({ state: 'visible', timeout: 60_000 });
      // stránka sa pýta /api/checkout/session každé 2 s, kým webhook nezaloží objednávku
      await page.locator('[data-screen="hotovo"]').getByText(/Číslo objednávky|Platbu sme prijali\. Číslo|nebola dokončená/).waitFor({ timeout: 45_000 }).catch(() => {});
      const hotovo = (await page.locator('[data-screen="hotovo"]').innerText()).replace(/\s+/g, ' ');
      await shot('3-hotovo');
      const order = await poll('objednávka v DB', async () => (await sb.from('orders').select('*').eq('stripe_ref', sessionId!).maybeSingle()).data);
      const sent = await poll('odoslanie do FHB', async () => {
        const o = (await sb.from('orders').select('*').eq('id', order.id).single()).data!;
        return o.status !== 'paid' ? o : null;
      }, 60_000);
      const fhb = await FhbClient.fromEnv().getOrder(fhbOrderId(order.id));
      console.log(`   objednávka #${order.number} ${order.id} | ${order.kind} | ${(order.amount_cents ?? 0) / 100} € | DB ${sent.status} | FHB ${fhb?.id} ${fhb?.status} ${fhb?.parcel_service} ${fhb?.delivery_point ?? ''}`);
      console.log(`   položky ${JSON.stringify(order.items)} | Hotovo: „${(hotovo.match(/Číslo objednávky[^.]*\./)?.[0] ?? hotovo.slice(0, 140))}“`);
      check(order.kind === (plan === 'raz' ? 'one_off' : 'first'), `kind ${order.kind}`);
      check(order.amount_cents === session.amount_total, 'suma objednávky = suma Session');
      check(hotovo.includes(String(order.number)), `stránka Hotovo ukazuje číslo objednávky ${order.number}`);
      check(sent.status === 'sent_to_fhb' && !!fhb && fhb.status === 'pending', 'objednávka je vo FHB sandboxe (pending)');
      check(fhb?.variable_symbol === String(order.number), 'FHB variable_symbol = číslo objednávky');
      if (plan === 'mesiac') {
        const sub = (await sb.from('subscriptions').select('*').eq('id', order.subscription_id!).single()).data!;
        const ss = await s.subscriptions.retrieve(sub.stripe_subscription_id!);
        console.log(`   predplatné ${sub.id} ${sub.stripe_subscription_id} | ${ss.status} | D ${sub.days_per_bag} | trial_end ${ss.trial_end ? new Date(ss.trial_end * 1000).toISOString() : '—'} | next_charge_at ${sub.next_charge_at}`);
        check(ss.status === 'trialing' && ss.trial_end === Math.floor(Date.parse(sub.next_charge_at!) / 1000), 'Stripe trial_end = next_charge_at (prvé obnovenie)');
        check(ss.items.data.every((i) => i.price.recurring?.interval === 'day' && i.price.recurring?.interval_count === sub.days_per_bag), `interval položiek = D (${sub.days_per_bag} dní)`);
      } else {
        check(order.subscription_id === null, 'jednorazovo: bez predplatného');
      }
    }
  } catch (e) {
    await shot('chyba').catch(() => {});
    throw e;
  } finally {
    await browser.close();
  }
  if (failures.length) throw new Error(`${failures.length} kontrol zlyhalo`);
  console.log('VÝSLEDOK: všetky kontroly OK');
}

main().catch((e) => {
  console.error('CHYBA:', e?.message ?? e);
  process.exit(1);
});
