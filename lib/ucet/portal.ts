import type Stripe from 'stripe';
import { APP_METADATA } from '../stripe';

/*
 * Stripe Customer Portal iba na kartu a faktúry (SPEC P1/P4): bez zmeny plánu, zrušenia a údajov zákazníka.
 * Konfigurácia sa založí sama (metadata app=granula, purpose=ucet) a znova použije; v Stripe netreba nič klikať,
 * okrem verejných údajov firmy (Settings → Public details), ktoré portál zobrazuje.
 */
let cached: string | null = null;

export async function ensurePortalConfiguration(s: Stripe, siteUrl: string): Promise<string> {
  if (cached) return cached;
  for await (const c of s.billingPortal.configurations.list({ active: true, limit: 100 })) {
    if (c.metadata?.app === APP_METADATA.app && c.metadata?.purpose === 'ucet') return (cached = c.id);
  }
  const site = siteUrl.replace(/\/+$/, '');
  const c = await s.billingPortal.configurations.create({
    name: 'Granula: karta a faktúry',
    business_profile: { privacy_policy_url: `${site}/ochrana-sukromia`, terms_of_service_url: `${site}/obchodne-podmienky` },
    default_return_url: `${site}/ucet`,
    features: {
      payment_method_update: { enabled: true },
      invoice_history: { enabled: true },
      customer_update: { enabled: false },
      subscription_cancel: { enabled: false },
      subscription_update: { enabled: false },
    },
    metadata: { ...APP_METADATA, purpose: 'ucet' },
  });
  return (cached = c.id);
}

/**
 * Odkaz rovno na zmenu karty (flow payment_method_update), nie na prehľad portálu: prehľad by ukazoval
 * „Bezplatná skúšobná verzia končí…“, lebo dátum ďalšej platby posúvame cez trial_end (SPEC §1). Po uložení karty
 * sa zákazník vráti do /ucet. Faktúry sú priamo v /ucet (invoicesOf).
 */
export async function cardUpdateUrl(s: Stripe, stripeCustomerId: string, siteUrl: string): Promise<string> {
  const configuration = await ensurePortalConfiguration(s, siteUrl);
  const back = `${siteUrl.replace(/\/+$/, '')}/ucet?karta=ok`;
  const session = await s.billingPortal.sessions.create({
    customer: stripeCustomerId,
    configuration,
    locale: 'sk',
    return_url: `${siteUrl.replace(/\/+$/, '')}/ucet`,
    flow_data: { type: 'payment_method_update', after_completion: { type: 'redirect', redirect: { return_url: back } } },
  });
  return session.url;
}

export type InvoiceRow = { number: string | null; date: string; amountCents: number; status: string; pdf: string | null; url: string | null };

/** faktúry zákazníka zo Stripe (zaplatené a otvorené), najnovšie prvé */
export async function invoicesOf(s: Stripe, stripeCustomerId: string): Promise<InvoiceRow[]> {
  const list = await s.invoices.list({ customer: stripeCustomerId, limit: 36 });
  return list.data
    .filter((i) => (i.status === 'paid' || i.status === 'open') && (i.amount_due > 0 || i.amount_paid > 0))
    .map((i) => ({ number: i.number, date: new Date(i.created * 1000).toISOString(), amountCents: i.status === 'paid' ? i.amount_paid : i.amount_due, status: i.status!, pdf: i.invoice_pdf ?? null, url: i.hosted_invoice_url ?? null }));
}
