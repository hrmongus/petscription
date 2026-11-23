import { z } from 'zod';
import type { Json, Tables, TablesInsert, TablesUpdate } from './database.types';
import { AnswersSchema, BagIdSchema, computeServer, PlanSchema, quote, type Quote } from './engine-server';

/*
 * P7: všetky odpovede z dotazníka (SPEC P7, tabuľka quiz_sessions).
 * Prehliadač posiela po každom kroku POST /api/quiz { id, step, answers, plan?, bag?, method?, utm?, referrer?, landing? }.
 * Nič z prehliadača sa neberie naslepo:
 *   - odpovede prejdú po jednotlivých poliach whitelistom AnswersSchema (neplatné pole sa zahodí, nie celá požiadavka),
 *   - výsledok (recept, gramy, D, cena) sa počíta tu cez engine s predvolenými PARAMS (lib/engine-server.ts),
 *   - prvý zdroj návštevy (utm, referrer, vstupná stránka) sa zapíše iba raz a neskôr sa neprepíše,
 *   - zaplatená session (order_id) sa už nemení.
 * Email a customer_id sa doplnia až pri checkoute (linkCheckout), objednávka z webhooku (linkOrder).
 */

/** text políčka v checkoute (doklad súhlasu v quiz_sessions.reminder_consent_text); musí sedieť s granule-na-mieru.html */
export const REMINDER_TEXT = 'Ak objednávku nedokončíš, pripomenieme ti ju e-mailom.';

export const QUIZ_STEPS = ['krok-1', 'krok-2', 'krok-3', 'krok-4', 'krok-5', 'krok-6', 'krok-7', 'miesame', 'vysledok', 'objednavka', 'platba', 'hotovo'] as const;
export type QuizStep = (typeof QUIZ_STEPS)[number];
const AFTER_QUIZ = new Set<QuizStep>(['miesame', 'vysledok', 'objednavka', 'platba', 'hotovo']);

/** krok-N → N, po dotazníku 7 */
export const stepNo = (s: QuizStep) => (s.startsWith('krok-') ? Number(s.slice(5)) : 7);

const str = (max: number) => z.string().trim().max(max);
const UtmSchema = z
  .object({
    utm_source: str(100), utm_medium: str(100), utm_campaign: str(150), utm_term: str(150), utm_content: str(150),
    // id kliknutia (fbclid, gclid…) sa neukladá, iba informácia, že bol v URL
    click: z.enum(['fbclid', 'gclid', 'ttclid', 'msclkid']),
  })
  .partial();

export const QuizInputSchema = z.object({
  id: z.string().uuid(),
  step: z.enum(QUIZ_STEPS),
  answers: z.record(z.string(), z.unknown()).optional(),
  plan: PlanSchema.optional().catch(undefined),
  bag: BagIdSchema.optional().catch(undefined),
  method: z.enum(['packeta_point', 'dpd_pickup', 'sps_courier']).optional().catch(undefined),
  utm: UtmSchema.optional().catch(undefined),
  referrer: z.string().max(500).optional().catch(undefined),
  landing: z.string().max(300).optional().catch(undefined),
});
export type QuizInput = z.infer<typeof QuizInputSchema>;

/** Odpovede po jednotlivých poliach (rozpracovaný dotazník nie je úplný): platné polia ostanú, neplatné vypadnú. */
export function partialAnswers(input: Record<string, unknown> | undefined): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!input) return out;
  const shape = AnswersSchema.shape as Record<string, z.ZodType>;
  for (const [k, schema] of Object.entries(shape)) {
    if (!(k in input)) continue;
    const r = schema.safeParse(input[k]);
    if (r.success && r.data !== undefined) out[k] = r.data;
  }
  return out;
}

/** Iba doména odkazujúcej stránky (bez cesty a parametrov); vlastná doména = null. */
export function referrerHost(ref: string | undefined, ownHost?: string): string | null {
  if (!ref) return null;
  try {
    const h = new URL(ref).hostname.replace(/^www\./, '').toLowerCase();
    if (!h || (ownHost && h === ownHost.replace(/^www\./, '').toLowerCase())) return null;
    return h.slice(0, 120);
  } catch {
    return null;
  }
}

export type QuizResult = {
  product_id: string;
  recommended_id: string;
  swapped: boolean;
  eligible: boolean;
  bag_id: string;
  plan: string;
  grams_per_day: number;
  days_per_bag: number;
  /** cena vreca po zľave plánu (centy) */
  unit_cents: number;
  per_day_cents: number;
};

export function resultFromQuote(q: Quote): QuizResult {
  return {
    product_id: q.productId, recommended_id: q.recommendedId, swapped: q.swapped, eligible: q.eligible,
    bag_id: q.bagId, plan: q.plan, grams_per_day: q.gramsPerDay, days_per_bag: q.daysPerBag,
    unit_cents: q.unitAmountCents, per_day_cents: Math.round(q.unitAmountCents / q.daysPerBag),
  };
}

/** Výsledok zo servera (engine), ak sú odpovede úplné; inak null. */
export function quizResult(answers: Record<string, unknown>, plan: string | undefined, bag: string | undefined): QuizResult | null {
  try {
    // bez zvoleného balenia odporúčané vrece z engine (recBag), ako predvolí dotazník
    const bagId = bag ?? computeServer(answers).result.recBag;
    return resultFromQuote(quote({ answers, plan: plan ?? 'mesiac', bagId }));
  } catch {
    /* neúplné odpovede */
  }
  return null;
}

