import { gateFromRequest } from '@/lib/checkout-gate';
import { birthDateFrom, CheckoutError, prepareCheckout, productIdFor, SHIPPING_PRODUCT_ID, sessionParams } from '@/lib/checkout';
import { skuItems, allSkus } from '@/lib/engine-server';
import { insertAddress, insertDog, setStripeCustomer, upsertCustomer } from '@/lib/store';
import { APP_METADATA, stripe, stripeConfigured } from '@/lib/stripe';
import { ensureProduct } from '@/lib/stripe-products';
import { linkCheckout, REMINDER_TEXT, resultFromQuote, supabaseQuizStore } from '@/lib/quiz';

/*
 * POST /api/checkout { answers, plan, bag, delivery } → { clientSecret, publishableKey }
 * Prepínač predaja → overenie a výpočet na serveri (lib/checkout.ts) → draft zákazník/pes/adresa v DB →
 * Stripe zákazník → Embedded Checkout Session. Objednávka NEvzniká tu, ale až z overeného webhooku.
 */
export const dynamic = 'force-dynamic';

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

export async function POST(req: Request) {
  if (!gateFromRequest(req).open) return json({ error: 'Objednávky zatiaľ nie sú otvorené.' }, 403);
  if (!stripeConfigured() || !process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY) return json({ error: 'Platby momentálne nie sú dostupné.' }, 503);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Neplatná požiadavka.' }, 400);
  }

  try {
    const p = await prepareCheckout(body);
    const s = stripe();

    // draft v DB (objednávka a predplatné vzniknú až z webhooku)
    const customer = await upsertCustomer(p.customer);
    const dog = await insertDog({
      customer_id: customer.id,
      name: p.answers.dogname,
      answers: p.answers as never,
      weight_kg: p.answers.kg,
      birth_date: birthDateFrom(p.answers),
    });
    const pickup = p.shipTo.delivery_method !== 'sps_courier';
    const address = await insertAddress({
      customer_id: customer.id,
      name: p.customer.name,
      // pri výdajnom mieste ulica/PSČ/mesto = adresa miesta (do FHB recipient.address)
      street: pickup ? p.point!.street : p.shipTo.street!,
      city: pickup ? p.point!.city : p.shipTo.city!,
      zip: pickup ? p.point!.zip : p.shipTo.zip!,
      country: 'SK',
      carrier: p.shipTo.delivery_method === 'packeta_point' ? 'packeta' : p.shipTo.delivery_method === 'dpd_pickup' ? 'dpd' : 'sps',
      delivery_method: p.shipTo.delivery_method,
      point_id: p.shipTo.point_id ?? null,
      point_label: p.shipTo.point_label ?? null,
    });

    // Stripe zákazník (jeden na e-mail)
    let stripeCustomerId = customer.stripe_customer_id;
    if (!stripeCustomerId) {
      const c = await s.customers.create({ email: p.customer.email, name: p.customer.name, phone: p.customer.phone, preferred_locales: ['sk'], metadata: { ...APP_METADATA, customer_id: customer.id } });
      stripeCustomerId = c.id;
      await setStripeCustomer(customer.id, c.id);
    }

    const sku = skuItems(p.quote.productId, p.quote.bagId)[0].sku;
    const productName = `Granula! ${allSkus().find((x) => x.sku === sku)?.name ?? sku}`;
    await ensureProduct(s, productIdFor(sku), productName, { sku });
    await ensureProduct(s, SHIPPING_PRODUCT_ID, 'Doprava');

    const origin = new URL(req.url).origin;
    const session = await s.checkout.sessions.create(sessionParams(p, { customerId: customer.id, dogId: dog.id, addressId: address.id }, { origin, stripeCustomerId, productName }));
    // P7: dotazník → zákazník (email, customer_id). Chyba analytiky nákup nezastaví.
    if (p.quizSessionId) {
      await linkCheckout(p.quizSessionId, {
        email: p.customer.email, customerId: customer.id, dogId: dog.id, answers: p.answers,
        plan: p.quote.plan, bag: p.quote.bagId, method: p.method, result: resultFromQuote(p.quote),
        reminder: { consent: p.reminderConsent, text: REMINDER_TEXT },
      }, await supabaseQuizStore()).catch((e) => console.error('[checkout] quiz_sessions', e));
    }
    // customerId: identify v PostHogu (P7, iba so súhlasom; email do analytiky nejde)
    return json({ clientSecret: session.client_secret, publishableKey: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY, customerId: customer.id });
  } catch (e) {
    if (e instanceof CheckoutError) return json({ error: e.message, field: e.field }, 422);
    console.error('[checkout]', e);
    return json({ error: 'Platbu sa nepodarilo pripraviť. Skús to prosím znova.' }, 500);
  }
}
