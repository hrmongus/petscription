import { describe, expect, test, vi } from 'vitest';
import { buildKlaviyoEvent, KLAVIYO_REVISION, klaviyoSender, placedOrderEvent, startedCheckoutEvent } from './klaviyo';
import { trackingEvents } from './tracking';
import type { QuizStore } from './quiz';

const QS = '11111111-1111-4111-8111-111111111111';
const started = () => startedCheckoutEvent({
  quizSessionId: QS, email: 'jan@example.sk', firstName: 'Ján', dogName: 'Bruno', productId: 'morka-hus-kacica', bagId: '9', plan: 'mesiac',
  unitCents: 6750, gramsPerDay: 240, daysPerBag: 37, carrier: 'dpd', siteUrl: 'https://www.granula.sk/',
});
function memOnce() {
  const seen = new Set<string>();
  return async (k: string, e: string) => (seen.has(`${k}:${e}`) ? false : (seen.add(`${k}:${e}`), true));
}

describe('Klaviyo zo servera', () => {
  test('bez KLAVIYO_PRIVATE_KEY sa nič nepošle (ticho)', async () => {
    const f = vi.fn();
    expect(await klaviyoSender({}, f as never, memOnce())(started())).toBe(false);
    expect(f).not.toHaveBeenCalled();
  });

  test('s kľúčom: Events API, hlavičky, profil podľa emailu, unique_id; druhý raz už nie; chyba sa nevyhodí', async () => {
    const f = vi.fn(async () => ({ ok: true, text: async () => '' }) as unknown as Response);
    const send = klaviyoSender({ KLAVIYO_PRIVATE_KEY: 'pk_test' }, f as never, memOnce());
    expect(await send(started())).toBe(true);
    expect(await send(started())).toBe(true);
    expect(f).toHaveBeenCalledTimes(1);
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://a.klaviyo.com/api/events');
    expect(init.headers).toMatchObject({ Authorization: 'Klaviyo-API-Key pk_test', revision: KLAVIYO_REVISION });
    const body = JSON.parse(String(init.body));
    expect(body.data.attributes).toMatchObject({
      unique_id: `checkout-${QS}`, value: 67.5,
      metric: { data: { type: 'metric', attributes: { name: 'Started Checkout' } } },
      profile: { data: { type: 'profile', attributes: { email: 'jan@example.sk', first_name: 'Ján' } } },
    });
    const bad = klaviyoSender({ KLAVIYO_PRIVATE_KEY: 'pk_test' }, (async () => { throw new Error('ECONNRESET'); }) as never, memOnce());
    await expect(bad(started())).resolves.toBe(false);
  });

  test('Started Checkout nesie to isté ako prehliadač: pes, recept, balenie, cena, obrázok, odkaz späť; $event_id = prehliadačový', () => {
    const e = started();
    expect(e.properties).toMatchObject({
      $event_id: `checkout-${QS}`, $value: 67.5, CheckoutURL: `https://www.granula.sk/granule-na-mieru?kviz=${QS}#vysledok`,
      DogName: 'Bruno', RecipeId: 'morka-hus-kacica', BagKg: '9', Plan: 'predplatné', GramsPerDay: 240, DaysPerBag: 37, Carrier: 'dpd', ReminderConsent: true,
    });
    expect((e.properties.Items as { ImageURL: string; SKU: string }[])[0]).toMatchObject({ SKU: 'GRAN-morka-hus-kacica-9', ImageURL: 'https://www.granula.sk/img/produkty/morka-hus-kacica-s-tekvicou.webp' });
    expect(buildKlaviyoEvent(placedOrderEvent({ number: 63, email: 'jan@example.sk', amountCents: 6750, productId: 'morka-hus-kacica', bagId: '9' })).data.attributes).toMatchObject({ unique_id: 'order-63', value: 67.5 });
  });

  test('webhook: Placed Order iba so súhlasom s pripomenutím (v tomto alebo inom dotazníku zákazníka)', async () => {
    const order = { id: 'o1', number: 63, kind: 'first', amount_cents: 6750, items: [{ sku: 'GRAN-morka-hus-kacica-9', qty: 1 }], ship_to: { delivery_method: 'dpd_pickup' } } as never;
    const customer = { id: 'c1', email: 'jan@example.sk', name: 'Ján Novák' } as never;
    async function run(row: object | null, other = false) {
      const sent: string[] = [];
      const quiz: QuizStore = { get: vi.fn(async () => row as never), insert: vi.fn(), update: vi.fn(async () => {}) };
      const ev = trackingEvents({ capture: async () => {}, quiz, orderCounts: async () => ({ customer: 1, renewals: 0 }), klaviyo: async (e) => (sent.push(`${e.metric}:${e.uniqueId}:${e.email}`), true), hadReminderConsent: async () => other });
      await ev.orderCreated!({ order, customer, session: {} as never, metadata: { quiz_session: QS, product_id: 'morka-hus-kacica', bag_id: '9' } });
      return sent;
    }
    expect(await run({ id: QS, order_id: null, reminder_consent: true })).toEqual(['Placed Order:order-63:jan@example.sk']);
    expect(await run({ id: QS, order_id: null, reminder_consent: false })).toEqual([]);
    expect(await run({ id: QS, order_id: null, reminder_consent: false }, true)).toEqual(['Placed Order:order-63:jan@example.sk']);
    expect(await run(null)).toEqual([]);
  });
});
