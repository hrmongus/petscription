/*
 * Odstúpenie od zmluvy (SPEC P4, § 20a zák. 108/2024 Z. z.). Volá ho verejná stránka /odstupenie
 * (POST /api/odstupenie) a neskôr tlačidlo v /ucet.
 *
 * Poradie (záznam má prednosť pred všetkým ostatným):
 *   1. záznam do withdrawals s časom servera (submitted_at = now()) – odstúpenie je prijaté, nech sa stane čokoľvek ďalej,
 *   2. ak objednávka existuje a e-mail (alebo prihlásený zákazník) sedí: lehota, zrušenie predplatného (okamžite),
 *      objednávky, ktoré ešte neodišli zo skladu: DELETE vo FHB (iba pending) → `cancelled`,
 *   3. potvrdzovací e-mail zákazníkovi (obsah odstúpenia + dátum a čas prijatia), confirmation_sent_at,
 *   4. upozornenie na ADMIN_EMAIL + audit_log.
 * Žiadny krok po zázname nehodí chybu do formulára; zlyhanie sa zapíše do actions a odstúpenie sa označí na posúdenie.
 *
 * Bez zhody e-mailu s objednávkou sa nič automaticky nerobí (inak by ktokoľvek s číslom objednávky zrušil cudzie
 * predplatné), odstúpenie sa iba zaeviduje, potvrdí a označí na posúdenie.
 * Lehota: 14 dní od prevzatia PRVÉHO tovaru (delivered_at prvej doručenej objednávky zmluvy). Pred doručením lehota
 * neplynie (odstúpiť sa dá). Po lehote sa odstúpenie prijme tiež, iba sa označí na posúdenie (rozhodne admin).
 * Peniaze sa automaticky nevracajú: refund robí admin (P3) po posúdení, resp. po vrátení tovaru.
 */
import { z } from 'zod';
import type { Json, Tables, TablesInsert, TablesUpdate } from './database.types';
import type { Mailer } from './email';
import { withdrawalConfirmationEmail, type WithdrawalAction } from './emails';
import { fhbOrderId } from './fhb/build-order';
import type { FhbOrder } from './fhb/client';
import { notifyAdmin } from './notify';

export const WITHDRAWAL_DAYS = 14;
export const TZ = 'Europe/Bratislava';
/** rovnaké odstúpenie (e-mail + číslo) do 10 min = dvojklik / opakované odoslanie → vráti sa pôvodný záznam */
export const DUPLICATE_WINDOW_MS = 10 * 60_000;
/** ochrana proti zneužitiu (posielanie e-mailov na cudzie adresy): najviac 10 odstúpení z jedného e-mailu za 24 h */
export const MAX_PER_EMAIL_PER_DAY = 10;

type Order = Tables<'orders'>;
type Subscription = Tables<'subscriptions'>;
type Withdrawal = Tables<'withdrawals'>;

export type WithdrawalInput = {
  name: string;
  email: string;
  contractRef: string;
  reason?: string | null;
  /** prihlásený zákazník (/ucet): zhoda podľa zákazníka namiesto e-mailu */
  customerId?: string | null;
  source: 'web' | 'ucet';
  ip?: string | null;
  userAgent?: string | null;
};

export type WithdrawalStore = {
  findOrderByNumber(n: number): Promise<Order | null>;
  getCustomer(id: string): Promise<{ id: string; email: string; name: string | null } | null>;
  getSubscription(id: string): Promise<Subscription | null>;
  ordersOfSubscription(id: string): Promise<Order[]>;
  /** odstúpenia z daného e-mailu (bez ohľadu na veľkosť písmen) od daného času, najnovšie prvé */
  recentByEmail(email: string, since: Date): Promise<Withdrawal[]>;
  insertWithdrawal(row: TablesInsert<'withdrawals'>): Promise<Withdrawal>;
  updateWithdrawal(id: string, patch: TablesUpdate<'withdrawals'>): Promise<void>;
  updateOrder(id: string, patch: TablesUpdate<'orders'>): Promise<void>;
  updateSubscription(id: string, patch: TablesUpdate<'subscriptions'>): Promise<void>;
  audit(row: TablesInsert<'audit_log'>): Promise<void>;
};

