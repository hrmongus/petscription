# PROGRESS — Projekt 1: predaj, predplatné a doručenie

Zadanie: `PROJEKT-1.md` · Zdroj pravdy: `SPEC.md` (odchýlky v §10) · Branch: `A`

| Krok | Stav |
|---|---|
| 1. Základ (SPEC P0) | ✅ hotové, preview skontrolované |
| 2. FHB klient (P2) | ✅ hotové, na main |
| 3. Doprava v checkoute (P1b) | ✅ hotové, na main / granula.sk |
| 4. Checkout a predplatné (P1) | 🟡 postavené a otestované na mockoch; čaká na Stripe test kľúče (živý test, test clocks) |
| 5. FHB stavy a emaily | — |
| 6. Test celého toku | — |

## Pred spustením predaja
- [ ] Prepnúť repo na privátne
- [ ] Zapnúť Vercel Deployment Protection (Settings → Deployment Protection → Vercel Authentication; na kontrolu preview bola 21. 11. vypnutá)
- [ ] Premazať testovacie dáta a prepnúť na live kľúče: Supabase (zákazníci, psy, adresy, predplatné, objednávky, eventy z testov na granula.sk), Stripe test objekty, FHB sandbox (aj 10 testovacích produktov `GRAN-*`); Production env → Stripe live + live webhook secret, FHB produkcia `https://api.fhb.sk/v3`. Až potom `CHECKOUT_ENABLED=true`.
- [ ] Stripe účet vedený na Spark Link, s. r. o.
- [ ] Zmazať staré branche (Carbone Company)
- [ ] Záverečná bezpečnostná kontrola: kľúče v histórii gitu, webhooky (podpis, idempotencia), RLS

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

### Kontrola Vercel preview (21. 11.)
- **Preview:** `granula-git-a-hrmo-9099s-projects.vercel.app` (commit `bcc035f`), build OK.
- **Matica URL** (produkcia proti preview, 211 URL):
  - status a presmerovanie sa líšia iba pri 4 zámerne skrytých interných súboroch a pri `/SUROVINY`: Vercel nedrží rozlíšenie veľkosti písmen v presmerovaniach, takže `/SUROVINY` vedie na `/#suroviny` namiesto 404. Neškodné, nechávam tak.
  - `X-Robots-Tag: noindex` je na celom preview, pridáva ho Vercel automaticky (na granula.sk nebude).
- **Vizuálne:** 0 rozdielnych pixelov na všetkých verejných stránkach (desktop aj mobil). Líšia sa iba zámerne zmenené `admin-vypocet` a `admin-blog`.
- **Predaj:** `/api/checkout/status` vráti `closed`. V dotazníku je bez tokenu „Objednávky od 1. 12.“ ako dnes.
- Vercel Authentication pre preview bolo na kontrolu vypnuté → **znova zapnúť**.

---

## Krok 2: FHB klient (21. 11. 2026)

### Hotové
- **OpenAPI:** `reference/fhb-openapi.json` (z `https://api.fhb.sk/v3/openapi`), typy `lib/fhb/openapi.d.ts` (`npm run fhb:types`).
- **`lib/fhb/client.ts`** (`FhbClient`):
  - login s cache tokenu do expirácie (rezerva 120 s), pri 401 jeden nový login,
  - produkty (create, update bez EAN, get, list),
  - objednávky (create, update, get podľa id aj trackingu, delete, history),
  - `parcel-service`, `delivery-point`, `rma/list`, `stock/all`, `stock`,
  - chyby ako `FhbError { status, message, violations, endpoint }` s príznakmi `isValidation` a `isRetryable`; `toJSON()` sa ukladá do `orders.fhb_error`.
- **`lib/fhb/build-order.ts`** (`buildFhbOrder`, podľa SPEC P2):
  - `id` = `orders.id`, `variable_symbol` = `orders.number`, `value`, `cod: 0`,
  - parcel_service podľa spôsobu doručenia, `delivery_point`, notifikačné URL s tokenom,
  - normalizácia telefónu na +421…,
  - lokálne kontroly (VS ≤ 10 číslic, email ≤ 50, výdajné miesto, adresa, dĺžka URL ≤ 255).
