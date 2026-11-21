/*
 * Šablóny transakčných emailov (SPEC P5, PROJEKT-1 krok 5). Slovensky, HTML + text, Granula Design System:
 * Mlieko #F4EBE2 podklad, Mlieko light #FFF7EE karta, Noc #000 text, Kobalt #0047BB, Oranž #FF6900 (orámované).
 * Ceny sú konečné (firma nie je platiteľ DPH, SPEC P1) → nikde „s DPH“.
 */
import { METHODS, type DeliveryMethod } from './carriers';
import { allSkus } from './engine-server';
import type { ShipTo } from './fhb/build-order';
import type { Mail } from './email';

export const SUPPORT_EMAIL = 'podpora@granula.sk';

type OrderLike = { id: string; number: number; kind: string; amount_cents: number; items: unknown; ship_to: unknown };

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
export const eur = (cents: number) => `${(cents / 100).toFixed(2).replace('.', ',')} €`;
const dateSk = (d: Date) => d.toLocaleDateString('sk-SK', { day: 'numeric', month: 'numeric', year: 'numeric', timeZone: 'Europe/Bratislava' });
const site = (u: string) => u.replace(/\/+$/, '');

export function itemsText(items: unknown): string {
  const list = Array.isArray(items) ? (items as { sku: string; qty: number }[]) : [];
  const names = new Map(allSkus().map((x) => [x.sku, `Granula! ${x.name}`]));
  return list.map((i) => `${i.qty > 1 ? `${i.qty} × ` : ''}${names.get(i.sku) ?? i.sku}`).join(', ');
}

export function deliveryText(shipTo: unknown): string {
  const t = shipTo as ShipTo;
  const label = METHODS[t.delivery_method as DeliveryMethod]?.label ?? t.delivery_method;
  if (t.delivery_method === 'sps_courier') return `${label}: ${[t.street, `${t.zip ?? ''} ${t.city ?? ''}`.trim()].filter(Boolean).join(', ')}`;
  return `${label}: ${t.point_label ?? t.point_id ?? ''}`;
}

/* ---------------------------------------------------------------- rámec */

function layout(title: string, bodyHtml: string, footerHtml = ''): string {
  return `<!doctype html><html lang="sk"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title></head>
<body style="margin:0;padding:0;background:#F4EBE2;color:#000;font-family:Montserrat,Arial,Helvetica,sans-serif;font-size:16px;line-height:1.5">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4EBE2"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px">
<tr><td style="padding:0 0 16px"><span style="display:inline-block;background:#FF6900;color:#000;font-weight:900;font-style:italic;font-size:22px;padding:4px 10px;border:2px solid #000">GRANULA!</span></td></tr>
<tr><td style="background:#FFF7EE;border:2px solid #000;padding:24px">${bodyHtml}</td></tr>
<tr><td style="padding:16px 4px;font-size:13px">${footerHtml}Potrebuješ pomôcť? Napíš na <a href="mailto:${SUPPORT_EMAIL}" style="color:#0047BB">${SUPPORT_EMAIL}</a>.<br>Granula · Spark Link, s. r. o.</td></tr>
</table></td></tr></table></body></html>`;
}

const h1 = (t: string) => `<h1 style="margin:0 0 12px;font-size:24px;line-height:1.2;font-weight:900;text-transform:uppercase">${esc(t)}</h1>`;
const p = (t: string) => `<p style="margin:0 0 12px">${t}</p>`;
const row = (k: string, v: string) => `<tr><td style="padding:4px 12px 4px 0;vertical-align:top;white-space:nowrap"><b>${esc(k)}</b></td><td style="padding:4px 0">${esc(v)}</td></tr>`;
const button = (href: string, label: string, color = '#FF6900') =>
  `<a href="${esc(href)}" style="display:inline-block;background:${color};color:${color === '#0047BB' ? '#F4EBE2' : '#000'};font-weight:800;text-decoration:none;padding:12px 18px;border:2px solid #000;text-transform:uppercase">${esc(label)}</a>`;

/* ---------------------------------------------------------------- potvrdenie objednávky */

export type ConfirmationInput = {
  order: OrderLike;
  to: string;
  name?: string | null;
  siteUrl: string;
  /** pri predplatnom: interval a dátum ďalšej platby */
  subscription?: { days: number; nextChargeAt: Date | null } | null;
};

