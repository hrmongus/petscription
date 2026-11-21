import Stripe from 'stripe';

/*
 * Stripe na serveri (vzor reference/fanpagekit/lib/stripe.ts). Nikdy neimportovať z klientskeho kódu.
 * Test vs. live určuje iba kľúč (lib/env-mode.ts); produkcia beží zatiaľ s test kľúčmi.
 */

let client: Stripe | null = null;

export function stripeConfigured() {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

export function stripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('STRIPE_SECRET_KEY nie je nastavený');
  client ??= new Stripe(key, { appInfo: { name: 'Granula' } });
  return client;
}

/** Na testy: podstrčiť mock klienta. */
export function _setStripe(s: Stripe | null) {
  client = s;
}

export const idOf = (v: string | { id: string } | null | undefined) => (typeof v === 'string' ? v : v?.id ?? null);

/**
 * Každý Stripe objekt tejto appky nesie metadata.app = "granula". Stripe účet je bývalý Mamsa účet, jeho
 * eventy chodia aj sem → webhook cudzie objekty ignoruje (SPEC §0).
 */
export const APP_METADATA = { app: 'granula' } as const;

export function isOurs(metadata: Stripe.Metadata | null | undefined) {
  return metadata?.app === APP_METADATA.app;
}

/** metadata eventu: pri faktúrach z predplatného (invoice.parent.subscription_details), inak priamo z objektu */
export function eventMetadata(event: Stripe.Event): Stripe.Metadata | null | undefined {
  if (event.type.startsWith('invoice.')) return (event.data.object as Stripe.Invoice).parent?.subscription_details?.metadata;
  return (event.data.object as { metadata?: Stripe.Metadata | null }).metadata;
}
