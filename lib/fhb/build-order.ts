import type { FhbOrderInput } from './client';

/*
 * Naša objednávka → telo POST /order (SPEC P2).
 *   id = orders.id (uuid; opakovanie je bezpečné, FHB páruje podľa id), variable_symbol = orders.number,
 *   recipient.address + contact (email ≤ 50, telefón v medzinárodnom formáte – obe povinné),
 *   parcel_service podľa spôsobu doručenia, delivery_point = kód výdajného miesta, value = suma (poistenie),
 *   cod = 0 (platí sa kartou), notification = naše URL s tajným tokenom.
 *   validate (kontrola adresy FHB): iba pri kuriérovi na adresu; pri výdajnom mieste sa adresa nekontroluje.
 *   Sandbox api-stage odmieta každú adresu („Failed to validate address“, 21. 11. 2026) → FHB_VALIDATE_ADDRESS=false.
 * Chyby, ktoré by FHB aj tak odmietol, hlási FhbBuildError skôr (bez volania FHB).
 */

export type DeliveryMethod = 'packeta_point' | 'sps_parcelshop' | 'sps_courier';

/** Snapshot adresy a kontaktu v orders.ship_to (jsonb). */
export type ShipTo = {
  name: string;
  email: string;
  phone: string;
  country: string;
  delivery_method: DeliveryMethod;
  street?: string | null;
  city?: string | null;
  zip?: string | null;
  /** kód výdajného miesta (FHB delivery_point) */
  point_id?: string | null;
  point_label?: string | null;
  /** adresa výdajného miesta; použije sa ako recipient.address, keď zákazník adresu nezadal */
  point_address?: { street: string; city: string; zip: string } | null;
};

export type BuildOrderInput = {
  id: string;
  number: number;
  items: { sku: string; qty: number }[];
  amountCents: number;
  shipTo: ShipTo;
  /** odkaz na PDF faktúry (Stripe hosted invoice PDF) */
  invoiceUrl?: string | null;
};

/** Kódy FHB parcel_service pre naše spôsoby doručenia. undefined = FHB použije predvolenú službu zákazníka. */
export type ParcelServiceMap = Partial<Record<DeliveryMethod, string>>;

export type BuildOrderOptions = {
  siteUrl: string;
  notifyToken: string;
  services: ParcelServiceMap;
  /** kontrola adresy pri kuriérovi (predvolene true) */
  validateAddress?: boolean;
};

export const NOTIFY_TYPES = ['confirmed', 'sent', 'delivered', 'returned'] as const;
export type NotifyType = (typeof NOTIFY_TYPES)[number];

export class FhbBuildError extends Error {
  constructor(readonly field: string, message: string) {
    super(`${field}: ${message}`);
    this.name = 'FhbBuildError';
  }
  toJSON() {
    return { status: 0, message: this.message, violations: { [this.field]: [{ code: 'LOCAL_VALIDATION', message: this.message }] }, endpoint: 'buildFhbOrder', at: new Date().toISOString() };
  }
}

/**
 * Kódy služieb. Overené v sandboxe (api-stage, 21. 11. 2026): `sps_pudo` = SPS výdajné miesta (2 875 miest SK),
 * delivery_point = `external_code` miesta (napr. PS-BJRT0558), číselné `id` FHB neprijme.
 * SPS kuriér a Packeta: kódy zatiaľ nepoznáme (GET /parcel-service je v sandboxe prázdny) → ⚠️ od FHB, dovtedy z env.
 */
export function parcelServicesFromEnv(env: Record<string, string | undefined> = process.env): ParcelServiceMap {
  return {
    sps_parcelshop: env.FHB_SERVICE_SPS_PARCELSHOP || 'sps_pudo',
    sps_courier: env.FHB_SERVICE_SPS_COURIER || undefined,
    packeta_point: env.FHB_SERVICE_PACKETA || undefined,
  };
}