export function orderConfirmationEmail(i: ConfirmationInput): Mail {
  const o = i.order;
  const withdrawUrl = `${site(i.siteUrl)}/odstupenie?objednavka=${o.number}`;
  const items = itemsText(o.items);
  const delivery = deliveryText(o.ship_to);
  const title = o.kind === 'renewal' ? `Ďalšie vrece je na ceste · objednávka ${o.number}` : `Objednávka ${o.number} je prijatá`;
  const intro =
    o.kind === 'renewal'
      ? 'zaplatili sme ďalšie vrece z tvojho predplatného a posielame ho do skladu na expedíciu.'
      : 'ďakujeme, platba prešla a objednávku posielame do skladu na expedíciu. Keď balík odíde, napíšeme ti s odkazom na sledovanie.';
  const sub = i.subscription;
  const subLine = sub ? `Predplatné: každých ${sub.days} dní${sub.nextChargeAt ? `, ďalšia platba približne ${dateSk(sub.nextChargeAt)}` : ''}. Zrušiť ho môžeš kedykoľvek.` : null;
  const hello = i.name ? `Ahoj ${esc(i.name.split(' ')[0])},` : 'Ahoj,';

  const html = layout(
    title,
    h1(o.kind === 'renewal' ? 'Ďalšie vrece je na ceste.' : 'Objednávka prijatá.') +
      p(`${hello} ${intro}`) +
      `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 16px;font-size:15px">${row('Číslo objednávky', String(o.number))}${row('Granule', items)}${row('Doručenie', delivery)}${row('Zaplatené', eur(o.amount_cents))}</table>` +
      (subLine ? p(esc(subLine)) : '') +
      `<div style="margin:20px 0 4px;padding:16px;border:2px solid #000;background:#F4EBE2">` +
      p('<b>Odstúpenie od zmluvy:</b> do 14 dní od prevzatia tovaru môžeš od zmluvy odstúpiť bez udania dôvodu.') +
      button(withdrawUrl, 'Odstúpiť od zmluvy tu', '#0047BB') +
      `</div>`,
  );
  const text = [
    `${i.name ? `Ahoj ${i.name.split(' ')[0]},` : 'Ahoj,'} ${intro}`,
    '',
    `Číslo objednávky: ${o.number}`,
    `Granule: ${items}`,
    `Doručenie: ${delivery}`,
    `Zaplatené: ${eur(o.amount_cents)}`,
    ...(subLine ? ['', subLine] : []),
    '',
    'Odstúpenie od zmluvy: do 14 dní od prevzatia tovaru môžeš od zmluvy odstúpiť bez udania dôvodu.',
    `Odstúpiť od zmluvy tu: ${withdrawUrl}`,
    '',
    `Potrebuješ pomôcť? ${SUPPORT_EMAIL}`,
  ].join('\n');
  return { key: `order-confirm:${o.id}`, kind: 'order_confirmation', to: i.to, subject: title, html, text, orderId: o.id };
}

/* ---------------------------------------------------------------- zásielka odoslaná */

export function shippedEmail(i: { order: OrderLike; to: string; name?: string | null; trackingLinks: string[]; trackingNumbers: string[] }): Mail {
  const o = i.order;
  const delivery = deliveryText(o.ship_to);
  const t = o.ship_to as ShipTo;
  const eta = METHODS[t.delivery_method as DeliveryMethod]?.eta ?? '';
  const link = i.trackingLinks[0];
  const title = `Balík s granulami je na ceste · objednávka ${o.number}`;
  const html = layout(
    title,
    h1('Balík je na ceste.') +
      p(`${i.name ? `Ahoj ${esc(i.name.split(' ')[0])},` : 'Ahoj,'} tvoje granule odišli zo skladu.${eta ? ` Doručenie zvyčajne trvá ${esc(eta)}.` : ''}`) +
      `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 16px;font-size:15px">${row('Číslo objednávky', String(o.number))}${row('Doručenie', delivery)}${i.trackingNumbers.length ? row('Číslo zásielky', i.trackingNumbers.join(', ')) : ''}</table>` +
      (link ? button(link, 'Sledovať zásielku') : p('Odkaz na sledovanie ti pošle aj dopravca SMS alebo e-mailom.')),
  );
  const text = [
    `${i.name ? `Ahoj ${i.name.split(' ')[0]},` : 'Ahoj,'} tvoje granule odišli zo skladu.${eta ? ` Doručenie zvyčajne trvá ${eta}.` : ''}`,
    '',
    `Číslo objednávky: ${o.number}`,
    `Doručenie: ${delivery}`,
    ...(i.trackingNumbers.length ? [`Číslo zásielky: ${i.trackingNumbers.join(', ')}`] : []),
    ...(link ? [`Sledovať zásielku: ${link}`] : []),
    '',
    `Potrebuješ pomôcť? ${SUPPORT_EMAIL}`,
  ].join('\n');
  return { key: `shipped:${o.id}`, kind: 'shipped', to: i.to, subject: title, html, text, orderId: o.id };
}

/* ---------------------------------------------------------------- neúspešná platba */

export function paymentFailedEmail(i: { invoiceId: string; attempt: number; to: string; name?: string | null; amountCents: number; payUrl?: string | null; nextAttempt?: Date | null }): Mail {
  const title = 'Platba za granule neprešla';
  const retry = i.nextAttempt ? ` Platbu skúsime znova ${dateSk(i.nextAttempt)}.` : '';
  const html = layout(
    title,
    h1('Platba neprešla.') +
      p(`${i.name ? `Ahoj ${esc(i.name.split(' ')[0])},` : 'Ahoj,'} platbu ${eur(i.amountCents)} za ďalšie vrece sa nepodarilo strhnúť z karty.${retry} Kým platba neprejde, vrece neodošleme.`) +
      (i.payUrl ? p('Zaplatiť môžeš hneď, aj inou kartou:') + button(i.payUrl, 'Zaplatiť teraz') : p(`Ak chceš zmeniť kartu, napíš nám na ${SUPPORT_EMAIL}.`)),
  );
  const text = [
    `${i.name ? `Ahoj ${i.name.split(' ')[0]},` : 'Ahoj,'} platbu ${eur(i.amountCents)} za ďalšie vrece sa nepodarilo strhnúť z karty.${retry} Kým platba neprejde, vrece neodošleme.`,
    ...(i.payUrl ? ['', `Zaplatiť teraz (aj inou kartou): ${i.payUrl}`] : []),
    '',
    `Potrebuješ pomôcť? ${SUPPORT_EMAIL}`,
  ].join('\n');
  return { key: `payment-failed:${i.invoiceId}:${i.attempt}`, kind: 'payment_failed', to: i.to, subject: title, html, text };
}

/* ---------------------------------------------------------------- interné upozornenia */

export function adminEmail(i: { key: string; kind: string; to: string; subject: string; lines: string[] }): Mail {
  const html = layout(i.subject, h1(i.subject) + i.lines.map((l) => p(esc(l))).join(''));
  return { key: i.key, kind: i.kind, to: i.to, subject: `[Granula] ${i.subject}`, html, text: i.lines.join('\n') };
}