export type WithdrawalDeps = {
  store: WithdrawalStore;
  /** okamžité zrušenie predplatného v Stripe (subscription-schedule `cancel(id, 'now')`) */
  cancelSubscription: (stripeSubscriptionId: string) => Promise<unknown>;
  /** FHB (null = nenastavené → objednávky vo FHB sa nekontrolujú, odstúpenie ide na posúdenie) */
  fhb: { getOrder(id: string): Promise<FhbOrder | null>; deleteOrder(id: string): Promise<void> } | null;
  mail?: Mailer;
  adminTo?: string | null;
  siteUrl: string;
  now?: () => Date;
};

export type WithdrawalResult = {
  id: string;
  submittedAt: string;
  /** „23. 11. 2026 o 14:05:12“ (Europe/Bratislava) */
  submittedAtText: string;
  name: string;
  email: string;
  contractRef: string;
  reason: string | null;
  emailSent: boolean;
  duplicate: boolean;
};

export class WithdrawalRateLimited extends Error {}

/** E-mail nesedí s objednávkou alebo objednávka neexistuje → nič sa nezaloží, formulár ukáže hlášku. */
export class WithdrawalMismatch extends Error {
  constructor(readonly ref: string) {
    super(mismatchMessage(ref));
  }
}

export const mismatchMessage = (ref: string) =>
  `Tento email nesedí s objednávkou č. ${ref}. Zadaj email, ktorý si použil pri objednávke. Ak si ho nepamätáš, napíš nám na podpora@granula.sk – odstúpenie platí aj takto.`;

/** lehota na vrátenie peňazí: 14 dní od prijatia odstúpenia (do konca dňa) */
export const refundDue = (receivedAt: Date) => endOfLocalDay(receivedAt, WITHDRAWAL_DAYS);

/** Objednávka a zákazník, ak e-mail (alebo prihlásený zákazník) sedí; inak WithdrawalMismatch. */
export async function matchOrder(input: Pick<WithdrawalInput, 'email' | 'contractRef' | 'customerId'>, store: Pick<WithdrawalStore, 'findOrderByNumber' | 'getCustomer'>) {
  const ref = input.contractRef.trim();
  const number = parseContractRef(ref);
  const order = number ? await store.findOrderByNumber(number) : null;
  const customer = order ? await store.getCustomer(order.customer_id) : null;
  const ok = !!order && !!customer && (input.customerId ? customer.id === input.customerId : customer.email.trim().toLowerCase() === input.email.trim().toLowerCase());
  if (!ok) throw new WithdrawalMismatch(number ? String(number) : ref);
  return { order: order!, customer: customer! };
}

/** formulár /odstupenie (druhý krok „Potvrdiť odstúpenie“ posiela confirm: true) */
export const WithdrawalFormSchema = z.object({
  name: z.string().trim().min(2, 'Napíš meno a priezvisko.').max(120),
  email: z.string().trim().max(254).email('Skontroluj e-mail.'),
  contractRef: z.string().trim().min(1, 'Napíš číslo objednávky alebo predplatného.').max(60),
  reason: z.string().trim().max(1000).optional().nullable(),
  confirm: z.boolean(),
  /** pasca na roboty (skryté pole) */
  website: z.string().max(0).optional(),
});

/* ---------------------------------------------------------------- pomocné funkcie (testované zvlášť) */

/** „17“, „#17“, „č. 17“, „GR-000017“ → 17; inak null */
export function parseContractRef(raw: string): number | null {
  const m = /^\s*(?:č\.?|c\.?|#|gr\s*-?|objedn[aá]vka\s*(?:č\.?)?)?\s*0*(\d{1,10})\s*$/i.exec(raw ?? '');
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isSafeInteger(n) && n >= 1 && n <= 9_999_999_999 ? n : null;
}

function tzOffsetMinutes(at: Date, tz = TZ): number {
  const name = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'shortOffset' }).formatToParts(at).find((p) => p.type === 'timeZoneName')?.value ?? 'GMT';
  const m = /GMT([+-])(\d{1,2})(?::(\d{2}))?/.exec(name);
  return m ? (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3] ?? 0)) : 0;
}

