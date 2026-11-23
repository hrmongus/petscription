/*
 * Transakčné emaily (SPEC P5). HTML = návrh v content/emails/*.html (premenné {{…}}, bloky {{#x}}…{{/x}}),
 * vygenerovaný do lib/email-templates.ts (npm run emails). Text verzia sa skladá tu. Obrázky (logo, vrecia)
 * sú na https://www.granula.sk/img/email/ (public/granula/img/email/).
 * Ceny sú konečné (firma nie je platiteľ DPH, SPEC P1) → nikde „s DPH“.
 *
 *   1 potvrdenie, predplatné (first) · 2 obnovenie (renewal) · 3 potvrdenie, jednorazovo (one_off)
 *   4 zásielka odoslaná (FHB sent) · 5 neúspešná platba (invoice.payment_failed) · interné upozornenia (adminEmail)
 */
import { METHODS, shippingPrice, type DeliveryMethod } from './carriers';
import { dogCases } from './dog-name';
import { EMAIL_TEMPLATES, type EmailTemplate } from './email-templates';
import { allSkus, serverParams, type BagId } from './engine-server';
import type { ShipTo } from './fhb/build-order';
import type { Mail } from './email';

export const SUPPORT_EMAIL = 'podpora@granula.sk';
export const EMAIL_IMG_BASE = 'https://www.granula.sk/img/email';

/** id receptúry z engine.js → názov fotky vreca `vrece-<slug>.jpg` */
export const PRODUCT_SLUG: Record<string, string> = {
  'hovadzie-morka-jahna': 'hovadzie-morka-jahna',
  'morka-hus-kacica': 'morka-hus-kacica',
  hovadzie: 'hovadzie-ryza',
  jahna: 'jahna-bataty-cucoriedky',
  'jelen-kralik': 'jelen-kralik',
};

const CARRIER: Record<DeliveryMethod, { long: string; short: string }> = {
  packeta_point: { long: 'Packeta, výdajné miesto', short: 'Packeta' },
  dpd_pickup: { long: 'DPD, výdajné miesto', short: 'DPD' },
  sps_courier: { long: 'SPS, kuriér na adresu', short: 'SPS' },
};

const escHtml = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
export const eur = (cents: number) => `${(cents / 100).toFixed(2).replace('.', ',')} €`;
export const dateSk = (d: Date) => {
  const p = new Intl.DateTimeFormat('sk-SK', { day: 'numeric', month: 'numeric', year: 'numeric', timeZone: 'Europe/Bratislava' }).formatToParts(d);
  const v = (t: string) => p.find((x) => x.type === t)?.value ?? '';
  return `${v('day')}. ${v('month')}. ${v('year')}`; // 26. 12. 2026
};
const site = (u: string) => u.replace(/\/+$/, '');

/* ---------------------------------------------------------------- render */

export type Vars = Record<string, string>;

