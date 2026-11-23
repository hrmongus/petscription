/*
 * E-maily zákazníkovi po akciách admina (SPEC §10.34, rozhodnutie 23. 11.): refund, storno objednávky, zrušenie
 * predplatného, zmena predplatného. Dizajn ako ostatné transakčné e-maily (šablóna content/emails/9-zmena.html),
 * odosielanie cez lib/email.ts → email_log: kľúč zaručí, že ten istý e-mail odíde iba raz.
 */
import type { Mail } from './email';
import { common, dateSk, eur, footerText, productById, productOf, render, shipEur, tidy, type EmailDog, type Vars } from './emails';

type Row = [string, string];

type Base = { to: string; name?: string | null; dog?: EmailDog; siteUrl: string };

/** spoločné poskladanie: rovnaké texty v HTML aj v textovej verzii */
function build(o: {
  key: string;
  kind: string;
  base: Base;
  subject: string;
  preheader: string;
  label: string;
  title: string;
  intro: string;
  more?: string;
  product?: { name: string; slug: string } | null;
  boxTitle: string;
  boxSub: string;
  rows: Row[];
  outro: string;
  account?: boolean;
  orderId?: string | null;
  withdrawFor?: number;
}): Mail {
  const c = common(o.base.siteUrl, o.base.name, o.base.dog, o.withdrawFor);
  const rows = o.rows.slice(0, 4);
  const keys = ['ra', 'rb', 'rc', 'rd'];
  const v: Vars = {
    ...c,
    subject: o.subject,
    preheader: o.preheader,
    label: o.label,
    title: o.title,
    intro: o.intro,
    intro_more: o.more ?? '',
    product_name: o.product?.name ?? '',
    product_slug: o.product?.slug ?? '',
    box_title: o.boxTitle,
    box_sub: o.boxSub,
    outro: o.outro,
  };
  const flags: Record<string, boolean> = { more: !!o.more, product: !!o.product, account: !!o.account };
  keys.forEach((k, i) => {
    v[`${k}_label`] = rows[i]?.[0] ?? '';
    v[`${k}_value`] = rows[i]?.[1] ?? '';
    flags[k] = !!rows[i];
  });
  const text = tidy(
    [
      o.label,
      '',
      o.intro,
      ...(o.more ? ['', o.more] : []),
      '',
      `${o.boxTitle} · ${o.boxSub}`,
      ...rows.map(([l, x]) => `${l}: ${x}`),
      '',
      o.outro,
      ...(o.account ? [`Predplatné si môžeš kedykoľvek upraviť v účte: ${c.url_account}`] : []),
      footerText(v),
    ].join('\n'),
  );
  return { key: o.key, kind: o.kind, to: o.base.to, subject: o.subject, html: tidy(render('9-zmena', v, flags)), text, orderId: o.orderId ?? null };
}

type OrderLike = { id: string; number: number; items: unknown; amount_cents: number };

/** Refund (celý alebo čiastočný). Kľúč = id refundu v Stripe. */
export function refundEmail(i: Base & { order: OrderLike; refundId: string; amountCents: number; full: boolean }): Mail {
  const p = productOf(i.order.items);
  const c = common(i.siteUrl, i.name, i.dog);
  return build({
    key: `refund:${i.refundId}`,
    kind: 'refund',
    base: i,
    orderId: i.order.id,
    subject: `Vrátili sme ti ${eur(i.amountCents)} · objednávka ${i.order.number}`,
    preheader: 'Peniaze sú na ceste späť na tvoju kartu.',
    label: `Objednávka ${i.order.number}`,
    title: 'Peniaze sme vrátili',
    intro: `Ahoj ${c.first_name}, ${i.full ? 'za objednávku' : 'časť platby za objednávku'} č. ${i.order.number} sme ti vrátili ${eur(i.amountCents)} na kartu, z ktorej prišla platba.`,
    more: 'Na účte ich uvidíš zvyčajne do 5 až 10 pracovných dní, podľa banky.',
    product: { name: p.name, slug: p.slug },
    boxTitle: p.name,
    boxSub: `${p.bagKg} kg · objednávka ${i.order.number}`,
    rows: [
      ['Zaplatené', eur(i.order.amount_cents)],
      ['Vrátené', eur(i.amountCents)],
    ],
    outro: 'Ak by peniaze do dvoch týždňov neprišli, odpíš nám na tento e-mail.',
  });
}