- **`lib/fhb/send.ts`** (`sendOrderToFhb`): posiela iba objednávku v stave `paid`/`fhb_error`. Ak je objednávka už vo FHB, overí sa cez `GET /order` a neduplikuje sa.
  - 400 → `fhb_error` so štruktúrou `violations`,
  - sieť/5xx → stav sa nemení, chyba sa vyhodí (zopakuje sa),
  - úložisko nad Supabase.
- **Skripty:**
  - `npm run fhb:sync` (10 SKU; bez `--apply` iba náhľad; zápis do produkcie iba s `--production`),
  - `npm run fhb:smoke` (čítanie; `--write` = testovacia objednávka POST → GET → DELETE, iba sandbox).
- **Testy:** 17 nových testov na mock FHB serveri (spolu 38 ✅). `typecheck` ✅, `build` ✅.

### Overené v sandboxe (api-stage, 21. 11.)
- Login ✅. 10 produktov `GRAN-*` je vytvorených v sandboxe (`fhb:sync --apply`).
- Testovacia objednávka cez SPS výdajné miesto: vytvorená (`pending`, `sps_pudo`, `PS-BJRT0558`) → prečítaná → zmazaná ✅.
- `delivery_point` musí byť `external_code`, nie číselné `id`.
- `validate: true` zlyhá pri každej adrese → pri výdajnom mieste sa nepoužíva, pri kuriérovi sa dá vypnúť (`FHB_VALIDATE_ADDRESS=false`). Pozri SPEC §10.10.
- `notify_url` na produktoch zatiaľ nie je (chýba `FHB_NOTIFY_TOKEN`); po nastavení stačí `npm run fhb:sync -- --apply`.

### Otázky pre FHB (poslať im)
1. **Formát notifikácií objednávok** (`confirmed`, `sent`, `delivered`, `returned`): metóda, telo, podpis? Docs opisujú iba skladovú notifikáciu (POST JSON `id, type, qty, stockQuantity, reason`). Dovtedy notifikácii neveríme, iba ju zalogujeme a stav overíme cez `GET /order`.
2. **Dopravcovia v sandboxe:** `GET /parcel-service` vracia prázdny zoznam. Prosíme povoliť SPS (výdajné miesta aj kuriér) a Packetu a poslať presné kódy. `sps_pudo` funguje, kódy SPS kuriéra a Packety nepoznáme.
3. **Packeta:** aký kód služby a aký formát `delivery_point`? Je to priamo ID výdajného miesta z Packeta widgetu, alebo kód z `GET /delivery-point/<packeta>`? Treba `delivery_point_parameters`?
4. **Kontrola adresy:** v sandboxe `validate: true` odmietne každú adresu („Failed to validate address“), aj bežnú domácu. Je to obmedzenie sandboxu? Ako sa správa produkcia?
5. **Adresa pri výdajnom mieste:** `recipient.address` je povinná aj pri výdajnom mieste. Stačí adresa výdajného miesta, alebo chcete adresu zákazníka?
6. **Sandbox URL:** v emaile uvádzate `api-stage`, v dokumentácii `api-dev` (presmeruje 302). Platí `api-stage`?
7. **Dĺžka `product.id`:** naše SKU má až 27 znakov (`GRAN-hovadzie-morka-jahna-9`). Je to v poriadku? (Sandbox ho prijal.)

### Doplnok ku kroku 2: produkty a sklad (21. 11., zadanie používateľa)
- **18 kg = sada** (`type: multi`, 2 × `GRAN-<receptúra>-9`), spolu 15 produktov. Objednávka nesie vždy jeden produkt (`skuItems`).
- **Sync skript:** sady zakladá až po bežných produktoch, EAN neposiela, `notify_url` = `/api/fhb/stock-notify?t=…`, porovnáva názov, typ a zložky.
- **FHB klient:**
  - príjemky `createStockReceipt` / `updateStockReceipt` / `getStockReceipt` / `deleteStockReceipt`,
  - `archiveProduct`,
  - poznámka, že nízky sklad sa počíta z `free_quantity`.
