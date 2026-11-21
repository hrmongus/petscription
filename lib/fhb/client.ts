import type { components, paths } from './openapi';

/*
 * FHB Kika API 3 klient (SPEC P2). Typy z reference/fhb-openapi.json (npm run fhb:types → lib/fhb/openapi.d.ts).
 *
 * - Auth: POST /login {app_id, secret} → token; hlavička X-Authentication-Simple: base64(token). Token sa cachuje
 *   v pamäti procesu do expirácie (mínus rezerva); pri 401 sa raz prihlási znova a požiadavku zopakuje.
 * - Chyby: každá ne-2xx odpoveď → FhbError so štruktúrou { status, message, violations } (400 = validácia,
 *   violations = { pole: [{code, message}] }). Do orders.fhb_error sa ukladá FhbError.toJSON().
 * - Prostredie: FHB_API_URL (sandbox api-stage / api-dev, produkcia https://api.fhb.sk/v3). Kód nepredpokladá,
 *   že production = live (lib/env-mode.ts fhbMode).
 */

type Json<T> = T extends { content: { 'application/json': infer B } } ? B : never;
type Body<P extends keyof paths, M extends keyof paths[P]> = paths[P][M] extends { requestBody?: infer R } ? Json<NonNullable<R>> : never;

export type FhbOrderInput = Body<'/order', 'post'>;
export type FhbOrderUpdate = Body<'/order', 'put'>;
export type FhbProductInput = Body<'/product', 'post'>;
export type FhbOrder = components['schemas']['OrderView'];
export type FhbProduct = components['schemas']['StockItemView'];
export type FhbStock = components['schemas']['StockView'];
export type FhbParcelService = { code: string; name: string };
export type FhbDeliveryPoint = { id: number; external_code: string; name: string; street: string; city: string; zip: string; country: string };
export type FhbPage<K extends string, T> = { page: number; total: number } & { [key in K]: T[] };
export type FhbOrderStatus = 'pending' | 'confirmed' | 'sent' | 'delivered' | 'returned' | 'rejected';

export type FhbViolations = Record<string, { code?: string; message?: string }[] | string[]>;

export class FhbError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly violations: FhbViolations | null = null,
    readonly endpoint = '',
  ) {
    super(message);
    this.name = 'FhbError';
  }
  /** Validačná chyba (400) – objednávka sa nevytvorí, treba ju opraviť (úloha v admine). */
  get isValidation() {
    return this.status === 400;
  }
  /** Chyba, pri ktorej má zmysel to skúsiť neskôr (sieť, 5xx, 429). */
  get isRetryable() {
    return this.status === 0 || this.status === 429 || this.status >= 500;
  }
  /** Štruktúra pre orders.fhb_error (jsonb). */
  toJSON() {
    return { status: this.status, message: this.message, violations: this.violations, endpoint: this.endpoint, at: new Date().toISOString() };
  }
}

export type FhbConfig = {
  baseUrl: string;
  appId: string;
  secret: string;
  fetch?: typeof fetch;
  /** koľko sekúnd pred expiráciou token obnoviť (predvolene 120) */
  refreshMarginSec?: number;
  /** timeout jednej požiadavky v ms (predvolene 20 000) */
  timeoutMs?: number;
};

type Token = { value: string; expiresAt: number };
// cache tokenu podľa (baseUrl, appId): prežije medzi požiadavkami v tom istom serverless procese
const tokens = new Map<string, Token>();

export function fhbConfigFromEnv(env: Record<string, string | undefined> = process.env): FhbConfig {
  const baseUrl = env.FHB_API_URL;
  const appId = env.FHB_APP_ID;
  const secret = env.FHB_SECRET;
  if (!baseUrl || !appId || !secret) throw new Error('[fhb] FHB_API_URL / FHB_APP_ID / FHB_SECRET nie sú nastavené');
  return { baseUrl, appId, secret };
}

export class FhbClient {
  private readonly base: string;
  private readonly f: typeof fetch;

  constructor(private readonly cfg: FhbConfig) {
    this.base = cfg.baseUrl.replace(/\/+$/, '');
    this.f = cfg.fetch ?? fetch;
  }

  static fromEnv() {
    return new FhbClient(fhbConfigFromEnv());
  }

  private get cacheKey() {
    return `${this.base}|${this.cfg.appId}`;
  }

  /** Zahodí uložený token (napr. po 401). */
  clearToken() {
    tokens.delete(this.cacheKey);
  }