/** Storno objednávky pred odoslaním zo skladu; pri súčasnom refunde ho e-mail spomenie (samostatný refund e-mail sa neposiela). */
export function orderCancelledEmail(i: Base & { order: OrderLike; refundedCents?: number | null }): Mail {
  const p = productOf(i.order.items);
  const c = common(i.siteUrl, i.name, i.dog);
  const refunded = (i.refundedCents ?? 0) > 0;
  return build({
    key: `order-cancelled:${i.order.id}`,
    kind: 'order_cancelled',
    base: i,
    orderId: i.order.id,
    subject: `Objednávka ${i.order.number} je zrušená`,
    preheader: refunded ? `Zrušili sme ju a vrátili ti ${eur(i.refundedCents!)}.` : 'Zrušili sme ju skôr, ako odišla zo skladu.',
    label: `Objednávka ${i.order.number}`,
    title: 'Objednávka je zrušená',
    intro: `Ahoj ${c.first_name}, objednávku č. ${i.order.number} sme zrušili skôr, ako odišla zo skladu, takže ti nič nepríde.`,
    more: refunded ? `Peniaze (${eur(i.refundedCents!)}) sme vrátili na tvoju kartu. Na účte ich uvidíš zvyčajne do 5 až 10 pracovných dní.` : undefined,
    product: { name: p.name, slug: p.slug },
    boxTitle: p.name,
    boxSub: `${p.bagKg} kg · objednávka ${i.order.number}`,
    rows: [['Zaplatené', eur(i.order.amount_cents)], ...(refunded ? ([['Vrátené', eur(i.refundedCents!)]] as Row[]) : [])],
    outro: 'Ak ide o omyl, odpíš nám na tento e-mail a hneď to vyriešime.',
  });
}

type SubLike = { id: string; product_id: string; bag_id: string; days_per_bag: number; grams_per_day: number; unit_amount_cents: number };

/** Zrušenie predplatného (ku koncu obdobia alebo hneď). Kľúč = predplatné: zrušenie sa oznámi iba raz. */
export function subscriptionCancelledEmail(i: Base & { sub: SubLike; mode: 'period_end' | 'now' }): Mail {
  const p = productById(i.sub.product_id, i.sub.bag_id);
  const c = common(i.siteUrl, i.name, i.dog);
  return build({
    key: `subscription-cancelled:${i.sub.id}`,
    kind: 'subscription_cancelled',
    base: i,
    subject: 'Predplatné Granuly je zrušené',
    preheader: 'Ďalšie platby už nebudú.',
    label: `Predplatné · ${c.dog_name}`,
    title: 'Predplatné je zrušené',
    intro: `Ahoj ${c.first_name}, predplatné granúl pre ${c.dog_name_acc} sme zrušili. Ďalšie platby z tvojej karty už nebudú.`,
    more: i.mode === 'period_end' ? 'Vrece, ktoré už máš zaplatené, ti normálne doručíme.' : undefined,
    product: { name: p.name, slug: p.slug },
    boxTitle: p.name,
    boxSub: `${p.bagKg} kg · predplatné, každých ${i.sub.days_per_bag} dní`,
    rows: [['Stav', 'zrušené']],
    outro: 'Ak budeš chcieť predplatné obnoviť, stačí odpísať na tento e-mail.',
  });
}

/**
 * Zmena predplatného (receptúra, balenie, váha, vek → nová dávka, interval a cena). Kľúč = predplatné + nové hodnoty
 * a dátum ďalšej platby: tá istá zmena sa neoznámi dvakrát, každá ďalšia zmena áno.
 */
export function subscriptionChangedEmail(i: Base & { sub: SubLike; shippingCents: number; nextCharge: Date }): Mail {
  const p = productById(i.sub.product_id, i.sub.bag_id);
  const c = common(i.siteUrl, i.name, i.dog);
  const total = i.sub.unit_amount_cents + i.shippingCents;
  const s = i.sub;
  return build({
    key: `subscription-changed:${s.id}:${s.product_id}:${s.bag_id}:${s.grams_per_day}:${s.days_per_bag}:${total}:${i.nextCharge.toISOString().slice(0, 10)}`,
    kind: 'subscription_changed',
    base: i,
    subject: `Upravili sme predplatné · ${c.dog_name}`,
    preheader: `Ďalšia platba ${dateSk(i.nextCharge)}, ${eur(total)}.`,
    label: `Predplatné · ${c.dog_name}`,
    title: 'Predplatné je upravené',
    intro: `Ahoj ${c.first_name}, upravili sme predplatné granúl pre ${c.dog_name_acc}. Dávku, interval aj cenu sme prepočítali, takto to vyzerá odteraz:`,
    product: { name: p.name, slug: p.slug },
    boxTitle: p.name,
    boxSub: `${p.bagKg} kg · predplatné, každých ${s.days_per_bag} dní`,
    rows: [
      ['Denná dávka', `${s.grams_per_day} g`],
      ['Granule', eur(s.unit_amount_cents)],
      ['Doprava', shipEur(i.shippingCents)],
      ['Ďalšia platba', `${dateSk(i.nextCharge)} · ${eur(total)}`],
    ],
    outro: 'Ak niečo nesedí, odpíš nám na tento e-mail.',
    account: true,
  });
}