/** {{#x}}…{{/x}} ponechá, ak flags.x; {{var}} nahradí escapovanou hodnotou. Neznáma premenná = chyba. */
export function render(template: EmailTemplate, vars: Vars, flags: Record<string, boolean> = {}): string {
  let html: string = EMAIL_TEMPLATES[template];
  html = html.replace(/\{\{#([a-z_]+)\}\}([\s\S]*?)\{\{\/\1\}\}/g, (_, f: string, inner: string) => (flags[f] ? inner : ''));
  html = html.replace(/\{\{([a-z_]+)\}\}/g, (_, k: string) => {
    if (!(k in vars)) throw new Error(`[email] chýba premenná {{${k}}} v šablóne ${template}`);
    return escHtml(vars[k]);
  });
  return html;
}

/* ---------------------------------------------------------------- spoločné údaje */

type OrderLike = { id: string; number: number; kind: string; amount_cents: number; items: unknown; ship_to: unknown; created_at?: string | null };
export type EmailDog = { name?: string | null; sex?: string | null } | null | undefined;

function productOf(items: unknown) {
  const first = (Array.isArray(items) ? (items as { sku: string }[]) : [])[0];
  const sku = allSkus().find((x) => x.sku === first?.sku);
  const productId = sku?.productId ?? '';
  return {
    productId,
    bagKg: String(sku?.kg ?? ''),
    name: sku ? sku.name.replace(/ \d+ kg.*$/, '') : (first?.sku ?? 'Granula'),
    slug: PRODUCT_SLUG[productId] ?? 'morka-hus-kacica',
  };
}

function productById(productId: string, bagId: string) {
  const sku = allSkus().find((x) => x.productId === productId && String(x.kg) === String(bagId));
  return { productId, bagKg: String(bagId), name: sku ? sku.name.replace(/ \d+ kg.*$/, '') : productId, slug: PRODUCT_SLUG[productId] ?? 'morka-hus-kacica' };
}

export function deliveryOf(shipTo: unknown) {
  const t = (shipTo ?? {}) as ShipTo;
  const m = t.delivery_method as DeliveryMethod;
  const c = CARRIER[m] ?? { long: METHODS[m]?.label ?? String(m ?? ''), short: String(m ?? '') };
  const address =
    m === 'sps_courier'
      ? [t.street, `${t.zip ?? ''} ${t.city ?? ''}`.trim()].filter(Boolean).join(', ')
      : t.point_label || [t.point_address?.street, `${t.point_address?.zip ?? ''} ${t.point_address?.city ?? ''}`.trim()].filter(Boolean).join(', ');
  const eta = (METHODS[m]?.etaEmail ?? METHODS[m]?.eta ?? '2–4').replace(/^(\d+)\s*[–-]\s*(\d+).*$/, '$1\u00a0–\u00a0$2'); // nezalomiť „2 – 3“
  const pickupNote = METHODS[m]?.pickup === false ? 'V deň doručenia ti kuriér dá vedieť SMS alebo e-mailom.' : 'Keď budú pripravené na vyzdvihnutie, dopravca ti pošle SMS alebo e-mail.';
  return { carrier: c.long, carrierShort: c.short, address, eta, pickupNote };
}

/** cena dopravy pre spôsob a balenie (rovnaký výpočet ako checkout), keď ju volajúci nepozná */
function shippingCentsFor(shipTo: unknown, bagKg: string): number {
  const P = serverParams() as unknown as { shipping: number };
  const m = (shipTo as ShipTo | null)?.delivery_method;
  try {
    return Math.round(shippingPrice(m as DeliveryMethod, bagKg as BagId, P.shipping) * 100);
  } catch {
    return Math.round(P.shipping * 100);
  }
}

function common(siteUrl: string, name: string | null | undefined, dog: EmailDog, withdrawFor?: number) {
  const d = dogCases(dog?.name, dog?.sex);
  const s = site(siteUrl);
  return {
    first_name: (name ?? '').trim().split(' ')[0] ?? '',
    dog_name: d.nom,
    dog_name_acc: d.acc,
    dog_name_dat: d.dat,
    dog_poss: d.poss,
    url_home: `${s}/`,
    url_account: `${s}/ucet`,
    url_vop: `${s}/obchodne-podmienky`,
    url_claims: `${s}/reklamacny-poriadok`,
    url_withdraw: withdrawFor ? `${s}/odstupenie?objednavka=${withdrawFor}` : `${s}/odstupenie`,
  };
}

/** bez krstného mena: „Ďakujeme!“ / „Ahoj,“ namiesto „Ďakujeme, !“ */
const tidy = (s: string) => s.replace(/,\s*!/g, '!').replace(/Ahoj\s+,/g, 'Ahoj,');

function footerText(v: Vars) {
  return [
    '',
    `Niečo nesedí alebo sa chceš na niečo opýtať? Odpíš na tento e-mail alebo napíš na ${SUPPORT_EMAIL}.`,
    '',
    `Môj účet: ${v.url_account}`,
    `Obchodné podmienky: ${v.url_vop}`,
    `Reklamácie: ${v.url_claims}`,
    `Odstúpiť od zmluvy tu: ${v.url_withdraw}`,
    '',
    'Granula · granula.sk',
    'Spark Link, s. r. o. · Lermontovova 911/3, 811 05 Bratislava · IČO: 55615597 · DIČ: 2122032979',
  ].join('\n');
}

/* ---------------------------------------------------------------- 1–3 potvrdenie objednávky */

export type ConfirmationInput = {
  order: OrderLike;
  to: string;
  name?: string | null;
  dog?: EmailDog;
  siteUrl: string;
  /** pri predplatnom: interval a dátum ďalšej platby */
  subscription?: { days: number; nextChargeAt: Date | null } | null;
  /** rozpis ceny (zo Stripe); bez neho doprava podľa doprava-config.js a granule = spolu − doprava */
  prices?: { foodCents: number; shippingCents: number } | null;
};

export function orderConfirmationEmail(i: ConfirmationInput): Mail {
  const o = i.order;
  const prod = productOf(o.items);
  const del = deliveryOf(o.ship_to);
  const ship = i.prices?.shippingCents ?? shippingCentsFor(o.ship_to, prod.bagKg);
  const food = i.prices?.foodCents ?? o.amount_cents - ship;
  const days = i.subscription?.days ?? 0;
  const next = i.subscription?.nextChargeAt ? dateSk(i.subscription.nextChargeAt) : '';
  const v: Vars = {
    ...common(i.siteUrl, i.name, i.dog, o.number),
    order_number: String(o.number),
    order_date: dateSk(o.created_at ? new Date(o.created_at) : new Date()),
    product_name: prod.name,
    product_slug: prod.slug,
    bag_kg: prod.bagKg,
    days: String(days),
    price_food: eur(food),
    price_shipping: eur(ship),
    price_total: eur(o.amount_cents),
    next_charge: next || 'o pár týždňov',
    carrier: del.carrier,
    delivery_address: del.address,
  };
  const tpl: EmailTemplate = o.kind === 'renewal' ? '2-obnovenie-predplatneho' : o.kind === 'one_off' ? '3-potvrdenie-jednorazova' : '1-potvrdenie-predplatne';
  const subject = o.kind === 'renewal' ? `Ďalšie vrece už chystáme · objednávka č. ${o.number}` : `Objednávka č. ${o.number} je potvrdená`;

  const plan = o.kind === 'one_off' ? 'jednorazová objednávka' : `predplatné, každých ${days} dní`;
  const intro =
    o.kind === 'renewal'
      ? `Ahoj ${v.first_name}, ${v.dog_name_dat} sa pomaly míňajú granule, preto sme z predplatného zaplatili ďalšie vrece a už ho chystáme v sklade. Keď balík odíde, pošleme ti odkaz na sledovanie.`
      : `Ďakujeme, ${v.first_name}! Platbu sme prijali a granule pre ${v.dog_name_acc} už chystáme v sklade. Hneď ako balík odovzdáme dopravcovi, pošleme ti e-mail s odkazom na sledovanie.`;
  const outro =
    o.kind === 'renewal'
      ? [`Ďalšia platba bude okolo ${v.next_charge}. Ak má ${v.dog_name} granúl ešte dosť alebo sa zmenila ${v.dog_poss} váha, dodávku si posuň alebo uprav v účte: ${v.url_account}`]
      : o.kind === 'one_off'
        ? [`Nechceš strážiť, kedy dôjdu? S predplatným príde ďalšie vrece samo, presne keď ${v.dog_name_dat} dochádza to súčasné, a zaplatíš o 10 % menej. Zrušiť sa dá kedykoľvek: ${v.url_account}`]
        : [
            `Ako funguje tvoje predplatné: jedno vrece vystačí ${v.dog_name_dat} približne na ${days} dní. Ďalšie preto pošleme samo, skôr ako sa to súčasné minie. Najbližšia platba ${v.price_total} bude okolo ${v.next_charge} a pár dní vopred ti pripomenieme, že sa blíži.`,
            '',
            `V účte môžeš dodávku kedykoľvek posunúť, preskočiť, zmeniť adresu alebo predplatné zrušiť. Bez poplatkov a bez viazanosti: ${v.url_account}`,
          ];
  const text = tidy(
    [
      `Objednávka č. ${o.number}`,
      '',
      intro,
      '',
      `${prod.name}, ${prod.bagKg} kg · ${plan}`,
      `Recept pre: ${v.dog_name}`,
      `Granule: ${v.price_food}`,
      `Doprava: ${v.price_shipping}`,
      `Zaplatené: ${v.price_total}`,
      '',
      `Doručenie: ${v.carrier}, ${v.delivery_address}`,
      `Objednávka: č. ${o.number} zo dňa ${v.order_date}`,
      '',
      ...outro,
      footerText(v),
    ].join('\n'),
  );
  return { key: `order-confirm:${o.id}`, kind: 'order_confirmation', to: i.to, subject, html: tidy(render(tpl, v)), text, orderId: o.id };
}

/* ---------------------------------------------------------------- 4 zásielka odoslaná */

export function shippedEmail(i: { order: OrderLike; to: string; name?: string | null; dog?: EmailDog; siteUrl: string; trackingLinks: string[]; trackingNumbers: string[] }): Mail {
  const o = i.order;
  const prod = productOf(o.items);
  const del = deliveryOf(o.ship_to);
  const v: Vars = {
    ...common(i.siteUrl, i.name, i.dog, o.number),
    order_number: String(o.number),
    product_name: prod.name,
    product_slug: prod.slug,
    bag_kg: prod.bagKg,
    carrier: del.carrier,
    carrier_short: del.carrierShort,
    delivery_address: del.address,
    eta: del.eta,
    pickup_note: del.pickupNote,
    tracking_number: i.trackingNumbers.join(', ') || '—',
    tracking_url: i.trackingLinks[0] ?? `${site(i.siteUrl)}/podpora`,
  };
  const isFirst = o.kind === 'first' || o.kind === 'one_off';
  const subject = `Balík s granulami je na ceste · objednávka č. ${o.number}`;
  const text = tidy(
    [
      `Objednávka č. ${o.number}`,
      '',
      `Ahoj ${v.first_name}, granule pre ${v.dog_name_acc} práve odišli zo skladu. ${v.carrier_short} ich zvyčajne doručí do ${v.eta} pracovných dní. ${v.pickup_note}`,
      '',
      `${prod.name}, ${prod.bagKg} kg · recept pre: ${v.dog_name}`,
      `Doručenie: ${v.carrier}, ${v.delivery_address}`,
      `Číslo zásielky: ${v.tracking_number}`,
      ...(i.trackingLinks[0] ? [`Sledovať zásielku: ${i.trackingLinks[0]}`] : []),
      ...(isFirst
        ? ['', 'Prvé vrece? Prechádzaj postupne: nové granule miešaj so starými asi týždeň: prvé dva dni štvrtinu nových, potom polovicu, potom tri štvrtiny a od siedmeho dňa už len Granulu. Bruško si tak zvykne bez problémov.']
        : []),
      footerText(v),
    ].join('\n'),
  );
  return { key: `shipped:${o.id}`, kind: 'shipped', to: i.to, subject, html: tidy(render('4-zasielka-odoslana', v, { first: isFirst })), text, orderId: o.id };
}

/* ---------------------------------------------------------------- 5 neúspešná platba */

export type PaymentFailedInput = {
  invoiceId: string;
  attempt: number;
  to: string;
  name?: string | null;
  dog?: EmailDog;
  siteUrl: string;
  product: { productId: string; bagId: string; days: number };
  totalCents: number;
  shippingCents?: number | null;
  payUrl?: string | null;
  nextAttempt?: Date | null;
};

export function paymentFailedEmail(i: PaymentFailedInput): Mail {
  const prod = productById(i.product.productId, i.product.bagId);
  const ship = i.shippingCents ?? Math.round((serverParams() as unknown as { shipping: number }).shipping * 100);
  const v: Vars = {
    ...common(i.siteUrl, i.name, i.dog),
    product_name: prod.name,
    product_slug: prod.slug,
    bag_kg: prod.bagKg,
    days: String(i.product.days),
    price_food: eur(i.totalCents - ship),
    price_shipping: eur(ship),
    price_total: eur(i.totalCents),
    retry_date: i.nextAttempt ? dateSk(i.nextAttempt) : '',
    pay_url: i.payUrl || `${site(i.siteUrl)}/ucet`,
  };
  const subject = 'Platba za granule zlyhala';
  const text = tidy(
    [
      `Predplatné · ${v.dog_name}`,
      '',
      `Ahoj ${v.first_name}, platba ${v.price_total} za ďalšie vrece pre ${v.dog_name_acc} z tvojej karty zlyhala. Najčastejšie ide o kartu, ktorej skončila platnosť, vyčerpaný limit alebo banku, ktorá chce platbu potvrdiť.`,
      '',
      `${i.nextAttempt ? `Platbu skúsime znova ${v.retry_date}. ` : ''}Ak chceš, aby vrece odišlo čo najskôr, zaplať hneď. Pokojne aj inou kartou.`,
      `Zaplatiť ${v.price_total}: ${v.pay_url}`,
      '',
      `Prípadne zmeň kartu v účte, ďalšie platby potom pôjdu z nej: ${v.url_account}`,
      '',
      `${prod.name}, ${prod.bagKg} kg · predplatné, každých ${v.days} dní`,
      `Na úhradu: ${v.price_total} (granule ${v.price_food}, doprava ${v.price_shipping})`,
      'Vrece odošleme hneď, ako platba prejde.',
      footerText(v),
    ].join('\n'),
  );
  return { key: `payment-failed:${i.invoiceId}:${i.attempt}`, kind: 'payment_failed', to: i.to, subject, html: tidy(render('5-neuspesna-platba', v, { retry: !!i.nextAttempt })), text };
}

/* ---------------------------------------------------------------- interné upozornenia */

export function adminEmail(i: { key: string; kind: string; to: string; subject: string; lines: string[] }): Mail {
  const f = "font-family:'Montserrat',Arial,Helvetica,sans-serif;";
  const html = `<!doctype html><html lang="sk"><head><meta charset="utf-8"><title>${escHtml(i.subject)}</title></head>
<body style="margin:0;padding:24px 12px;background:#F4EBE2;color:#000;${f}font-size:15px;line-height:1.5">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto">
<tr><td style="padding:0 0 16px"><img src="${EMAIL_IMG_BASE}/logo-granula.png" width="160" alt="GRANULA!" style="display:block;width:160px;height:auto;border:0"></td></tr>
<tr><td style="background:#FFFBF6;border:2px solid #000;padding:24px">
<p style="margin:0 0 8px;font-size:12px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#5C5650">Interné upozornenie</p>
<h1 style="margin:0 0 14px;font-size:22px;line-height:1.15;font-weight:900;text-transform:uppercase">${escHtml(i.subject)}</h1>
${i.lines.map((l) => `<p style="margin:0 0 10px">${escHtml(l)}</p>`).join('')}
</td></tr></table></body></html>`;
  return { key: i.key, kind: i.kind, to: i.to, subject: `[Granula] ${i.subject}`, html, text: i.lines.join('\n') };
}

/* ---------------------------------------------------------------- 6 pripomienka pred platbou (SPEC P5) */

export type RenewalReminderInput = {
  subscriptionId: string;
  to: string;
  name?: string | null;
  dog?: EmailDog;
  siteUrl: string;
  product: { productId: string; bagId: string; days: number };
  nextCharge: Date;
  foodCents: number;
  shippingCents: number;
  shipTo: unknown;
};

/** kľúč podľa predplatného a dňa platby: posunutá platba = nová pripomienka, tá istá sa nepošle dvakrát */
export function renewalReminderEmail(i: RenewalReminderInput): Mail {
  const prod = productById(i.product.productId, i.product.bagId);
  const del = deliveryOf(i.shipTo);
  const v: Vars = {
    ...common(i.siteUrl, i.name, i.dog),
    product_name: prod.name,
    product_slug: prod.slug,
    bag_kg: prod.bagKg,
    days: String(i.product.days),
    price_food: eur(i.foodCents),
    price_shipping: eur(i.shippingCents),
    price_total: eur(i.foodCents + i.shippingCents),
    next_charge: dateSk(i.nextCharge),
    carrier: del.carrier,
    delivery_address: del.address,
  };
  const subject = `Ďalšie vrece pošleme o pár dní · ${v.next_charge}`;
  const text = tidy(
    [
      `Predplatné · ${v.dog_name}`,
      '',
      `Ahoj ${v.first_name}, okolo ${v.next_charge} zaplatíme z tvojej karty ${v.price_total} za ďalšie vrece pre ${v.dog_name_acc} a hneď ho pošleme. Nemusíš nič robiť.`,
      '',
      `Ak má ${v.dog_name} granúl ešte dosť alebo sa zmenila ${v.dog_poss} váha, dodávku si posuň, preskoč alebo uprav v účte: ${v.url_account}. Stačí aj odpísať na tento e-mail.`,
      '',
      `${prod.name}, ${prod.bagKg} kg · predplatné, každých ${v.days} dní`,
      `Na úhradu: ${v.price_total} (granule ${v.price_food}, doprava ${v.price_shipping})`,
      `Vrece pošleme na: ${v.carrier}, ${v.delivery_address}. Ak sa adresa zmenila, daj nám vedieť.`,
      footerText(v),
    ].join('\n'),
  );
  const day = i.nextCharge.toISOString().slice(0, 10);
  return { key: `renewal-reminder:${i.subscriptionId}:${day}`, kind: 'renewal_reminder', to: i.to, subject, html: tidy(render('6-pripomienka-platby', v)), text };
}