- **Testy:** 42 ✅. SPEC: SKU (P0), produkty, príjemky a sklad (P2).
- **ID schválené používateľom (21. 11.).** V sandboxe je všetkých 15 produktov (`fhb:sync` ukáže 15 × „bez zmeny“). 10 bežných bolo založených už v kroku 2, 5 sád po schválení.
- **ID** `GRAN-<receptúra>-<kg>`:

| Receptúra | 4 kg | 9 kg | 18 kg (sada 2 × 9 kg) |
|---|---|---|---|
| Hovädzie, morka & jahňa s ryžou | `GRAN-hovadzie-morka-jahna-4` | `GRAN-hovadzie-morka-jahna-9` | `GRAN-hovadzie-morka-jahna-18` |
| Morka, hus & kačica s tekvicou | `GRAN-morka-hus-kacica-4` | `GRAN-morka-hus-kacica-9` | `GRAN-morka-hus-kacica-18` |
| Hovädzie s ryžou | `GRAN-hovadzie-4` | `GRAN-hovadzie-9` | `GRAN-hovadzie-18` |
| Jahňa s batátmi & čučoriedkami | `GRAN-jahna-4` | `GRAN-jahna-9` | `GRAN-jahna-18` |
| Jeleň & králik s batátmi | `GRAN-jelen-kralik-4` | `GRAN-jelen-kralik-9` | `GRAN-jelen-kralik-18` |

### Nasadenie kroku 1 na main / granula.sk (21. 11.)
- **Nasadenie:** `main` fast-forward na `129465c` (krok 1 + prepínač predaja + Supabase), Vercel nasadil za ~30 s.
- **Overenie proti záznamu granula.sk spred nasadenia** (`npm run check:urls -- --against`):
  - 211 URL; status/presmerovanie sa líši iba pri 4 skrytých interných súboroch a `/SUROVINY` (SPEC §10.6),
  - `noindex` pribudol iba na náhľadoch blogu a admin stránkach.
- **Vizuálne:** 11 stránok × desktop/mobil, 0 rozdielnych pixelov oproti stavu pred nasadením.
- **Predaj:** `/api/checkout/status` → `closed`; dotazník bez tokenu aj so zlým tokenom → „Objednávky od 1. 12.“.

---

## Krok 3: Doprava v checkoute (21. 11. 2026, prepracované podľa zadania)

### Hotové
- **3 spôsoby podľa balenia:** Packeta (výdajné miesto / Z-BOX), DPD (odberné miesta a boxy), SPS kuriér na adresu.
  - Pravidlá, predvoľby, ceny a kódy FHB sú v jednom súbore `public/granula/doprava-config.js`.
  - Pri 18 kg sa Packeta neponúka (limit 15 kg).
  - Predvolené: 4 kg Packeta, 9 kg a 18 kg DPD.
- **DPD:** oficiálna mapa DPD v našom okne. Zistenia: nepotrebuje kľúč ani zmluvu. ID z mapy (napr. `SK21286`) = kód vo FHB `dpd_sk`; zhoda 3 951 zo 4 077 miest. Záloha je zoznam nad FHB (prepínač „Zoznam“).
- **Packeta:** bez `PACKETA_API_KEY` vyhľadávanie a zoznam nad FHB `zasielkovna_sk`. S kľúčom oficiálny widget a pod ním „Vyhľadať v zozname“; ak sa widget nenačíta, otvorí sa zoznam.
- **SPS výdajné miesta odstránené** (pop-up, mapa Leaflet, mock so súradnicami).
- **Povinné údaje:** telefón (+421/+420) a e-mail (≤ 50 znakov), meno; adresa iba pri kuriérovi. Výsledok je jeden objekt `delivery` v stave dotazníka.
- **Cena dopravy** sa v súhrne berie podľa zvoleného dopravcu a balenia (`GranulaCarriers.price`). Zatiaľ všade 4,90 €.
- **Server:**
  - `lib/carriers.ts` (`methodsFor`, `defaultMethodFor`, `isMethodAllowed`, `shippingPrice`, `fhbServiceFor`),
  - `lib/delivery-points.ts` (`getPoints`, `searchPoints`, `findPoint` na overenie pred platbou),
  - `GET /api/delivery-points?service=packeta|dpd`,
  - `buildFhbOrder` podľa konfigurácie.
