import { describe, expect, test, vi } from 'vitest';
import { createMailer, type EmailLog } from './email';
import { orderConfirmationEmail, paymentFailedEmail, renewalReminderEmail, shippedEmail } from './emails';
import { dueForReminder } from './reminders';

function memLog() {
  const rows = new Map<string, { status: string }>();
  const log: EmailLog = { has: async (k) => rows.has(k), insert: async (r) => void rows.set(r.key, r) };
  return { log, rows };
}
const MAIL = { key: 'order-confirm:o1', kind: 'order_confirmation', to: 'jan@example.sk', subject: 'S', html: '<p>h</p>', text: 't', orderId: 'o1' };

describe('createMailer', () => {
  test('bez kľúča: nespadne, zapíše skipped, druhýkrát duplicate', async () => {
    const m = memLog(), f = vi.fn();
    const send = createMailer(m.log, {}, f as never);
    expect(await send(MAIL)).toBe('skipped');
    expect(await send(MAIL)).toBe('duplicate');
    expect(f).not.toHaveBeenCalled();
    expect(m.rows.get(MAIL.key)?.status).toBe('skipped');
  });
  test('s kľúčom: Resend s Idempotency-Key, reply_to, zápis sent; opakovanie sa neodošle', async () => {
    const m = memLog();
    const f = vi.fn(async () => new Response(JSON.stringify({ id: 're_1' }), { status: 200 }));
    const send = createMailer(m.log, { RESEND_API_KEY: 're_x', EMAIL_FROM: 'Granula <ahoj@granula.sk>', EMAIL_REPLY_TO: 'podpora@granula.sk' }, f as never);
    expect(await send(MAIL)).toBe('sent');
    expect(await send(MAIL)).toBe('duplicate');
    expect(f).toHaveBeenCalledTimes(1);
    const [, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.headers as Record<string, string>)['Idempotency-Key']).toBe(MAIL.key);
    expect(JSON.parse(init.body as string)).toMatchObject({ to: 'jan@example.sk', reply_to: 'podpora@granula.sk' });
  });
  test('chyba Resend → výnimka (volajúci ju zapíše), nič sa nezaloguje', async () => {
    const m = memLog();
    const send = createMailer(m.log, { RESEND_API_KEY: 'k', EMAIL_FROM: 'f' }, (async () => new Response('bad', { status: 422 })) as never);
    await expect(send(MAIL)).rejects.toThrow(/Resend 422/);
    expect(m.rows.size).toBe(0);
  });
});

const ORDER = { id: 'o1', number: 42, kind: 'first', amount_cents: 7240, created_at: '2026-11-23T10:00:00Z', items: [{ sku: 'GRAN-hovadzie-9', qty: 1 }], ship_to: { name: 'Ján Novák', email: 'jan@example.sk', phone: '+421905123456', country: 'SK', delivery_method: 'dpd_pickup', point_id: 'SK21286', point_label: 'Pavel Lóška Cyklo-Šport, Mierová 17, 98201 Tornaľa' } };
const SITE = 'https://www.granula.sk/';
const BODKA = { name: 'Bodka', sex: 'fenka' };
const noPlaceholders = (m: { html: string; text: string }) => {
  expect(m.html).not.toMatch(/\{\{|\}\}/);
  expect(m.text).not.toMatch(/\{\{|\}\}/);
};