/** Slovenské a medzinárodné čísla → +421…; vráti null, keď to nie je platné číslo. */
export function normalizePhone(raw: string, defaultCc = '421'): string | null {
  let s = raw.replace(/[\s\-().\/]/g, '');
  if (s.startsWith('00')) s = '+' + s.slice(2);
  else if (s.startsWith('0')) s = `+${defaultCc}` + s.slice(1);
  else if (!s.startsWith('+') && s.startsWith(defaultCc)) s = '+' + s;
  if (!/^\+[1-9]\d{7,14}$/.test(s)) return null;
  return s;
}

export function notifyUrl(siteUrl: string, type: NotifyType | 'stock', id: string, token: string) {
  return `${siteUrl.replace(/\/+$/, '')}/api/fhb/notify/${type}/${encodeURIComponent(id)}?t=${encodeURIComponent(token)}`;
}

const req = (field: string, v: string | null | undefined) => {
  const s = (v ?? '').trim();
  if (!s) throw new FhbBuildError(field, 'chýba');
  return s;
};

export function buildFhbOrder(o: BuildOrderInput, opts: BuildOrderOptions): FhbOrderInput {
  const vs = String(o.number);
  if (!/^\d{1,10}$/.test(vs)) throw new FhbBuildError('variable_symbol', `musí mať 1–10 číslic (${vs})`);
  if (!o.items.length) throw new FhbBuildError('items', 'prázdna objednávka');
  for (const [i, it] of o.items.entries()) {
    if (!it.sku || !Number.isInteger(it.qty) || it.qty < 1) throw new FhbBuildError(`items[${i}]`, 'neplatná položka');
  }
  const t = o.shipTo;
  const email = req('recipient.contact.email', t.email);
  if (email.length > 50) throw new FhbBuildError('recipient.contact.email', 'FHB prijme najviac 50 znakov');
  const phone = normalizePhone(req('recipient.contact.phone', t.phone));
  if (!phone) throw new FhbBuildError('recipient.contact.phone', 'neplatné telefónne číslo');

  const method = t.delivery_method;
  const pickup = method === 'packeta_point' || method === 'sps_parcelshop';
  const service = opts.services[method];
  if (method === 'packeta_point' && !service) throw new FhbBuildError('parcel_service', 'kód služby Packeta nie je nastavený (FHB_SERVICE_PACKETA)');
  const point = pickup ? req('delivery_point', t.point_id) : undefined;

  // adresa: zákazníkova, pri výdajnom mieste bez adresy adresa miesta
  const useOwn = !!(t.street && t.city && t.zip);
  if (!useOwn && !(pickup && t.point_address)) throw new FhbBuildError('recipient.address', 'chýba ulica, mesto alebo PSČ');
  const addr = useOwn ? { street: t.street!, city: t.city!, zip: t.zip! } : t.point_address!;

  const notification = Object.fromEntries(NOTIFY_TYPES.map((n) => [n, notifyUrl(opts.siteUrl, n, o.id, opts.notifyToken)]));
  for (const [k, u] of Object.entries(notification)) if (u.length > 255) throw new FhbBuildError(`notification.${k}`, 'URL je dlhšia ako 255 znakov');

  const body: FhbOrderInput = {
    id: o.id,
    variable_symbol: vs,
    ...(service ? { parcel_service: service } : {}),
    ...(point ? { delivery_point: point } : {}),
    cod: 0,
    value: Math.round(o.amountCents) / 100,
    validate: method === 'sps_courier' ? opts.validateAddress !== false : false,
    recipient: {
      address: {
        name: req('recipient.address.name', t.name),
        street: req('recipient.address.street', addr.street),
        city: req('recipient.address.city', addr.city),
        zip: req('recipient.address.zip', addr.zip).replace(/\s+/g, ''),
        country: (t.country || 'SK').toUpperCase(),
      },
      contact: { email, phone },
    },
    items: o.items.map((it) => ({ id: it.sku, quantity: it.qty })),
    notification,
  };
  if (o.invoiceUrl && o.invoiceUrl.length <= 255) body.invoice = o.invoiceUrl;
  return body;
}
