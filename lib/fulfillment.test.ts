import { randomUUID } from 'node:crypto';
import { describe, expect, test, vi } from 'vitest';
import { handleCheckoutCompleted, handleInvoicePaid, handlePaymentFailed, handleSubscriptionChanged, statusOf, type Address, type Customer, type Dog, type Order, type Store, type Subscription } from './fulfillment';

const NOW = new Date('2026-12-01T10:00:00Z');
const CYCLE = { leadDays: 7, shipDays: 3 };
const ANSWERS = { dogname: 'Bruno', sex: 'pes', breed: 'krizenec-stredny', kg: 17, years: '4', months: '0', weeks: '', activity: 'mesto', neutered: 'ano', pregnant: '', body: 'akurat', focus: [], allergies: [], recipe: '', recipeFor: '' };

function memStore() {
  const customers = new Map<string, Customer>(), dogs = new Map<string, Dog>(), addresses = new Map<string, Address>();
  const subs = new Map<string, Subscription>(), orders = new Map<string, Order>();
  const audits: { action: string; entity_id?: string | null }[] = [];
  let num = 0;
  const store: Store = {
    getCustomer: async (id) => customers.get(id) ?? null,
    getDog: async (id) => dogs.get(id) ?? null,
    getAddress: async (id) => addresses.get(id) ?? null,
    findSubscriptionByStripeId: async (sid) => [...subs.values()].find((s) => s.stripe_subscription_id === sid) ?? null,
    async insertSubscription(row) {
      const ex = [...subs.values()].find((s) => s.stripe_subscription_id === row.stripe_subscription_id);
      if (ex) return ex;
      const s = { id: randomUUID(), created_at: '', updated_at: '', last_delivered_at: null, ...row } as Subscription;
      subs.set(s.id, s);
      return s;
    },
    updateSubscription: async (id, patch) => void Object.assign(subs.get(id)!, patch),
    async insertOrder(row) {
      const ex = [...orders.values()].find((o) => o.stripe_ref === row.stripe_ref);
      if (ex) return { order: ex, created: false };
      const o = { id: randomUUID(), number: ++num, fhb_error: null, tracking: null, shipped_at: null, delivered_at: null, created_at: '', updated_at: '', status: 'paid', subscription_id: null, items: [], ...row } as Order;
      orders.set(o.id, o);
      return { order: o, created: true };
    },
    async audit(row) {
      if (!audits.some((x) => x.action === row.action && x.entity_id === row.entity_id)) audits.push(row);
    },
  };
  const c: Customer = { id: 'c1', email: 'jan@example.sk', name: 'Ján Novák', phone: '+421905123456', stripe_customer_id: 'cus_1', auth_user_id: null, created_at: '', updated_at: '' };
  const d: Dog = { id: 'd1', customer_id: 'c1', name: 'Bruno', answers: ANSWERS, weight_kg: 17, birth_date: '2022-12-01', created_at: '', updated_at: '' };
  const a: Address = { id: 'a1', customer_id: 'c1', name: 'Ján Novák', street: 'Hlavná 5', city: 'Košice', zip: '04001', country: 'SK', carrier: 'dpd', delivery_method: 'dpd_pickup', point_id: 'SK21286', point_label: 'Pavel Lóška Cyklo-Šport', point_street: 'Mierová 17', point_city: 'Tornaľa', point_zip: '98201', is_default: false, created_at: '' };
  customers.set('c1', c); dogs.set('d1', d); addresses.set('a1', a);
  return { store, subs, orders, dogs, audits };
}

function fakeStripe() {
  const update = vi.fn(async (id: string, p: unknown) => ({ id, p }));
  const retrieve = vi.fn(async (id: string) => ({ id, items: { data: [{ id: 'si_a' }, { id: 'si_b' }] } }));
  return { s: { subscriptions: { update, retrieve } } as never, update, retrieve };
}