describe('šablóny (návrh content/emails)', () => {
  test('vygenerovaný lib/email-templates.ts zodpovedá content/emails (npm run emails)', async () => {
    // @ts-expect-error .mjs bez typov
    const { buildTemplatesModule } = await import('../scripts/email-templates.mjs');
    const { readFileSync } = await import('node:fs');
    expect(readFileSync(new URL('./email-templates.ts', import.meta.url), 'utf8')).toBe(buildTemplatesModule());
  });
  test('1 potvrdenie predplatného: údaje, fotka vreca, skloňovanie, odkazy, bez DPH', () => {
    const m = orderConfirmationEmail({ order: ORDER, to: 'jan@example.sk', name: 'Ján Novák', dog: BODKA, siteUrl: SITE, subscription: { days: 37, nextChargeAt: new Date('2026-12-26T06:00:00Z') }, prices: { foodCents: 6750, shippingCents: 490 } });
    noPlaceholders(m);
    expect(m.key).toBe('order-confirm:o1');
    expect(m.subject).toBe('Objednávka č. 42 je potvrdená');
    expect(m.html).toContain('https://www.granula.sk/img/email/vrece-hovadzie-ryza.jpg');
    expect(m.html).toContain('https://www.granula.sk/img/email/logo-granula.png');
    expect(m.html).toContain('Ďakujeme, Ján!');
    expect(m.html).toContain('granule pre Bodku');
    expect(m.html).toContain('vystačí Bodke');
    for (const t of [m.html, m.text]) {
      expect(t).toContain('67,50 €');
      expect(t).toContain('4,90 €');
      expect(t).toContain('72,40 €');
      expect(t).toContain('26. 12. 2026');
      expect(t).toContain('23. 11. 2026');
      expect(t).toContain('DPD, výdajné miesto');
      expect(t).toContain('https://www.granula.sk/odstupenie?objednavka=42');
      expect(t).toContain('Odstúpiť od zmluvy tu');
      expect(t).not.toMatch(/DPH/);
    }
  });
  test('2 obnovenie a 3 jednorazovo: správna šablóna a predmet; doprava dopočítaná, keď chýba rozpis', () => {
    const r = orderConfirmationEmail({ order: { ...ORDER, kind: 'renewal' }, to: 'a@b.sk', name: 'Ján', dog: { name: 'Rex', sex: 'pes' }, siteUrl: SITE, subscription: { days: 37, nextChargeAt: null } });
    noPlaceholders(r);
    expect(r.subject).toBe('Ďalšie vrece už chystáme · objednávka č. 42');
    expect(r.html).toContain('Rexovi sa pomaly míňajú granule');
    expect(r.html).toContain('zmenila jeho váha');
    expect(r.html).toContain('67,50 €'); // 72,40 − 4,90
    const o = orderConfirmationEmail({ order: { ...ORDER, kind: 'one_off' }, to: 'a@b.sk', name: 'Ján', dog: BODKA, siteUrl: SITE });
    noPlaceholders(o);
    expect(o.html).toContain('jednorazová objednávka');
    expect(o.html).toContain('Prejsť na predplatné');
  });
  test('4 zásielka odoslaná: tracking, doba doručenia podľa dopravcu, blok „Prvé vrece“ iba pri prvej', () => {
    const m = shippedEmail({ order: ORDER, to: 'a@b.sk', name: 'Ján', dog: BODKA, siteUrl: SITE, trackingLinks: ['https://tracking.example/1'], trackingNumbers: ['1'] });
    noPlaceholders(m);
    expect(m.key).toBe('shipped:o1');
    expect(m.html).toContain('https://tracking.example/1');
    expect(m.html).toContain('DPD ich zvyčajne doručí do 2\u00a0–\u00a04 pracovných dní');
    expect(m.html).toContain('pripravené na vyzdvihnutie');
    expect(m.html).toContain('Prvé vrece? Prechádzaj postupne');
    expect(m.text).toContain('Číslo zásielky: 1');
    const r = shippedEmail({ order: { ...ORDER, kind: 'renewal', ship_to: { ...ORDER.ship_to, delivery_method: 'sps_courier', street: 'Hlavná 1', zip: '04001', city: 'Košice' } }, to: 'a@b.sk', dog: BODKA, siteUrl: SITE, trackingLinks: [], trackingNumbers: [] });
    noPlaceholders(r);
    expect(r.html).not.toContain('Prvé vrece');
    expect(r.html).toContain('SPS ich zvyčajne doručí do 1\u00a0–\u00a03 pracovných dní');
    expect(r.html).toContain('kuriér dá vedieť');
    expect(r.html).toContain('Hlavná 1, 04001 Košice');
  });
  test('5 neúspešná platba: kľúč podľa faktúry a pokusu, odkaz na zaplatenie, veta o ďalšom pokuse iba s dátumom', () => {
    const base = { invoiceId: 'in_1', attempt: 2, to: 'a@b.sk', name: 'Ján', dog: BODKA, siteUrl: SITE, product: { productId: 'jelen-kralik', bagId: '4', days: 16 }, totalCents: 3990, shippingCents: 490, payUrl: 'https://invoice.stripe.com/i/x' };
    const m = paymentFailedEmail({ ...base, nextAttempt: new Date('2026-12-29T06:00:00Z') });
    noPlaceholders(m);
    expect(m.key).toBe('payment-failed:in_1:2');
    expect(m.html).toContain('https://invoice.stripe.com/i/x');
    expect(m.html).toContain('vrece-jelen-kralik.jpg');
    expect(m.html).toContain('Platbu skúsime znova <strong>29. 12. 2026</strong>');
    expect(m.html).toContain('35,00 €');
    const last = paymentFailedEmail({ ...base, nextAttempt: null });
    noPlaceholders(last);
    expect(last.html).not.toContain('Platbu skúsime znova');
  });
  test('HTML escapuje meno a meno psa; bez mena „Ďakujeme!“', () => {
    const m = orderConfirmationEmail({ order: ORDER, to: 'a@b.sk', name: '<script>', dog: { name: '<b>x</b>', sex: 'pes' }, siteUrl: SITE });
    expect(m.html).not.toContain('<script>');
    expect(m.html).not.toContain('<b>x</b>');
    expect(orderConfirmationEmail({ order: ORDER, to: 'a@b.sk', name: '', siteUrl: SITE }).html).toContain('Ďakujeme!');
  });
});

