import { validTestToken, TEST_HEADER } from '@/lib/checkout-gate';
import { db } from '@/lib/db';
import { createMailer, type EmailLog, type Mail } from '@/lib/email';
import { adminEmail, orderConfirmationEmail, paymentFailedEmail, renewalReminderEmail, shippedEmail } from '@/lib/emails';
import { stripeMode } from '@/lib/env-mode';

/*
 * POST /api/test/email-preview { to, only?: [kind…] } s hlavičkou x-checkout-test: <CHECKOUT_TEST_TOKEN>
 * Pošle testovacie verzie všetkých transakčných a interných emailov (predmet „[TEST] …“) cez Resend z produkcie,
 * aby sa dali skontrolovať texty. Iba v Stripe TEST mode (pred spustením predaja). Príjemca musí byť ADMIN_EMAIL
 * alebo e-mail existujúceho zákazníka v DB (nedá sa zneužiť na posielanie na ľubovoľné adresy). Do email_log sa nezapisuje.
 */
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const SHIP_DPD = { name: 'Ján Novák', email: 'jan@example.sk', phone: '+421905123456', country: 'SK', delivery_method: 'dpd_pickup', point_id: 'SK21286', point_label: 'Pavel Lóška Cyklo-Šport, Mierová 17, 98201 Tornaľa' };
const SHIP_PACKETA = { ...SHIP_DPD, delivery_method: 'packeta_point', point_id: '30361', point_label: 'Cukráreň MaTo, Nitrianska 3625, 01008 Žilina' };

export async function POST(req: Request) {
  if (!validTestToken(req.headers.get(TEST_HEADER))) return new Response('Unauthorized', { status: 401 });
  if (stripeMode() !== 'test') return new Response('Iba v test mode', { status: 403 });
  const { to, only } = (await req.json().catch(() => ({}))) as { to?: string; only?: string[] };
  const email = (to ?? process.env.ADMIN_EMAIL ?? '').trim().toLowerCase();
  if (!email) return Response.json({ error: 'chýba príjemca' }, { status: 400 });
  const known = email === (process.env.ADMIN_EMAIL ?? '').trim().toLowerCase() || !!(await db().from('customers').select('id').eq('email', email).maybeSingle()).data;
  if (!known) return Response.json({ error: 'príjemca musí byť ADMIN_EMAIL alebo existujúci zákazník' }, { status: 403 });

  const site = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.granula.sk';
  const created_at = new Date().toISOString();
  const first = { id: '00000000-0000-4000-8000-000000000123', number: 123, kind: 'first', amount_cents: 7240, items: [{ sku: 'GRAN-morka-hus-kacica-9', qty: 1 }], ship_to: SHIP_DPD, created_at };
  const renewal = { ...first, id: '00000000-0000-4000-8000-000000000124', number: 124, kind: 'renewal' };
  const oneOff = { ...first, id: '00000000-0000-4000-8000-000000000125', number: 125, kind: 'one_off', amount_cents: 3990, items: [{ sku: 'GRAN-jahna-4', qty: 1 }], ship_to: SHIP_PACKETA };
  const bodka = { name: 'Bodka', sex: 'fenka' };
  const rex = { name: 'Rex', sex: 'pes' };
  const next = new Date(Date.now() + 33 * 86_400_000);
  const name = 'Ján Novák';
  const mails: Mail[] = [
    orderConfirmationEmail({ order: first, to: email, name, dog: bodka, siteUrl: site, subscription: { days: 37, nextChargeAt: next }, prices: { foodCents: 6750, shippingCents: 490 } }),
    orderConfirmationEmail({ order: renewal, to: email, name, dog: rex, siteUrl: site, subscription: { days: 37, nextChargeAt: new Date(next.getTime() + 37 * 86_400_000) }, prices: { foodCents: 6750, shippingCents: 490 } }),
    orderConfirmationEmail({ order: oneOff, to: email, name, dog: bodka, siteUrl: site, prices: { foodCents: 3500, shippingCents: 490 } }),
    shippedEmail({ order: first, to: email, name, dog: bodka, siteUrl: site, trackingLinks: ['https://tracking.dpd.de/status/sk_SK/parcel/06512345678901'], trackingNumbers: ['06512345678901'] }),
    paymentFailedEmail({ invoiceId: 'in_test', attempt: 1, to: email, name, dog: rex, siteUrl: site, product: { productId: 'hovadzie', bagId: '9', days: 37 }, totalCents: 7240, shippingCents: 490, payUrl: `${site}/`, nextAttempt: new Date(Date.now() + 3 * 86_400_000) }),
    renewalReminderEmail({ subscriptionId: 'sub_test', to: email, name, dog: bodka, siteUrl: site, product: { productId: 'morka-hus-kacica', bagId: '9', days: 37 }, nextCharge: new Date(Date.now() + 3 * 86_400_000), foodCents: 6750, shippingCents: 490, shipTo: SHIP_DPD }),
    adminEmail({ key: 'a1', kind: 'admin_fhb_error', to: email, subject: 'Chyba FHB pri objednávke 123', lines: ['Objednávka 123 (00000000-0000-4000-8000-000000000123) sa nedostala do FHB a čaká na riešenie.', 'Chyba: {"status":400,"message":"Invalid request","violations":{"delivery_point":[{"code":"DELIVERY_POINT_DOES_NOT_EXISTS"}]}}'] }),
    adminEmail({ key: 'a2', kind: 'admin_stock_low', to: email, subject: 'Nízky sklad (2 produkty)', lines: ['Voľné kusy nevydržia 35 dní spotreby predplatných (dodávateľ min. 3 týždne):', 'GRAN-morka-hus-kacica-9: voľných 12 ks, spotreba 0,8 ks/deň, vydrží ~15 dní (hranica 28 ks)', 'GRAN-jahna-4: voľných 20 ks, spotreba 0,7 ks/deň, vydrží ~28 dní (hranica 25 ks)'] }),
    adminEmail({ key: 'a3', kind: 'admin_returned', to: email, subject: 'Vrátená zásielka, objednávka 123', lines: ['Objednávka 123 sa vrátila od dopravcu (return).', 'Treba rozhodnúť: refund alebo opätovné odoslanie (admin, P3).'] }),
  ];

  const mem = new Set<string>();
  const log: EmailLog = { has: async (k) => mem.has(k), insert: async (r) => void mem.add(r.key) };
  const send = createMailer(log);
  const stamp = Date.now();
  const results: { kind: string; subject: string; result: string }[] = [];
  for (const [i, m] of mails.entries()) {
    if (only?.length && !only.includes(m.kind)) continue;
    const subject = `[TEST] ${m.subject}`;
    try {
      results.push({ kind: m.kind, subject, result: await send({ ...m, subject, key: `preview:${stamp}:${i}`, orderId: null }) });
    } catch (e) {
      results.push({ kind: m.kind, subject, result: `chyba: ${(e as Error).message}` });
    }
    await new Promise((r) => setTimeout(r, 700)); // Resend limit 2 požiadavky/s
  }
  return Response.json({ to: email, results });
}
