# PROGRESS — Projekt 1: predaj, predplatné a doručenie

Zadanie: `PROJEKT-1.md` · Zdroj pravdy: `SPEC.md` (odchýlky v §10) · Branch: `A`

| Krok | Stav |
|---|---|
| 1. Základ (SPEC P0) | ✅ hotové, čaká na „ok“ |
| 2. FHB klient (P2) | — |
| 3. Doprava v checkoute (P1b) | — |
| 4. Checkout a predplatné (P1) | — |
| 5. FHB stavy a emaily | — |
| 6. Test celého toku | — |

## Pred spustením predaja
- [ ] **Premazať testovacie dáta** (Supabase: zákazníci, psy, adresy, predplatné, objednávky, eventy z testov na granula.sk; Stripe test objekty; FHB sandbox) a **prepnúť Production env na live kľúče** (Stripe live + live webhook secret, FHB produkcia `https://api.fhb.sk/v3`). Až potom `CHECKOUT_ENABLED=true`.

---

## Krok 1: Základ (21. 11. 2026)

### Hotové
- **Podklady:** `SPEC.md`, `PROJEKT-1.md`, `reference/fanpagekit/` (19 súborov). Pred commitom som v nich hľadal kľúče (`sk_/pk_/whsec_/re_`, JWT, privátne kľúče, heslá, Stripe ID, Supabase URL): nič, kód číta iba `process.env`.
- **Next.js 16.4 (App Router, TypeScript)** v koreni repa. `granula/` → `public/granula/` cez `git mv`. Okrem zámerných úprav nižšie je obsah nezmenený, história ostáva zachovaná.
- **`vercel.json`** = iba `{ "framework": "nextjs" }`. Pravidlá sú v `lib/site-routes.ts`:
  - presmerovania: cleanUrls + 4 pôvodné,
  - rewrites vo fáze `fallback`, aby `/api/*` a `app/` mali vždy prednosť,
  - hlavičky,
  - `/blog` → `/blog/`, `/admin-blog` → `/admin-blog/` a 404 pre `/stranka/` rieši `proxy.ts`, lebo Next pri pravidlách ignoruje koncovú lomku,
  - nastavenia `skipTrailingSlashRedirect`, `skipProxyUrlNormalize` a `experimental.caseSensitiveRoutes`.
- **Blog:** zdroje sú v `content/blog/` (`_src`, `_autori`, `build.py`, `foto.py`, všetky `*.md`). Build zapisuje do `public/granula/blog/`, `public/granula/sitemap.xml` a `public/robots.txt`. Cesty sú opravené v `build.py`, `foto.py`, pokynoch a v komentároch `_src`.
  - **Overenie:** pôvodný build (pôvodný commit, worktree) a nový build dávajú bajtovo zhodné HTML. Rozdiel je len v textoch ciest v `posts.js` a v komentári v `robots.txt`.
  - Prebuild odstránil prázdny riadok v menu náhľadov. Šlo o starý nesúlad: posledný commit zmenil menu bez prebuildovania. PDF náhľady (10) sú pregenerované.
- **Engine:**
  - UMD export (`module.exports` popri `window.GranulaEngine`), logika výpočtu je nezmenená.
  - `reorderLeadDays` 3 → 7, nový `shipDays: 3`, `nextDay = max(1, D − 7 + 3)` (SPEC §10.5).
  - Text v súhrne objednávky (`kviz.js`): „Ďalšie vrece pošleme tak, aby prišlo asi 4 dni predtým, ako sa minie.“
  - Popis nových parametrov v `admin-vypocet.html`.
- **`lib/engine-server.ts`:**
  - zod whitelist odpovedí (neznáme kľúče ako `params` a ceny sa zahodia),
  - `compute` vždy s čerstvou kópiou predvolených `PARAMS`,
  - `quote()` vráti produkt, gramy, D, cenu v centoch, dopravu, nextDay a snapshot,
  - `skuItems()` (18 kg = 2 × 9 kg) a `allSkus()` (10 SKU).
  - Overené, že sa dá zabaliť do API route v Next (dočasná route, potom zmazaná).
- **Supabase:** migrácia `supabase/migrations/20261121120000_p0_schema.sql` (9 tabuliek podľa SPEC P0, RLS všade, bez policies, granty pre anon/authenticated odobraté).
  - Overené na lokálnom Postgrese 16: migrácia prejde, check constraints a unikáty fungujú, anon/authenticated dostanú `permission denied`.
  - Typy `lib/database.types.ts` sú vygenerované z tejto schémy. Klient `lib/db.ts` (service role).
- **`.env.example`** podľa SPEC §8.
- **Vitest:** 14 testov (`lib/engine-server.test.ts`, `lib/site-routes.test.ts`).
- **Admin stránky:** `admin-vypocet.html` a `admin-blog/` už mali `noindex`, nie sú v sitemap a `robots.txt` ich zakazuje. Pridal som hlavičku `X-Robots-Tag: noindex, nofollow` (aj pre `/blog/nahlad/*`).
- **Dokumentácia:** `CLAUDE.md` (odkazy na SPEC a PROGRESS, pravidlá §0, nová štruktúra), `README.md`.

### Kontrola
- `npm run build` ✅ · `npm run typecheck` ✅ · `npm test` ✅ (14/14)
- **Matica URL** `npm run check:urls`: 211 URL, produkcia (www.granula.sk) proti lokálnemu `next start`. Kontroluje sa každý súbor webu, čisté adresy, priečinky s lomkou aj bez nej a okrajové prípady (`/podpora.html`, `/index`, `/blog/index.html`, `/granula/…`, `/suroviny`, `/SUROVINY`, `/podpora/`, query string).
  - Status a presmerovanie sa líšia iba pri 4 zámerne skrytých interných súboroch: `/blog/CLAUDE.md`, `/blog/HANDOVER.md`, `/blog/build.py`, `/blog/_src/_template.md` (200 → 404).
  - Obsah sa líši iba pri zámerne zmenených súboroch: `engine.js`, `kviz.js`, `admin-vypocet.html`, `blog/posts.js`, `robots.txt`, prebuildované blogové HTML a PDF.