const META = { app: 'granula', customer_id: 'c1', dog_id: 'd1', address_id: 'a1', product_id: 'morka-hus-kacica', bag_id: '9', plan: 'mesiac', days: '37', grams: '240', unit_cents: '6750', ship_cents: '490', method: 'dpd_pickup' };
const session = (over: object = {}) => ({ id: 'cs_test_1', mode: 'subscription', subscription: 'sub_1', payment_status: 'paid', amount_total: 7240, metadata: META, ...over }) as never;

describe('checkout.session.completed', () => {
  test('predplatné: riadok v DB, trial_end na prvé obnovenie, objednávka first → FHB; druhý event nič nezduplikuje', async () => {
    const m = memStore(), f = fakeStripe(), send = vi.fn(async () => ({}));
    const deps = { store: m.store, stripe: f.s, cycle: CYCLE, now: () => NOW, sendToFhb: send };
    const o = await handleCheckoutCompleted(session(), deps);
    expect(o).toMatchObject({ kind: 'first', stripe_ref: 'cs_test_1', amount_cents: 7240, items: [{ sku: 'GRAN-morka-hus-kacica-9', qty: 1 }] });
    expect(o!.ship_to).toMatchObject({ delivery_method: 'dpd_pickup', point_id: 'SK21286', phone: '+421905123456', point_address: { street: 'Mierová 17', city: 'Tornaľa', zip: '98201' } });
    const sub = [...m.subs.values()][0];
    // 1. 12. + 3 dni = 4. 12.; + 37 − 7 = 3. 1. 2027 06:00 UTC
    expect(sub).toMatchObject({ stripe_subscription_id: 'sub_1', days_per_bag: 37, next_charge_at: '2027-01-03T06:00:00.000Z', status: 'active' });
    expect(f.update).toHaveBeenCalledWith('sub_1', { trial_end: Math.floor(Date.parse('2027-01-03T06:00:00Z') / 1000), proration_behavior: 'none' });
    expect(send).toHaveBeenCalledWith(o!.id);
    await handleCheckoutCompleted(session(), deps);
    expect(m.orders.size).toBe(1);
    expect(m.subs.size).toBe(1);
  });
  test('jednorazovo: one_off bez predplatného; nezaplatené sa preskočí', async () => {
    const m = memStore(), f = fakeStripe();
    const deps = { store: m.store, stripe: f.s, cycle: CYCLE, now: () => NOW };
    expect(await handleCheckoutCompleted(session({ payment_status: 'unpaid' }), deps)).toBeNull();
    const o = await handleCheckoutCompleted(session({ mode: 'payment', subscription: null, amount_total: 7990, metadata: { ...META, plan: 'raz' } }), deps);
    expect(o).toMatchObject({ kind: 'one_off', subscription_id: null, amount_cents: 7990 });
    expect(f.update).not.toHaveBeenCalled();
  });
  test('chyba FHB neprerušuje webhook (objednávka ostane paid)', async () => {
    const m = memStore(), f = fakeStripe();
    const o = await handleCheckoutCompleted(session(), { store: m.store, stripe: f.s, cycle: CYCLE, now: () => NOW, sendToFhb: async () => { throw new Error('FHB 503'); } });
    expect(o?.status).toBe('paid');
  });
  test('chýbajúci draft → chyba (Stripe event zopakuje)', async () => {
    const m = memStore(), f = fakeStripe();
    await expect(handleCheckoutCompleted(session({ metadata: { ...META, dog_id: 'x' } }), { store: m.store, stripe: f.s, cycle: CYCLE })).rejects.toThrow(/draft/);
  });
});

const invoice = (over: object = {}) => ({ id: 'in_2', billing_reason: 'subscription_cycle', amount_paid: 7240, parent: { subscription_details: { subscription: 'sub_1', metadata: META } }, lines: { data: [] }, ...over }) as never;

