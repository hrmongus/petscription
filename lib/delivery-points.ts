import { parcelServicesFromEnv } from './fhb/build-order';
import { FhbClient, type FhbDeliveryPoint } from './fhb/client';
import { SPS_MOCK_POINTS } from './delivery-points.mock';

/*
 * Výdajné miesta SPS pre pop-up v dotazníku (SPEC P1b) a overenie miesta na serveri pred platbou.
 *
 * Zdroj: FHB GET /delivery-point/<kód SPS ParcelShop> (sps_pudo) → kódy miest sú garantovane tie, ktoré FHB prijme.
 * `id` = external_code (napr. PS-BJRT0558 alebo SPS-D006393), to ide do FHB delivery_point.
 * Cache v pamäti servera 12 h (FHB vracia ~2 900 miest, ~500 kB); pri výpadku FHB sa použije stará cache.
 * Bez FHB kľúčov (lokálny vývoj, testy) → testovacie miesta z delivery-points.mock.ts, `source: "mock"`.
 *
 * ⚠️ FHB neposiela GPS súradnice → mapa (Leaflet) zobrazí iba miesta, ktoré lat/lng majú (zatiaľ len mock).
 */

export type PointKind = 'parcelshop' | 'box';
export type DeliveryPoint = {
  id: string;
  name: string;
  street: string;
  city: string;
  zip: string;
  country: string;
  kind: PointKind;
  lat?: number;
  lng?: number;
};
export type PointsSource = 'fhb' | 'mock';

const TTL_MS = 12 * 60 * 60 * 1000;
let cache: { at: number; points: DeliveryPoint[]; source: PointsSource } | null = null;

/** malé písmená bez diakritiky a nadbytočných medzier */
export function fold(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

const zipOf = (z: string) => z.replace(/\D/g, '');

export function normalizeSpsPoints(raw: FhbDeliveryPoint[]): DeliveryPoint[] {
  return raw
    .filter((p) => p.external_code && p.name)
    .map((p) => ({
      id: p.external_code,
      name: p.name.trim(),
      street: (p.street ?? '').trim(),
      city: (p.city ?? '').trim(),
      zip: zipOf(p.zip ?? ''),
      country: (p.country ?? 'sk').toUpperCase(),
      // balíkovo boxy majú kód SPS-… a v názve „box“; ParcelShopy PS-…
      kind: /box/i.test(p.name) || /^SPS-/i.test(p.external_code) ? 'box' : 'parcelshop',
    }));
}

/**
 * Vyhľadanie podľa PSČ, mesta, ulice alebo názvu (bez diakritiky). Poradie: PSČ od začiatku, mesto od začiatku,
 * mesto obsahuje, ostatné; v rámci skupiny ParcelShopy pred boxami a abecedne.
 */
export function searchPoints(points: DeliveryPoint[], query: string, limit = 40): DeliveryPoint[] {
  const q = fold(query);
  const qz = zipOf(query);
  if (q.length < 2 && qz.length < 2) return [];
  const words = q.split(' ').filter(Boolean);
  const scored: { p: DeliveryPoint; s: number }[] = [];
  for (const p of points) {
    const city = fold(p.city);
    const hay = `${city} ${fold(p.street)} ${fold(p.name)} ${p.zip}`;
    let s = -1;
    if (qz.length >= 2 && /^\d[\d\s]*$/.test(query.trim())) {
      if (p.zip.startsWith(qz)) s = 0;
    } else if (words.every((w) => hay.includes(w))) {
      s = city.startsWith(q) ? 1 : city.includes(q) ? 2 : 3;
    }
    if (s >= 0) scored.push({ p, s });
  }
  scored.sort((a, b) => a.s - b.s || (a.p.kind === b.p.kind ? 0 : a.p.kind === 'parcelshop' ? -1 : 1) || a.p.city.localeCompare(b.p.city, 'sk') || a.p.name.localeCompare(b.p.name, 'sk'));
  return scored.slice(0, limit).map((x) => x.p);
}

function hasFhbEnv(env: Record<string, string | undefined> = process.env) {
  return !!(env.FHB_API_URL && env.FHB_APP_ID && env.FHB_SECRET);
}

/** Všetky SPS výdajné miesta (cache 12 h). */
export async function getSpsPoints(opts: { client?: FhbClient; now?: number; force?: boolean } = {}): Promise<{ source: PointsSource; points: DeliveryPoint[] }> {
  const now = opts.now ?? Date.now();
  if (!opts.client && !hasFhbEnv()) return { source: 'mock', points: SPS_MOCK_POINTS };
  if (!opts.force && cache && now - cache.at < TTL_MS) return cache;
  try {
    const client = opts.client ?? FhbClient.fromEnv();
    const code = parcelServicesFromEnv().sps_parcelshop!;
    const points = normalizeSpsPoints(await client.deliveryPoints(code, 'sk'));
    if (!points.length) throw new Error(`FHB nevrátil žiadne miesta pre ${code}`);
    cache = { at: now, points, source: 'fhb' };
    return cache;
  } catch (e) {
    if (cache) return cache; // radšej staré miesta ako žiadne
    throw e;
  }
}

/** Overenie miesta na serveri (krok 4, pred Checkout Session): existuje v aktuálnom zozname? */
export async function findSpsPoint(id: string): Promise<DeliveryPoint | null> {
  const { points } = await getSpsPoints();
  return points.find((p) => p.id === id) ?? null;
}

/** Na testy. */
export function _resetPointsCache() {
  cache = null;
}