- **Vizuálne** (Playwright, full-page, desktop 1280 aj mobil 390, pixelové porovnanie s produkciou):
  - 0 rozdielnych pixelov: `/` (úvodná), `/podpora`, `/granule-na-mieru`, `/blog/`, náhľad článku, stránka autora, `/obchodne-podmienky`, `/garancia`, na desktope aj mobile (lenivo načítané obrázky sa pred snímkou vynútia, inak sa načasovanie líši aj medzi dvoma lokálnymi snímkami).
  - `admin-vypocet` a `admin-blog` sa líšia zámerne (nový parameter, čas buildu v `posts.js`).
- **Vercel preview:** vznikne po pushnutí branchu A. Treba overiť, či Vercel zoberie `framework` z `vercel.json` (pozri otázky).

### Otvorené otázky
1. ~~**Supabase**~~ ✅ vyriešené 21. 11.: projekt `granula` (ref `pqvnxxoblguckyetkwjd`, eu-central-1). Migrácie `p0_schema` a `p0_fk_indexes` sú aplikované, súbory v `supabase/migrations/` majú rovnaké verzie ako v databáze. Typy sú pregenerované zo Supabase. RLS overené cez REST API: anon číta aj zapisuje 401, service role 200. Security advisor hlási len zámerný stav (RLS bez policies, INFO).
2. **Odchýlky v SPEC §10** (1–8) na potvrdenie. Najdôležitejšie sú `addresses.delivery_method/point_id` (SPS ParcelShop), interpretácia `nextDay` a nový text v súhrne objednávky.
3. **`public/granula/README.md`** je verejný na `/README.md` (interná dokumentácia). Presunúť ho do `content/` alebo `docs/`?
4. **Vercel preview:** framework je nastavený iba cez `vercel.json`. Ak preview zlyhá (napr. projekt má v dashboarde prepísaný Output Directory alebo Build Command), pošli mi build log. Riešenie bez zásahu do dashboardu a produkcie je doplniť do `vercel.json` `"buildCommand": "next build"` a `"outputDirectory": ".next"`.
5. **SKU:** id receptúr z engine sú dlhé (`GRAN-hovadzie-morka-jahna-9`, 27 znakov). Limit dĺžky FHB `product.id` overím v kroku 2 z OpenAPI.
6. **DPH** (krok 4) ostáva otvorená podľa zadania.

### Doplnok ku kroku 1: testovanie na produkcii
- Testuje sa na main / granula.sk. Production env bude mať zatiaľ test kľúče (Stripe test, FHB api-stage). Kód test/live určuje iba z kľúča (`lib/env-mode.ts`: `stripeMode`, `fhbMode`), nikdy z `NODE_ENV` / `VERCEL_ENV`.
- **Prepínač** (`lib/checkout-gate.ts`, `GET /api/checkout/status`):
  - `CHECKOUT_ENABLED=true` otvorí doručenie a platbu všetkým,
  - inak sa otvorí iba s `?test=<CHECKOUT_TEST_TOKEN>` (min. 16 znakov, porovnanie v konštantnom čase).
- **`kviz.js`:** token z URL hneď odstráni (nedostane sa do analytiky ani zdieľaných odkazov), drží ho v `sessionStorage` záložky a posiela v hlavičke `X-Checkout-Test`. Bez otvoreného predaja je dotazník ako dnes („Objednávky od 1. 12.“, oznam o predregistrácii).
- **Overené v prehliadači:** bez tokenu a so zlým tokenom „Objednávky od 1. 12.“, so správnym „Zaplatiť 72,40 €“ a token zmizne z URL. 21 testov ✅.
- **Vercel env (Production aj Preview):** nastav `CHECKOUT_TEST_TOKEN` (napr. `openssl rand -hex 24`) a `CHECKOUT_ENABLED=false`.
- **Otázka:** platí výklad, že `CHECKOUT_ENABLED=true` = spustenie predaja pre všetkých a token = testovanie pred spustením? (SPEC §10.9)

### Kontrola env (21. 11.)
- **Overené z env tohto prostredia, hodnoty sa nevypisovali:**
  - `NEXT_PUBLIC_SUPABASE_URL` ukazuje na projekt `granula`,
  - service role aj anon kľúč fungujú (`/rest/v1/` 200, `/auth/v1/settings` 200),
  - `FHB_API_URL` = `api-stage.fhb.sk`, `POST /login` s `FHB_APP_ID`/`FHB_SECRET` vráti 200 a token.
- **`SUPABASE_URL`** (bez `NEXT_PUBLIC_`) ukazuje na iný projekt (`analyzer`, neaktívny). Kód ju nepoužíva, odporúčam ju zmazať, aby sa nepomýlila.
- **Chýbajú:** `CHECKOUT_TEST_TOKEN`, `CHECKOUT_ENABLED`, Stripe test kľúče (`STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`), `NEXT_PUBLIC_SITE_URL`, `FHB_NOTIFY_TOKEN`, `PACKETA_API_KEY`, Resend, `CRON_SECRET`.

### Ostáva (ďalšie kroky)
- Krok 2: FHB klient (`lib/fhb/`, OpenAPI typy, `buildFhbOrder`, sync a smoke skripty na mockoch).