describe('invoice.paid (obnovenie)', () => {
  test('renewal objednávka → FHB; bez zmeny D sa Stripe nemení', async () => {
    const m = memStore(), f = fakeStripe(), send = vi.fn(async () => ({}));
    const deps = { store: m.store, stripe: f.s, cycle: CYCLE, now: () => NOW, sendToFhb: send };
    await handleCheckoutCompleted(session(), deps);
    f.update.mockClear();
    const later = new Date('2027-01-03T06:00:00Z');
    const o = await handleInvoicePaid(invoice(), { ...deps, now: () => later });
    expect(o).toMatchObject({ kind: 'renewal', stripe_ref: 'in_2', amount_cents: 7240 });
    expect(f.update).not.toHaveBeenCalled();
    expect([...m.subs.values()][0].next_charge_at).toBe('2027-02-09T06:00:00.000Z'); // + 37 dní
    expect(send).toHaveBeenCalledTimes(2);
    await handleInvoicePaid(invoice(), { ...deps, now: () => later });
    expect(m.orders.size).toBe(2);
  });
  test('šteňa: pri obnovení nový vek → nové D → JEDEN update s intervalom a trial_end', async () => {
    const m = memStore(), f = fakeStripe();
    const dog = m.dogs.get('d1')!;
    dog.birth_date = '2026-09-15'; // ~11 týždňov pri prvej objednávke
    dog.answers = { ...ANSWERS, years: '0', months: '2', weeks: '11', kg: 8 };
    const deps = { store: m.store, stripe: f.s, cycle: CYCLE, now: () => NOW };
    await handleCheckoutCompleted(session({ metadata: { ...META, days: '20', grams: '450' } }), deps);
    f.update.mockClear();
    const later = new Date('2027-03-20T06:00:00Z'); // ~6 mesiacov: nižší násobok energie → menej gramov → dlhšie D
    await handleInvoicePaid(invoice(), { ...deps, now: () => later });
    const sub = [...m.subs.values()][0];
    expect(sub.days_per_bag).not.toBe(20);
    expect(f.update).toHaveBeenCalledTimes(1);
    const p = f.update.mock.calls[0][1] as { items: { price_data?: { recurring: { interval_count: number } } }[]; proration_behavior: string; trial_end: number };
    expect(p.proration_behavior).toBe('none');
    expect(p.items.filter((i) => i.price_data).map((i) => i.price_data!.recurring.interval_count)).toEqual([sub.days_per_bag, sub.days_per_bag]);
    expect(p.trial_end).toBe(Math.floor(Date.parse(sub.next_charge_at!) / 1000));
  });
  test('prvá faktúra (subscription_create) sa ignoruje', async () => {
    const m = memStore(), f = fakeStripe();
    expect(await handleInvoicePaid(invoice({ billing_reason: 'subscription_create' }), { store: m.store, stripe: f.s, cycle: CYCLE })).toBeNull();
  });
  test('predplatné mimo DB: bez draftu (test clock) 200 so stopou v audit_log, s draftom stopa + 500 (checkout ešte nespracovaný)', async () => {
    const m = memStore(), f = fakeStripe();
    const d = { store: m.store, stripe: f.s, cycle: CYCLE };
    const orphan = invoice({ parent: { subscription_details: { subscription: 'sub_x', metadata: { app: 'granula', test_clock: '1' } } } });
    expect(await handleInvoicePaid(orphan, d)).toBeNull();
    expect(await handleInvoicePaid(orphan, d)).toBeNull();
    const pending = invoice({ id: 'in_3', parent: { subscription_details: { subscription: 'sub_y', metadata: META } } });
    await expect(handleInvoicePaid(pending, d)).rejects.toThrow(/nie je v DB/);
    // stopa ostane (raz na faktúru), žiadna objednávka
    expect(m.audits.map((a) => [a.action, a.entity_id])).toEqual([['stripe.invoice_paid.subscription_missing', 'in_2'], ['stripe.invoice_paid.subscription_pending', 'in_3']]);
    expect(m.orders.size).toBe(0);
  });
});