  private async send(method: string, path: string, init: { body?: unknown; headers?: Record<string, string> } = {}) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.cfg.timeoutMs ?? 20_000);
    try {
      return await this.f(this.base + path, {
        method,
        headers: { Accept: 'application/json', ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...init.headers },
        body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
        signal: ctrl.signal,
        cache: 'no-store',
      });
    } catch (e) {
      throw new FhbError(0, `sieťová chyba: ${(e as Error).message}`, null, `${method} ${path}`);
    } finally {
      clearTimeout(timer);
    }
  }

  private static async parse(res: Response): Promise<unknown> {
    if (res.status === 204) return null;
    const text = await res.text();
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }

  private static error(status: number, body: unknown, endpoint: string) {
    const b = (body && typeof body === 'object' ? body : {}) as { message?: string; violations?: FhbViolations };
    const message = b.message ?? (typeof body === 'string' && body ? body.slice(0, 300) : `HTTP ${status}`);
    return new FhbError(status, message, b.violations ?? null, endpoint);
  }

  /** POST /login. Token cachuje do expirácie. */
  async token(force = false): Promise<string> {
    const margin = (this.cfg.refreshMarginSec ?? 120) * 1000;
    const cached = tokens.get(this.cacheKey);
    if (!force && cached && cached.expiresAt - margin > Date.now()) return cached.value;
    const res = await this.send('POST', '/login', { body: { app_id: this.cfg.appId, secret: this.cfg.secret } });
    const body = (await FhbClient.parse(res)) as { token?: string; expiration?: string } | null;
    if (!res.ok || !body?.token) throw FhbClient.error(res.status, body, 'POST /login');
    const exp = body.expiration ? Date.parse(body.expiration) : NaN;
    // bez čitateľnej expirácie počítame s 30 min
    tokens.set(this.cacheKey, { value: body.token, expiresAt: Number.isFinite(exp) ? exp : Date.now() + 30 * 60_000 });
    return body.token;
  }

  /** Autorizovaná požiadavka; pri 401 raz znova login. */
  async request<T>(method: 'GET' | 'POST' | 'PUT' | 'DELETE', path: string, body?: unknown): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      const token = await this.token(attempt > 0);
      const res = await this.send(method, path, { body, headers: { 'X-Authentication-Simple': Buffer.from(token).toString('base64') } });
      if (res.status === 401 && attempt === 0) {
        this.clearToken();
        continue;
      }
      const parsed = await FhbClient.parse(res);
      if (!res.ok) throw FhbClient.error(res.status, parsed, `${method} ${path.split('?')[0]}`);
      return parsed as T;
    }
  }

  // ---------------------------------------------------------------- produkty
  createProduct(p: FhbProductInput) {
    return this.request<FhbProduct>('POST', '/product', p);
  }
  /** PUT /product?id= – nikdy neposielať ean, ktorý FHB mohol opraviť (SPEC P2). */
  updateProduct(id: string, p: Partial<FhbProductInput>) {
    return this.request<FhbProduct>('PUT', `/product?id=${encodeURIComponent(id)}`, p);
  }
  /** GET /product?id= ; null keď neexistuje (404). */
  async getProduct(id: string): Promise<FhbProduct | null> {
    try {
      return await this.request<FhbProduct>('GET', `/product?id=${encodeURIComponent(id)}`);
    } catch (e) {
      if (e instanceof FhbError && e.status === 404) return null;
      throw e;
    }
  }
  /** GET /product/all (stránkované, sandbox vracia {page,total,products}). */
  async listProducts(page = 1): Promise<FhbPage<'products', FhbProduct>> {
    const r = await this.request<FhbPage<'products', FhbProduct> | FhbProduct[]>('GET', `/product/all?page=${page}`);
    return Array.isArray(r) ? { page: 1, total: r.length, products: r } : r;
  }

  // ---------------------------------------------------------------- objednávky
  createOrder(o: FhbOrderInput) {
    return this.request<FhbOrder>('POST', '/order', o);
  }
  /** PUT /order?id= – iba v stave pending. */
  updateOrder(id: string, o: FhbOrderUpdate) {
    return this.request<FhbOrder>('PUT', `/order?id=${encodeURIComponent(id)}`, o);
  }
  /** GET /order?id= ; null keď neexistuje. */
  async getOrder(id: string): Promise<FhbOrder | null> {
    try {
      return await this.request<FhbOrder>('GET', `/order?id=${encodeURIComponent(id)}`);
    } catch (e) {
      if (e instanceof FhbError && (e.status === 404 || (e.status === 400 && /not found|neexist/i.test(e.message)))) return null;
      throw e;
    }
  }
  getOrderByTracking(tracking: string) {
    return this.request<FhbOrder>('GET', `/order?tracking=${encodeURIComponent(tracking)}`);
  }
  /** DELETE /order?id= – iba v stave pending (inak 400 NOT_UPDATABLE_ORDER_ERROR). */
  async deleteOrder(id: string): Promise<void> {
    await this.request<null>('DELETE', `/order?id=${encodeURIComponent(id)}`);
  }
  /** GET /order/history (100 na stranu). from/to = dátum vytvorenia objednávky. */
  orderHistory(q: { from?: string; to?: string; status?: FhbOrderStatus; page?: number } = {}) {
    return this.request<FhbPage<'orders', FhbOrder>>('GET', `/order/history${qs(q)}`);
  }

  // ---------------------------------------------------------------- doprava
  parcelServices() {
    return this.request<FhbParcelService[]>('GET', '/parcel-service');
  }
  /** GET /delivery-point/{service}?country= ; prázdne pole keď služba v krajine nemá miesta (404). */
  async deliveryPoints(service: string, country = 'sk'): Promise<FhbDeliveryPoint[]> {
    try {
      return await this.request<FhbDeliveryPoint[]>('GET', `/delivery-point/${encodeURIComponent(service)}${qs({ country })}`);
    } catch (e) {
      if (e instanceof FhbError && e.status === 404) return [];
      throw e;
    }
  }

  // ---------------------------------------------------------------- vrátené zásielky a sklad
  /** GET /rma/list – zásielky vrátené od dopravcu; from/to = dátum vrátenia. */
  rmaList(q: { from?: string; to?: string; page?: number } = {}) {
    return this.request<FhbPage<'items', FhbOrder>>('GET', `/rma/list${qs(q)}`);
  }
  stockAll() {
    return this.request<FhbStock[]>('GET', '/stock/all');
  }
  stock(id: string) {
    return this.request<FhbStock>('GET', `/stock?id=${encodeURIComponent(id)}`);
  }
}

function qs(q: Record<string, string | number | undefined>) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) if (v !== undefined && v !== '') p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : '';
}

/** Na testy: vyprázdni cache tokenov. */
export function _resetFhbTokenCache() {
  tokens.clear();
}