/** kalendárny deň v Bratislave */
export function localDay(at: Date, tz = TZ): { y: number; m: number; d: number } {
  const [y, m, d] = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(at).split('-').map(Number);
  return { y, m, d };
}

/** koniec dňa (23:59:59.999) v Bratislave, `addDays` dní po dni `at` */
export function endOfLocalDay(at: Date, addDays = 0, tz = TZ): Date {
  const { y, m, d } = localDay(at, tz);
  const guess = new Date(Date.UTC(y, m - 1, d + addDays, 23, 59, 59, 999));
  return new Date(guess.getTime() - tzOffsetMinutes(guess, tz) * 60_000);
}

/** posledný okamih lehoty: deň prevzatia + 14 dní, do konca dňa (odstúpenie odoslané v posledný deň je včas) */
export function withdrawalDeadline(deliveredAt: Date): Date {
  return endOfLocalDay(deliveredAt, WITHDRAWAL_DAYS);
}

/** „23. 11. 2026 o 14:05:12“ */
export function dateTimeSk(at: Date, tz = TZ): string {
  const p = new Intl.DateTimeFormat('sk-SK', { timeZone: tz, day: 'numeric', month: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).formatToParts(at);
  const v = (t: string) => p.find((x) => x.type === t)?.value ?? '';
  return `${v('day')}. ${v('month')}. ${v('year')} o ${v('hour')}:${v('minute')}:${v('second')}`;
}

const QUEUED = new Set(['pending', 'new', 'imported', 'b2b_new']);
/** stavy, v ktorých objednávka ešte nemusí byť odoslaná zo skladu */
const STOPPABLE = new Set(['paid', 'fhb_error', 'sent_to_fhb', 'confirmed']);
const SHIPPED = new Set(['sent', 'delivered']);

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 500);

/* ---------------------------------------------------------------- hlavná funkcia */