describe('neúspešná platba a zmeny predplatného', () => {
  test('payment_failed → past_due; updated/deleted → stav', async () => {
    const m = memStore(), f = fakeStripe();
    const deps = { store: m.store, stripe: f.s, cycle: CYCLE, now: () => NOW };
    await handleCheckoutCompleted(session(), deps);
    await handlePaymentFailed(invoice(), deps);
    expect([...m.subs.values()][0].status).toBe('past_due');
    await handleSubscriptionChanged({ id: 'sub_1', status: 'trialing', trial_end: 1800000000, pause_collection: null, items: { data: [] } } as never, deps);
    expect([...m.subs.values()][0]).toMatchObject({ status: 'active', next_charge_at: new Date(1800000000 * 1000).toISOString() });
    await handleSubscriptionChanged({ id: 'sub_1', status: 'canceled', pause_collection: null, items: { data: [] } } as never, deps);
    expect([...m.subs.values()][0].status).toBe('cancelled');
  });
  test('statusOf', () => {
    expect(statusOf({ status: 'active', pause_collection: { behavior: 'void' } } as never)).toBe('paused');
    expect(statusOf({ status: 'unpaid', pause_collection: null } as never)).toBe('past_due');
  });
});

describe('emaily z webhooku (krok 5)', () => {
  const mailer = () => {
    const sent = new Map<string, { kind: string; to: string; text: string }>();
    const mail = vi.fn(async (x: { key: string; kind: string; to: string; text: string }) => (sent.has(x.key) ? 'duplicate' : (sent.set(x.key, x), 'sent')) as 'sent');
    return { mail, sent };
  };
  test('potvrdenie po zaplatení (raz aj pri opakovanom evente), renewal tiež; chyba FHB → interné upozornenie', async () => {
    const m = memStore(), f = fakeStripe(), x = mailer();
    const send = vi.fn(async () => ({ state: 'fhb_error', error: { status: 400 } }));
    const deps = { store: m.store, stripe: f.s, cycle: CYCLE, now: () => NOW, sendToFhb: send, mail: x.mail as never, siteUrl: 'https://www.granula.sk', adminTo: 'admin@granula.sk' };
    const o = await handleCheckoutCompleted(session(), deps);
    await handleCheckoutCompleted(session(), deps);
    const confirm = x.sent.get(`order-confirm:${o!.id}`)!;
    expect(confirm).toMatchObject({ kind: 'order_confirmation', to: 'jan@example.sk' });
    expect(confirm.text).toContain('Odstúpiť od zmluvy tu: https://www.granula.sk/odstupenie?objednavka=');
    expect(confirm.text).toContain('každých 37 dní');
    expect(x.sent.get(`admin-fhb-error:${o!.id}`)).toMatchObject({ kind: 'admin_fhb_error', to: 'admin@granula.sk' });
    const later = new Date('2027-01-03T06:00:00Z');
    const r = await handleInvoicePaid(invoice(), { ...deps, now: () => later });
    expect(x.sent.get(`order-confirm:${r!.id}`)?.text).toContain('ďalšie vrece');
  });
  test('neúspešná platba → email s odkazom na zaplatenie; zlyhanie emailu webhook neprerušuje (audit)', async () => {
    const m = memStore(), f = fakeStripe(), x = mailer();
    const deps = { store: m.store, stripe: f.s, cycle: CYCLE, now: () => NOW, mail: x.mail as never, siteUrl: 'https://www.granula.sk' };
    await handleCheckoutCompleted(session(), deps);
    await handlePaymentFailed(invoice({ id: 'in_9', attempt_count: 1, amount_due: 7240, hosted_invoice_url: 'https://invoice.stripe.com/i/abc' }), deps);
    expect(x.sent.get('payment-failed:in_9:1')?.text).toContain('https://invoice.stripe.com/i/abc');
    const broken = { ...deps, mail: vi.fn(async () => { throw new Error('Resend 500'); }) as never };
    await expect(handlePaymentFailed(invoice({ id: 'in_10', attempt_count: 1, amount_due: 7240 }), broken)).resolves.toBeUndefined();
    expect(m.audits.some((a) => (a as { action: string }).action === 'email.failed')).toBe(true);
  });
});