- **DB:** migrácia `p1b_carriers_dpd` (carrier `packeta`/`dpd`/`sps`, method `packeta_point`/`dpd_pickup`/`sps_courier`), aplikovaná na projekt `granula`.
- **Testy:** 51 ✅. `typecheck` ✅, `build` ✅.

### Overené
- **FHB sandbox:** testovacie objednávky Packeta (`zasielkovna_sk`, miesto `6658`) aj DPD (`dpd_sk`, `SK23096`) prijaté → prečítané → zmazané.
- **Prehliadač (desktop aj mobil):**
  - zatvorený predaj: 0 rozdielnych pixelov oproti granula.sk,
  - ponuka podľa balenia: 4 kg Packeta*, DPD, SPS · 9 kg Packeta, DPD*, SPS · 18 kg DPD*, SPS; ceny 4,90 €,
  - DPD mapa → výber `SK21286` → okno sa zavrie, karta s adresou,
  - DPD zoznam (PSČ 010 01), Esc z vyhľadávacieho poľa zavrie okno a vráti fokus,
  - Packeta bez kľúča → zoznam → výber → `delivery` s `point.id` = číslo Packety.

### Rozhodnutia používateľa (21. 11.)
- **18 kg:** DPD (predvolené) + SPS kuriér, Packeta nie.
- **18 kg do DPD:** iba odberné miesta, bez boxov (`BOXES`). V prehliadači overené: mapa pri 18 kg 0 boxov z 200 miest, pri 9 kg 70 boxov zo 100.
- **Kód DPD:** zatiaľ `dpd_sk` (jedno nastavenie), používateľ potvrdí s FHB.

### Otvorené otázky
1. **`PACKETA_API_KEY`** (používateľ zisťuje u FHB), kód SPS kuriéra a potvrdenie `dpd_sk` od FHB.

### Nasadenie na main / granula.sk (21. 11.)
- **Nasadenie:** `main` fast-forward na `f507e98`, Vercel nasadil za ~40 s.
- **`/api/delivery-points?service=dpd`** na produkcii vracia skutočné miesta z FHB sandboxu (`source: fhb`, 3 961). `/api/checkout/status` → `closed`.
- **Porovnanie so záznamom spred nasadenia (214 URL):** zmenili sa iba `granule-na-mieru` a `kviz.js` a pribudli `doprava.js`, `doprava.css`, `doprava-config.js`.
- **Vizuálne:** 11 stránok × desktop/mobil, 0 rozdielnych pixelov. Krok objednávky pri zatvorenom predaji: pôvodné tlačidlo „Objednávky od 1. 12.“, nový výber skrytý.
  - Jedno meranie ukázalo drobné rozdiely aj na nezmenených stránkach (načítanie písma). Opakované meranie dalo 0.

---

## Krok 4: Checkout a predplatné (21. 11. 2026)

### Hotové
- **`lib/stripe.ts`** (vzor FanpageKit): klient, `APP_METADATA = { app: "granula" }`, `isOurs`, `eventMetadata`, `idOf`.
- **`lib/checkout.ts`** (`prepareCheckout`):
  - validácia vstupu (zod), `quote()` zo servera (dávka, D, cena),
  - doručenie: spôsob povolený pre balenie, výdajné miesto overené vo FHB (názov a adresa z FHB, nie z prehliadača), boxy pri 18 kg zamietnuté, telefón +421, e-mail ≤ 50,
  - cena dopravy z `doprava-config.js`, položky `skuItems`.