export async function submitWithdrawal(input: WithdrawalInput, deps: WithdrawalDeps): Promise<WithdrawalResult> {
  const { store } = deps;
  const now = deps.now?.() ?? new Date();
  const email = input.email.trim().toLowerCase();
  const name = input.name.trim();
  const contractRef = input.contractRef.trim();
  const reason = input.reason?.trim() || null;

  // zhoda: objednávka existuje a e-mail (alebo prihlásený zákazník) sedí. Inak sa NIČ nezaloží ani nezruší a formulár
  // ukáže chybu (SPEC §10.25). Bez overovania kódom/e-mailom: zákon zakazuje sťažovať odstúpenie.
  const { order, customer } = await matchOrder(input, store);

  // dvojklik / opakované odoslanie a ochrana proti zneužitiu
  const recent = await store.recentByEmail(email, new Date(now.getTime() - 86_400_000));
  const same = recent.find((w) => w.order_id === order.id && now.getTime() - new Date(w.submitted_at).getTime() < DUPLICATE_WINDOW_MS);
  if (same) return resultOf(same, true);
  if (recent.length >= MAX_PER_EMAIL_PER_DAY) throw new WithdrawalRateLimited('príliš veľa odstúpení z tohto e-mailu');

  const sub = order.subscription_id ? await store.getSubscription(order.subscription_id) : null;
  const orders = sub ? await store.ordersOfSubscription(sub.id) : [order];
  if (!orders.some((o) => o.id === order.id)) orders.push(order);
  const delivered = orders.map((o) => o.delivered_at).filter((d): d is string => !!d).sort();
  const deadline = delivered[0] ? withdrawalDeadline(new Date(delivered[0])) : null;
  const inDeadline = deadline ? now <= deadline : true;

  // 1. záznam (čas servera)
  const content = {
    form: { name, email, contract_ref: contractRef, reason },
    statement: 'Týmto oznamujem, že odstupujem od zmluvy.',
    source: input.source,
    ip: input.ip ?? null,
    user_agent: input.userAgent?.slice(0, 300) ?? null,
  };
  const w = await store.insertWithdrawal({
    name, email, contract_ref: contractRef, reason, content: content as Json, submitted_at: now.toISOString(), status: 'received',
    order_id: order.id, subscription_id: sub?.id ?? null, customer_id: customer.id,
    deadline_at: deadline?.toISOString() ?? null, in_deadline: inDeadline,
    refund_due_at: refundDue(now).toISOString(),
  });

  const actions: WithdrawalAction[] = [];
  const review: string[] = [];
  let returnExpected = false;
  if (!inDeadline) review.push(`Po lehote: prvý tovar prevzatý ${dateTimeSk(new Date(delivered[0]))}, lehota uplynula ${dateTimeSk(deadline!)}.`);

  // 2. akcie
  try {
    // predplatné: okamžite (SPEC §1), bez ďalších platieb
    if (sub && sub.status !== 'cancelled') {
      try {
        if (sub.stripe_subscription_id) await deps.cancelSubscription(sub.stripe_subscription_id);
        await store.updateSubscription(sub.id, { status: 'cancelled', next_charge_at: null });
        actions.push({ type: 'subscription_cancelled', ok: true });
      } catch (e) {
        actions.push({ type: 'subscription_cancelled', ok: false, error: errText(e) });
        review.push(`Predplatné sa nepodarilo zrušiť: ${errText(e)}`);
      }
    }

    // objednávky: čo ešte neodišlo, zastaviť; čo odišlo, čaká na vrátenie. Po lehote sa zaplatené objednávky
    // automaticky nezastavujú (zákazník by ostal bez tovaru aj peňazí), rozhodne admin.
    for (const o of orders.sort((a, b) => a.number - b.number)) {
      if (inDeadline && STOPPABLE.has(o.status)) {
        const r = await stopOrder(o, deps);
        actions.push(r);
        if (r.type === 'order_in_progress') returnExpected = true;
        if (!r.ok) review.push(`Objednávka č. ${o.number}: ${r.error}`);
      } else if (SHIPPED.has(o.status) && (o.id === order.id || !o.delivered_at || (deadline && new Date(o.delivered_at) <= deadline))) {
        actions.push({ type: 'order_shipped', ok: true, order: o.number, status: o.status });
        returnExpected = true;
      }
    }
  } catch (e) {
    console.error('[odstupenie] spracovanie zlyhalo', w.id, e);
    review.push(`Automatické spracovanie zlyhalo: ${errText(e)}`);
  }

  const needsReview = review.length > 0;
  const patch: TablesUpdate<'withdrawals'> = {
    actions: actions as unknown as Json,
    needs_review: needsReview,
    review_note: needsReview ? review.join(' ') : null,
    status: returnExpected ? 'return_pending' : 'received',
    return_status: returnExpected ? 'awaiting' : 'not_needed',
  };
  await store.updateWithdrawal(w.id, patch).catch((e) => console.error('[odstupenie] zápis výsledku zlyhal', w.id, e));

  // 3. potvrdenie zákazníkovi
  let emailSent = false;
  if (deps.mail) {
    try {
      const r = await deps.mail(
        withdrawalConfirmationEmail({
          withdrawalId: w.id,
          to: email,
          name,
          firstName: (customer.name || name).split(/\s+/)[0],
          contractRef,
          reason,
          receivedAt: dateTimeSk(now),
          siteUrl: deps.siteUrl,
          matched: true,
          actions,
          needsReview,
        }),
      );
      emailSent = r === 'sent' || r === 'duplicate' || r === 'skipped';
      if (r !== 'duplicate') await store.updateWithdrawal(w.id, { confirmation_sent_at: new Date().toISOString() });
    } catch (e) {
      console.error('[odstupenie] potvrdzovací e-mail zlyhal', w.id, e);
      review.push(`Potvrdzovací e-mail zlyhal: ${errText(e)}`);
      await store.updateWithdrawal(w.id, { needs_review: true, review_note: review.join(' ') }).catch(() => {});
    }
  }

  // 4. admin + audit
  await notifyAdmin(deps.mail, deps.adminTo, {
    key: `admin-withdrawal:${w.id}`,
    kind: 'admin_withdrawal',
    subject: `Odstúpenie od zmluvy: ${contractRef}${review.length ? ' (na posúdenie)' : ''}`,
    lines: [
      `Prijaté ${dateTimeSk(now)} cez ${input.source === 'ucet' ? 'účet' : 'web /odstupenie'}.`,
      `Meno: ${name} · E-mail: ${email} · Číslo: ${contractRef}`,
      `Dôvod: ${reason ?? '(neuvedený)'}`,
      `Objednávka č. ${order.number}${sub ? `, predplatné ${sub.stripe_subscription_id ?? sub.id}` : ', jednorazová'}${deadline ? `, lehota do ${dateTimeSk(deadline)}` : ', tovar ešte nedoručený'}`,
      `Akcie: ${actions.length ? actions.map(actionText).join(' · ') : 'žiadne'}`,
      ...(review.length ? [`Na posúdenie: ${review.join(' ')}`] : []),
      returnExpected ? 'Tovar už odišiel zo skladu: čaká sa na vrátenie, refund po prijatí a kontrole vreca.' : 'Tovar neodišiel zo skladu: refund v admine.',
      `Refund najneskôr do ${dateTimeSk(refundDue(now))} (14 dní od prijatia odstúpenia), vždy ručne.`,
      `Záznam withdrawals ${w.id}`,
    ],
  }).catch(() => {});
  await store
    .audit({ actor: input.source === 'ucet' ? 'customer' : 'customer:web', action: 'withdrawal.received', entity: 'withdrawal', entity_id: w.id, after: { ...patch, order_id: order.id } as unknown as Json })
    .catch((e) => console.error('[odstupenie] audit zlyhal', e));

  return { id: w.id, submittedAt: now.toISOString(), submittedAtText: dateTimeSk(now), name, email, contractRef, reason, emailSent, duplicate: false };
}

