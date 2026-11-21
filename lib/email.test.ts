import { describe, expect, test, vi } from 'vitest';
import { createMailer, type EmailLog } from './email';
import { orderConfirmationEmail, paymentFailedEmail, shippedEmail } from './emails';

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

const ORDER = { id: 'o1', number: 42, kind: 'first', amount_cents: 7240, items: [{ sku: 'GRAN-hovadzie-9', qty: 1 }], ship_to: { name: 'Ján Novák', email: 'jan@example.sk', phone: '+421905123456', country: 'SK', delivery_method: 'dpd_pickup', point_id: 'SK21286', point_label: 'Pavel Lóška Cyklo-Šport, Tornaľa' } };

describe('šablóny', () => {
  test('potvrdenie: číslo, položky, doručenie, suma, „Odstúpiť od zmluvy tu“ s odkazom; bez DPH', () => {
    const m = orderConfirmationEmail({ order: ORDER, to: 'jan@example.sk', name: 'Ján Novák', siteUrl: 'https://www.granula.sk/', subscription: { days: 37, nextChargeAt: new Date('2027-02-06T06:00:00Z') } });
    expect(m.key).toBe('order-confirm:o1');
    expect(m.subject).toContain('42');
    for (const t of [m.html, m.text]) {
      expect(t).toContain('Odstúpiť od zmluvy tu');
      expect(t).toContain('https://www.granula.sk/odstupenie?objednavka=42');
      expect(t).toContain('72,40 €');
      expect(t).toContain('Hovädzie');
      expect(t).toContain('DPD');
      expect(t).toContain('každých 37 dní');
      expect(t).not.toMatch(/DPH/);
    }
  });
  test('zásielka odoslaná: tracking odkaz a číslo', () => {
    const m = shippedEmail({ order: ORDER, to: 'jan@example.sk', trackingLinks: ['https://tracking.example/1'], trackingNumbers: ['1'] });
    expect(m.key).toBe('shipped:o1');
    expect(m.html).toContain('https://tracking.example/1');
    expect(m.text).toContain('Číslo zásielky: 1');
  });
  test('neúspešná platba: kľúč podľa faktúry a pokusu, odkaz na zaplatenie', () => {
    const m = paymentFailedEmail({ invoiceId: 'in_1', attempt: 2, to: 'jan@example.sk', amountCents: 7240, payUrl: 'https://invoice.stripe.com/i/x' });
    expect(m.key).toBe('payment-failed:in_1:2');
    expect(m.html).toContain('https://invoice.stripe.com/i/x');
  });
  test('HTML escapuje meno', () => {
    expect(orderConfirmationEmail({ order: ORDER, to: 'a@b.sk', name: '<script>', siteUrl: 'https://x' }).html).not.toContain('<script>');
  });
});