describe('P7: udalosti pre analytiku a dotazník (deps.events)', () => {
  function rec() {
    const calls: string[] = [];
    const events = {
      orderCreated: vi.fn(async ({ order, metadata }: { order: Order; metadata: Record<string, string> }) => void calls.push(`order:${order.kind}:${metadata.quiz_session ?? '-'}`)),
      renewed: vi.fn(async ({ order }: { order: Order }) => void calls.push(`renewed:${order.kind}`)),
      renewalFailed: vi.fn(async () => void calls.push('failed')),
      cancelled: vi.fn(async ({ atPeriodEnd }: { atPeriodEnd: boolean }) => void calls.push(`cancelled:${atPeriodEnd}`)),
    };
    return { calls, events: events as never };
  }
  test('objednávka a obnovenie iba raz; chyba udalosti webhook neprerušuje', async () => {
    const m = memStore(), f = fakeStripe(), r = rec();
    const deps = { store: m.store, stripe: f.s, cycle: CYCLE, now: () => NOW, events: r.events };
    await handleCheckoutCompleted(session({ metadata: { ...META, quiz_session: 'q1' } }), deps);
    await handleCheckoutCompleted(session({ metadata: { ...META, quiz_session: 'q1' } }), deps);
    const inv = { id: 'in_r1', billing_reason: 'subscription_cycle', amount_paid: 7240, parent: { subscription_details: { subscription: 'sub_1', metadata: {} } }, lines: { data: [] } } as never;
    await handleInvoicePaid(inv, { ...deps, now: () => new Date('2027-01-03T06:00:00Z') });
    await handleInvoicePaid(inv, { ...deps, now: () => new Date('2027-01-03T06:00:00Z') });
    expect(r.calls).toEqual(['order:first:q1', 'renewed:renewal']);
    const broken = { ...deps, events: { orderCreated: async () => { throw new Error('PostHog 500'); } } };
    await expect(handleCheckoutCompleted(session({ id: 'cs_test_2', subscription: 'sub_2' }), broken)).resolves.toMatchObject({ kind: 'first' });
  });
  test('zrušenie: raz pri žiadosti ku koncu obdobia, pri skutočnom konci už nie; okamžité zrušenie raz', async () => {
    const m = memStore(), f = fakeStripe(), r = rec();
    const deps = { store: m.store, stripe: f.s, cycle: CYCLE, now: () => NOW, events: r.events };
    await handleCheckoutCompleted(session(), deps);
    const base = { id: 'sub_1', status: 'trialing', trial_end: 1800000000, pause_collection: null, items: { data: [] } };
    await handleSubscriptionChanged({ ...base, cancel_at_period_end: true } as never, deps, { cancel_at_period_end: false } as never);
    await handleSubscriptionChanged({ ...base, cancel_at_period_end: true, trial_end: 1800000100 } as never, deps, { trial_end: 1800000000 } as never);
    await handleSubscriptionChanged({ ...base, status: 'canceled', cancel_at_period_end: true } as never, deps, { status: 'trialing' } as never);
    expect(r.calls.filter((c) => c.startsWith('cancelled'))).toEqual(['cancelled:true']);

    await handleCheckoutCompleted(session({ id: 'cs_test_3', subscription: 'sub_3' }), deps);
    await handleSubscriptionChanged({ ...base, id: 'sub_3', status: 'canceled', cancel_at_period_end: false, cancel_at: null } as never, deps);
    await handleSubscriptionChanged({ ...base, id: 'sub_3', status: 'canceled', cancel_at_period_end: false, cancel_at: null } as never, deps);
    expect(r.calls.filter((c) => c.startsWith('cancelled'))).toEqual(['cancelled:true', 'cancelled:false']);
  });
});