- **`sessionParams`:**
  - predplatné: `mode: subscription`, krmivo + doprava ako opakované položky `interval: day, interval_count: D`, EUR, `subscription_data.metadata`,
  - jednorazovo: `mode: payment`, `invoice_creation`, `setup_future_usage: off_session`,
  - `ui_mode: embedded_page`, metadata `app=granula` + id draftu, produkt, balenie, D, ceny, spôsob doručenia.
- **`POST /api/checkout`:** prepínač predaja → príprava → draft zákazník/pes/adresa → Stripe zákazník → Products → Session → `{ clientSecret, publishableKey }`.
- **`GET /api/checkout/session`:** stav pre stránku Hotovo (`paid` s číslom objednávky / `processing` / `open`).
- **`POST /api/stripe/webhook`:** podpis, cudzie eventy 200 bez spracovania, idempotencia (`stripe_events` + unikátne `stripe_ref` / `stripe_subscription_id`), chyba → 500.
- **`lib/fulfillment.ts`:**
  - `checkout.session.completed` → predplatné v DB + `trial_end` na prvé obnovenie (doručenie + D − 7) + objednávka `first`/`one_off` → FHB,
  - `invoice.paid` (`subscription_cycle`) → prepočet D (vek šteňaťa) → `renewal` → FHB, pri zmene D jeden `changePlan`,
  - `invoice.payment_failed` → `past_due`,
  - `customer.subscription.updated` / `.deleted` → stav a dátum ďalšej platby.
- **`lib/subscription-schedule.ts`:** dátumy (prvé obnovenie, zmena D, prepočet po doručení) a úpravy predplatného (posun, preskočenie, zmena D/ceny v JEDNOM update s `trial_end` a `proration_behavior: none`, pauza, obnovenie, zrušenie) pre projekty 2 a 3.
- **Dotazník (iba pri otvorenom predaji):** pôvodné platobné polia skryté, „Pokračovať k platbe“ → Embedded Checkout pod krokom 3; zmena doručenia alebo plánu pripravenú platbu zruší. Hotovo: číslo objednávky zo servera.
- **`scripts/stripe-test-clock.ts`** (`npm run stripe:test-clock`): overenie cyklu na test clocks, iba so `sk_test_`.
- **Testy:** 80 ✅ (29 nových: dátumy, Stripe úpravy, príprava a Session, webhooky na pamäťovej DB, webhook route s podpisom). `typecheck` ✅, `build` ✅.

### Overené bez kľúčov
- **Zatvorený predaj:** krok objednávky 0 rozdielnych pixelov oproti granula.sk.
- **API:** bez tokenu `/api/checkout` 403; s tokenom, ale bez Stripe kľúčov 503 „Platby momentálne nie sú dostupné.“ (dotazník ju zobrazí); webhook bez secretu 400.
- **Dotazník** posiela `{ answers, plan, bag, delivery }` (bez ceny a dní). Hotovo s neznámou Session → „Platba nebola dokončená“.

### Čaká na Stripe test kľúče
1. **Do Vercelu** (Production aj Preview): `STRIPE_SECRET_KEY` (`sk_test_…`), `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` (`pk_test_…`). **Webhook** v Stripe (test mode) na `https://granula.sk/api/stripe/webhook` s eventmi zo SPEC §10.12 → `STRIPE_WEBHOOK_SECRET`.
2. **Potom:**
   - `npm run stripe:test-clock` (obnovenie po D dňoch, zmena intervalu bez okamžitej platby),
   - živý test na granula.sk s `?test=` (predplatné, jednorazovo, zlyhaná karta `4000 0000 0000 0341`),
   - kontrola objednávky v DB a vo FHB sandboxe.
3. **DPH:** rozhodnúť (TODO v `lib/checkout.ts`).
4. **Zľavový kód** v súhrne je zatiaľ maketa (Stripe `allow_promotion_codes` sa dá zapnúť neskôr).
