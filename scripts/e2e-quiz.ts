/*
 * Spoločné kroky živého nákupu cez dotazník granule-na-mieru (vlastný platobný formulár, SPEC §10.17) pre
 * scripts/e2e-checkout.ts a scripts/stripe-e2e-clock.ts. Iba akcie v prehliadači; kontroly robia skripty.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
export type Page = any;
export type Method = 'packeta_point' | 'dpd_pickup' | 'sps_courier';

export const ANSWERS = { dogname: 'Bruno', sex: 'pes', breed: 'krizenec-stredny', breedSet: true, kg: 17, years: '4', months: '0', weeks: '', activity: 'mesto', neutered: 'ano', pregnant: '', body: 'akurat', focus: ['nic'], allergies: ['ziadne'], ordered: false };

export const CARDS = { ok: '4242424242424242', declined: '4000000000000002', threeDs: '4000002500003155' } as const;

/** Session id z odpovede POST /api/checkout (dotazník ho volá pri „Pokračovať k platbe“). */
export function watchSession(page: Page): () => string | null {
  let sessionId: string | null = null;
  page.on('response', async (r: { url(): string; request(): { method(): string }; json(): Promise<{ clientSecret?: string }> }) => {
    if (r.url().endsWith('/api/checkout') && r.request().method() === 'POST') {
      const j = await r.json().catch(() => ({}) as { clientSecret?: string });
      if (j.clientSecret) sessionId = j.clientSecret.split('_secret_')[0];
    }
  });
  return () => sessionId;
}

/** Otvorí krok objednávky s odpoveďami dotazníka v sessionStorage a tokenom predaja. */
export async function openOrder(page: Page, o: { site: string; token: string; plan: 'mesiac' | 'raz'; bag: '4' | '9' | '18'; answers?: object; consent?: boolean }) {
  await page.addInitScript((a: object) => sessionStorage.setItem('granula-quiz', JSON.stringify(a)), { ...(o.answers ?? ANSWERS), plan: o.plan, bag: o.bag });
  // súhlas s analytickými cookies (P7), inak lišta → „Len nevyhnutné“
  if (o.consent) await page.addInitScript(() => localStorage.setItem('granula-cookies', 'analytics'));
  await page.goto(`${o.site}/granule-na-mieru?test=${encodeURIComponent(o.token)}#objednavka`);
  await page.getByRole('button', { name: 'Len nevyhnutné' }).click({ timeout: 10_000 }).catch(() => {});
  await page.locator(`input[name="plan"][value="${o.plan}"]`).check({ force: true });
  const bagRadio = page.locator(`input[name="bag"][value="${o.bag}"]`);
  if (await bagRadio.count()) await bagRadio.check({ force: true });
}

export async function fillContact(page: Page, c: { email: string; phone?: string; firstName: string; lastName: string }) {
  await page.fill('#email', c.email);
  await page.fill('#phone', c.phone ?? '0905 123 456');
  await page.fill('#fname', c.firstName);
  await page.fill('#lname', c.lastName);
}

/** Spôsob doručenia; pri výdajnom mieste výber zo zoznamu (prvé miesto pre hľadaný výraz). Vráti popis miesta. */
export async function selectMethod(page: Page, method: Method) {
  await page.locator(`input[name="dmethod"][value="${method}"]`).check({ force: true });
}

export async function chooseDelivery(page: Page, method: Method, opts: { query?: string } = {}): Promise<string | null> {
  await selectMethod(page, method);
  // adresa zákazníka pri každom spôsobe (FHB 24. 11. 2026: dopravca ju chce aj pri výdajnom mieste)
  await page.fill('#street', 'Hlavná 1');
  await page.fill('#zip', '040 01');
  await page.fill('#city', 'Košice');
  if (method === 'sps_courier') return null;
  const pick = page.locator(`.so-act[data-for="${method}"]`); // oranžové tlačidlo výberu miesta v karte dopravcu
  if (method === 'packeta_point' && (await pick.locator('[data-list="packeta"]').isVisible())) await pick.locator('[data-list="packeta"]').click();
  else await pick.locator('[data-pick]').click();
  const listTab = page.locator('.dp-tabs button[data-view="list"]');
  if (await listTab.isVisible().catch(() => false)) await listTab.click();
  await page.fill('#dp-q', opts.query ?? (method === 'dpd_pickup' ? 'Tornaľa' : 'Žilina'));
  await page.locator('#dp-q').press('Enter');
  await page.locator('#dp-list button[data-i]').first().waitFor({ timeout: 30_000 });
  await page.locator('#dp-list button[data-i]').first().click();
  const chosen = page.locator(`.dl-pick[data-for="${method}"] .dl-chosen`);
  await chosen.waitFor({ state: 'visible', timeout: 10_000 });
  return (await chosen.innerText()).replace(/\s+/g, ' ');
}

/** „Pokračovať k platbe“ → obrazovka #platba s pripraveným Payment Element. Vráti frame Payment Element. */
export async function openPayment(page: Page, opts: { mobile?: boolean } = {}) {
  await page.locator(opts.mobile ? '#s-next' : '#s-submit').click();
  await page.waitForURL(/#platba$/, { timeout: 60_000 });
  const frame = page.frameLocator('#pay-element iframe').first();
  await frame.locator('input[name="number"]').waitFor({ timeout: 60_000 });
  await page.waitForFunction(() => !(document.getElementById('p-submit') as HTMLButtonElement).disabled, null, { timeout: 30_000 });
  return frame;
}

export async function fillCard(frame: any, card: string) {
  await frame.locator('input[name="number"]').fill(card);
  await frame.locator('input[name="expiry"]').fill('12 / 34');
  await frame.locator('input[name="cvc"]').fill('123');
}

/** „Zaplatiť“; pri 3D Secure potvrdí testovacie okno Stripe. Vráti, či sa 3DS okno objavilo. */
export async function submitPayment(page: Page, opts: { threeDs?: boolean; onThreeDs?: () => Promise<unknown> } = {}): Promise<boolean> {
  await page.locator('#p-submit').click();
  if (!opts.threeDs) return false;
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 1500));
    for (const f of page.frames()) {
      const b = f.locator('#test-source-authorize-3ds');
      if (await b.isVisible().catch(() => false)) {
        await new Promise((r) => setTimeout(r, 1200)); // testovacie okno Stripe potrebuje chvíľu, kým klik spracuje
        await opts.onThreeDs?.();
        await b.click();
        return true;
      }
    }
  }
  return false;
}

/** Po úspešnej platbe presmerovanie na Hotovo (?session_id=…). */
export async function waitForDone(page: Page, timeoutMs = 120_000) {
  await page.waitForURL(/session_id=/, { timeout: timeoutMs });
  await page.locator('[data-screen="hotovo"]').waitFor({ state: 'visible', timeout: 60_000 });
}
