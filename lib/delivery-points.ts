import { fhbServiceFor, type DeliveryMethod } from './carriers';
import { MOCK_POINTS } from './delivery-points.mock';
import { FhbClient, type FhbDeliveryPoint } from './fhb/client';

/*
 * Výdajné miesta Packeta a DPD z FHB (SPEC P1b): záložný výber v dotazníku (vyhľadávanie + zoznam) a overenie
 * vybraného miesta na serveri pred platbou (aj miesta z oficiálnych widgetov Packeta a DPD).
 *
 * Zdroj: FHB GET /delivery-point/<kód služby z doprava-config.js> → kódy miest sú tie, ktoré FHB prijme.
 *   `id` = external_code: Packeta číslo miesta (= `id` z Packeta widgetu), DPD `SK…` (= `id` z mapy DPD).
 * Cache v pamäti servera 12 h pre každú službu; pri výpadku FHB sa použije stará cache.
 * Bez FHB kľúčov (lokálny vývoj, testy) → testovacie miesta (delivery-points.mock.ts), `source: "mock"`.
 */

export type PointService = 'packeta' | 'dpd';
export const POINT_SERVICES: Record<PointService, DeliveryMethod> = { packeta: 'packeta_point', dpd: 'dpd_pickup' };

export type PointKind = 'shop' | 'box';
export type DeliveryPoint = { id: string; name: string; street: string; city: string; zip: string; country: string; kind: PointKind };
export type PointsSource = 'fhb' | 'mock';

const TTL_MS = 12 * 60 * 60 * 1000;
const cache = new Map<PointService, { at: number; points: DeliveryPoint[]; source: PointsSource }>();

/** malé písmená bez diakritiky a nadbytočných medzier */
export function fold(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}
const zipOf = (z: string) => z.replace(/\D/g, '');
/** „BRATISLAVA“ → „Bratislava“ (DPD má mestá a ulice veľkými písmenami) */
function title(s: string) {
  if (s !== s.toUpperCase()) return s;
  return s.toLowerCase().replace(/(^|[\s\-/.(])(\p{L})/gu, (_, a, b) => a + b.toUpperCase());
}

export function normalizePoints(raw: FhbDeliveryPoint[]): DeliveryPoint[] {
  return raw
    .filter((p) => p.external_code && p.name)
    .map((p) => ({
      id: String(p.external_code),
      name: p.name.trim(),
      street: title((p.street ?? '').trim().replace(/\s+\.$/, '')),
      city: title((p.city ?? '').trim()),
      zip: zipOf(p.zip ?? ''),
      country: (p.country ?? 'sk').toUpperCase(),
      // Z-BOX, AlzaBox, DPD Pickup Box, balíkovo box… podľa názvu
      kind: /box/i.test(p.name) ? 'box' : 'shop',
    }));
}

/**
 * Vyhľadanie podľa PSČ, mesta, ulice alebo názvu (bez diakritiky). Poradie: PSČ od začiatku, mesto od začiatku,
 * mesto obsahuje, ostatné; v rámci skupiny výdajné miesta pred boxami a abecedne.
 */
export function searchPoints(points: DeliveryPoint[], query: string, limit = 40): DeliveryPoint[] {
  const q = fold(query);
  const qz = zipOf(query);
  if (q.length < 2 && qz.length < 2) return [];
  const words = q.split(' ').filter(Boolean);
  const isZip = qz.length >= 2 && /^\d[\d\s]*$/.test(query.trim());
  const scored: { p: DeliveryPoint; s: number }[] = [];
  for (const p of points) {
    let s = -1;
    if (isZip) {
      if (p.zip.startsWith(qz)) s = 0;
    } else {
      const city = fold(p.city);
      const hay = `${city} ${fold(p.street)} ${fold(p.name)} ${p.zip}`;
      if (words.every((w) => hay.includes(w))) s = city.startsWith(q) ? 1 : city.includes(q) ? 2 : 3;
    }
    if (s >= 0) scored.push({ p, s });
  }
  scored.sort((a, b) => a.s - b.s || (a.p.kind === b.p.kind ? 0 : a.p.kind === 'shop' ? -1 : 1) || a.p.city.localeCompare(b.p.city, 'sk') || a.p.name.localeCompare(b.p.name, 'sk'));
  return scored.slice(0, limit).map((x) => x.p);
}

const hasFhbEnv = (env: Record<string, string | undefined> = process.env) => !!(env.FHB_API_URL && env.FHB_APP_ID && env.FHB_SECRET);

/** Všetky výdajné miesta služby (cache 12 h). */
export async function getPoints(service: PointService, opts: { client?: FhbClient; now?: number; force?: boolean } = {}): Promise<{ source: PointsSource; points: DeliveryPoint[] }> {
  const now = opts.now ?? Date.now();
  if (!opts.client && !hasFhbEnv()) return { source: 'mock', points: MOCK_POINTS[service] };
  const hit = cache.get(service);
  if (!opts.force && hit && now - hit.at < TTL_MS) return hit;
  try {
    const client = opts.client ?? FhbClient.fromEnv();
    const code = fhbServiceFor(POINT_SERVICES[service]);
    if (!code) throw new Error(`kód služby FHB pre ${service} nie je nastavený`);
    const points = normalizePoints(await client.deliveryPoints(code, 'sk'));
    if (!points.length) throw new Error(`FHB nevrátil žiadne miesta pre ${code}`);
    const entry = { at: now, points, source: 'fhb' as const };
    cache.set(service, entry);
    return entry;
  } catch (e) {
    if (hit) return hit; // radšej staré miesta ako žiadne
    throw e;
  }
}

/** Overenie miesta na serveri pred platbou (krok 4): je v aktuálnom zozname FHB? */
export async function findPoint(service: PointService, id: string): Promise<DeliveryPoint | null> {
  const { points } = await getPoints(service);
  return points.find((p) => p.id === String(id)) ?? null;
}

/** Na testy. */
export function _resetPointsCache() {
  cache.clear();
}