export type QuizRow = Tables<'quiz_sessions'>;
export type QuizStore = {
  get(id: string): Promise<QuizRow | null>;
  insert(row: TablesInsert<'quiz_sessions'>): Promise<void>;
  update(id: string, patch: TablesUpdate<'quiz_sessions'>): Promise<void>;
};

/** Zápis kroku. Vráti false, ak sa session už nemení (zaplatená). */
export async function saveQuizStep(input: QuizInput, store: QuizStore, opts: { ownHost?: string } = {}): Promise<{ saved: boolean; completed: boolean }> {
  const existing = await store.get(input.id);
  if (existing?.order_id) return { saved: false, completed: existing.completed };
  const answers = { ...((existing?.answers as Record<string, unknown>) ?? {}), ...partialAnswers(input.answers) };
  const plan = input.plan ?? existing?.plan ?? undefined;
  const bag = input.bag ?? existing?.bag_id ?? undefined;
  const result = AFTER_QUIZ.has(input.step) ? quizResult(answers, plan, bag) : null;
  const completed = (existing?.completed ?? false) || !!result;
  const patch: TablesUpdate<'quiz_sessions'> = {
    last_step: input.step,
    // posiela sa obrazovka, na ktorej človek je: na krok-N je hotových N − 1 krokov, po dotazníku všetkých 7
    max_step: Math.max(existing?.max_step ?? 0, stepNo(input.step) - (input.step.startsWith('krok-') ? 1 : 0)),
    answers: answers as Json,
    completed,
    ...(result ? { result: result as unknown as Json } : {}),
    ...(input.plan ? { plan: input.plan } : {}),
    ...(input.bag ? { bag_id: input.bag } : {}),
    ...(input.method ? { delivery_method: input.method } : {}),
  };
  if (existing) {
    await store.update(input.id, patch);
  } else {
    await store.insert({
      id: input.id,
      ...patch,
      utm: input.utm && Object.keys(input.utm).length ? (input.utm as Json) : null,
      referrer: referrerHost(input.referrer, opts.ownHost),
      landing_path: input.landing ? input.landing.split(/[?#]/)[0].slice(0, 200) : null,
    } as TablesInsert<'quiz_sessions'>);
  }
  return { saved: true, completed };
}

/** Checkout (POST /api/checkout): spárovanie so zákazníkom, psom a voľbami. Chýbajúca session sa založí. */
export async function linkCheckout(
  id: string,
  link: {
    email: string; customerId: string; dogId: string; answers: unknown; plan: string; bag: string; method: string; result: QuizResult | null;
    /** políčko „Ak objednávku nedokončíš, pripomenieme ti ju e-mailom“ (doklad súhlasu: hodnota, čas servera, text) */
    reminder?: { consent: boolean; text: string };
  },
  store: QuizStore,
  now = new Date(),
): Promise<void> {
  const existing = await store.get(id);
  if (existing?.order_id) return;
  const patch: TablesUpdate<'quiz_sessions'> = {
    email: link.email,
    customer_id: link.customerId,
    dog_id: link.dogId,
    plan: link.plan,
    bag_id: link.bag,
    delivery_method: link.method,
    last_step: 'platba',
    max_step: 7,
    completed: true,
    answers: link.answers as Json,
    ...(link.result ? { result: link.result as unknown as Json } : {}),
    checkout_started_at: existing?.checkout_started_at ?? now.toISOString(),
    // súhlas (alebo jeho odvolanie) sa zapíše s časom iba pri zmene, aby čas ostal časom udelenia
    ...(link.reminder && existing?.reminder_consent !== link.reminder.consent
      ? { reminder_consent: link.reminder.consent, reminder_consent_at: now.toISOString(), reminder_consent_text: link.reminder.text }
      : {}),
  };
  if (existing) await store.update(id, patch);
  else await store.insert({ id, ...patch } as TablesInsert<'quiz_sessions'>);
}

/** Webhook (checkout.session.completed): session → objednávka. Bez session (starý klient) nič. */
export async function linkOrder(id: string | null | undefined, orderId: string, store: QuizStore, now = new Date()): Promise<void> {
  if (!id || !z.string().uuid().safeParse(id).success) return;
  const existing = await store.get(id);
  if (!existing || existing.order_id) return;
  await store.update(id, { order_id: orderId, paid_at: now.toISOString(), last_step: 'hotovo' });
}

/** Obnovenie z odkazu v emaile (Klaviyo, opustený košík): iba nezaplatená session do 90 dní. */
export function restorable(row: QuizRow | null, now = new Date()): row is QuizRow {
  if (!row || row.order_id || !row.completed) return false;
  return now.getTime() - new Date(row.started_at).getTime() <= 90 * 86_400_000;
}

/** Supabase úložisko (service role, iba server). */
export async function supabaseQuizStore(): Promise<QuizStore> {
  const { db } = await import('./db');
  return {
    async get(id) {
      const { data, error } = await db().from('quiz_sessions').select('*').eq('id', id).maybeSingle();
      if (error) throw new Error(error.message);
      return data;
    },
    async insert(row) {
      const { error } = await db().from('quiz_sessions').insert(row);
      // súbežné prvé dva kroky: druhý zápis sa zmení na update
      if (error?.code === '23505') {
        const { id, utm: _u, referrer: _r, landing_path: _l, ...rest } = row;
        const { error: e2 } = await db().from('quiz_sessions').update(rest).eq('id', id);
        if (e2) throw new Error(e2.message);
        return;
      }
      if (error) throw new Error(error.message);
    },
    async update(id, patch) {
      const { error } = await db().from('quiz_sessions').update(patch).eq('id', id);
      if (error) throw new Error(error.message);
    },
  };
}
