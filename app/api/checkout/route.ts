import { gateFromRequest } from '@/lib/checkout-gate';
import { addressRowOf, birthDateFrom, CheckoutError, prepareCheckout, productIdFor, SHIPPING_PRODUCT_ID, sessionParams } from '@/lib/checkout';
import { skuItems, allSkus } from '@/lib/engine-server';
import { insertAddress, insertDog, setStripeCustomer, upsertCustomer } from '@/lib/store';
import { APP_METADATA, stripe, stripeConfigured } from '@/lib/stripe';
import { ensureProduct } from '@/lib/stripe-products';
import { linkCheckout, REMINDER_TEXT, resultFromQuote, supabaseQuizStore } from '@/lib/quiz';
import { klaviyoConfigured, klaviyoSender, startedCheckoutEvent } from '@/lib/klaviyo';

const CARRIER: Record<string, string> = { packeta_point: 'packeta', dpd_pickup: 'dpd', sps_courier: 'sps' };

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
    // adresa zákazníka vždy (aj pri výdajnom mieste, do FHB recipient.address), miesto v point_*
    const address = await insertAddress(addressRowOf(customer.id, p.shipTo));

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
    // P7: pripomienka nedokončenej objednávky — „Started Checkout“ do Klaviyo zo servera iba so súhlasom z políčka,
    // nezávisle od cookies; bez KLAVIYO_PRIVATE_KEY nič (prehliadač potom použije starú cestu cez klaviyo.js s cookies)
    const reminderServer = p.reminderConsent && !!p.quizSessionId && klaviyoConfigured();
    if (reminderServer) {
      await klaviyoSender()(startedCheckoutEvent({
        quizSessionId: p.quizSessionId!, email: p.customer.email, firstName: p.customer.firstName, dogName: p.answers.dogname,
        productId: p.quote.productId, bagId: p.quote.bagId, plan: p.quote.plan, unitCents: p.quote.unitAmountCents,
        gramsPerDay: p.quote.gramsPerDay, daysPerBag: p.quote.daysPerBag, carrier: CARRIER[p.method] ?? null,
        siteUrl: process.env.NEXT_PUBLIC_SITE_URL || origin,
      }));
    }
    // customerId: identify v PostHogu (P7, iba so súhlasom); reminderServer: prehliadač „Started Checkout“ neposiela
    return json({ clientSecret: session.client_secret, publishableKey: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY, customerId: customer.id, reminderServer });
  } catch (e) {
    if (e instanceof CheckoutError) return json({ error: e.message, field: e.field }, 422);
    console.error('[checkout]', e);
    return json({ error: 'Platbu sa nepodarilo pripraviť. Skús to prosím znova.' }, 500);
  }
}