describe('skloňovanie mena psa', () => {
  test('bežné mená a bezpečný náhradný tvar', async () => {
    const { dogCases } = await import('./dog-name');
    const c = (n: string, s?: string) => { const d = dogCases(n, s); return [d.acc, d.dat]; };
    expect(c('Bodka', 'fenka')).toEqual(['Bodku', 'Bodke']);
    expect(c('Mia', 'fenka')).toEqual(['Miu', 'Mii']);
    expect(c('Daisy', 'fenka')).toEqual(['Daisy', 'Daisy']);
    expect(c('Rex', 'pes')).toEqual(['Rexa', 'Rexovi']);
    expect(c('Bruno', 'pes')).toEqual(['Bruna', 'Brunovi']);
    expect(c('Lucky', 'pes')).toEqual(['Luckyho', 'Luckymu']);
    expect(c('Charlie', 'pes')).toEqual(['Charlieho', 'Charliemu']);
    expect(c('Kuba', 'pes')).toEqual(['Kubu', 'Kubovi']);
    expect(c('Šmolek', 'pes')).toEqual(['tvojho psa', 'tvojmu psovi']);
    expect(c('Pán Pes', 'pes')).toEqual(['tvojho psa', 'tvojmu psovi']);
    expect(c('', 'fenka')).toEqual(['tvoju fenku', 'tvojej fenke']);
    expect(dogCases('Bodka', 'fenka').poss).toBe('jej');
  });
});

describe('pripomienka pred platbou', () => {
  test('email: dátum, suma, adresa, odkaz na účet; kľúč podľa predplatného a dňa platby', () => {
    const m = renewalReminderEmail({ subscriptionId: 's1', to: 'a@b.sk', name: 'Ján Novák', dog: BODKA, siteUrl: SITE, product: { productId: 'morka-hus-kacica', bagId: '9', days: 37 }, nextCharge: new Date('2026-12-26T06:00:00Z'), foodCents: 6750, shippingCents: 490, shipTo: ORDER.ship_to });
    noPlaceholders(m);
    expect(m.key).toBe('renewal-reminder:s1:2026-12-26');
    expect(m.subject).toBe('Ďalšie vrece pošleme o pár dní · 26. 12. 2026');
    expect(m.html).toContain('okolo <strong>26. 12. 2026</strong>');
    expect(m.html).toContain('72,40 €');
    expect(m.html).toContain('pre Bodku');
    expect(m.html).toContain('zmenila jej váha');
    expect(m.html).toContain('https://www.granula.sk/ucet');
    expect(m.html).toContain('Pavel Lóška Cyklo-Šport');
    expect(m.text).toContain('Stačí aj odpísať na tento e-mail.');
  });
  test('kto dostane pripomienku: aktívne, platba o 24–72 h, nie hneď po kúpe', () => {
    const now = new Date('2026-12-23T07:07:00Z');
    const old = '2026-11-01T00:00:00Z';
    const subs = [
      { id: 'ok', status: 'active', next_charge_at: '2026-12-26T06:00:00Z', created_at: old },
      { id: 'skorej-zajtra', status: 'active', next_charge_at: '2026-12-24T06:00:00Z', created_at: old },
      { id: 'o-4-dni', status: 'active', next_charge_at: '2026-12-27T06:00:00Z', created_at: old },
      { id: 'pauza', status: 'paused', next_charge_at: '2026-12-26T06:00:00Z', created_at: old },
      { id: 'nove', status: 'active', next_charge_at: '2026-12-26T06:00:00Z', created_at: '2026-12-21T10:00:00Z' },
    ];
    expect(dueForReminder(subs, now).map((s) => s.id)).toEqual(['ok']);
  });
});