function resultOf(w: Withdrawal, duplicate: boolean): WithdrawalResult {
  const at = new Date(w.submitted_at);
  return { id: w.id, submittedAt: at.toISOString(), submittedAtText: dateTimeSk(at), name: w.name, email: w.email, contractRef: w.contract_ref, reason: w.reason, emailSent: !!w.confirmation_sent_at, duplicate };
}

/** Objednávka, ktorá ešte nemusí byť odoslaná: vo FHB pending → DELETE → cancelled; mimo FHB → cancelled. */
async function stopOrder(o: Order, deps: WithdrawalDeps): Promise<WithdrawalAction> {
  const id = fhbOrderId(o.number);
  try {
    // `paid` ešte nemusí byť vo FHB, ale cron/webhook ho môže práve posielať → overiť vždy
    if (!deps.fhb) {
      if (o.status === 'paid') {
        await deps.store.updateOrder(o.id, { status: 'cancelled' });
        return { type: 'order_cancelled', ok: true, order: o.number };
      }
      return { type: 'order_cancelled', ok: false, order: o.number, error: 'FHB nie je nastavené, stav vo FHB neoverený' };
    }
    const f = await deps.fhb.getOrder(id);
    if (!f) {
      await deps.store.updateOrder(o.id, { status: 'cancelled' });
      return { type: 'order_cancelled', ok: true, order: o.number };
    }
    if (QUEUED.has(String(f.status ?? '').toLowerCase())) {
      await deps.fhb.deleteOrder(id);
      await deps.store.updateOrder(o.id, { status: 'cancelled' });
      return { type: 'order_cancelled', ok: true, order: o.number, fhb: 'deleted' };
    }
    return { type: 'order_in_progress', ok: true, order: o.number, status: String(f.status ?? '') };
  } catch (e) {
    return { type: 'order_cancelled', ok: false, order: o.number, error: `FHB: ${errText(e)}` };
  }
}

export function actionText(a: WithdrawalAction): string {
  switch (a.type) {
    case 'subscription_cancelled':
      return a.ok ? 'predplatné zrušené' : `predplatné NEZRUŠENÉ (${a.error})`;
    case 'order_cancelled':
      return a.ok ? `objednávka č. ${a.order} zastavená${a.fhb === 'deleted' ? ' (zmazaná vo FHB)' : ''}` : `objednávka č. ${a.order} NEZASTAVENÁ (${a.error})`;
    case 'order_in_progress':
      return `objednávka č. ${a.order} sa už balí (FHB ${a.status})`;
    case 'order_shipped':
      return `objednávka č. ${a.order} už odoslaná (${a.status})`;
  }
}
