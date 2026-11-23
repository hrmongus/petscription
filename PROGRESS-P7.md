# PROGRESS — Projekt 7: dáta z dotazníka a analytika

Zadanie: SPEC **P7** · odchýlky SPEC §10 „Projekt 7“ · Branch: `p7-analytics` (do main iba na pokyn používateľa)
Paralelne: P3 admin (`p2-admin`, `admin/`), P4 portál (`p3-portal`). Spoločné súbory (lib/, migrácie, webhook, kviz.js, cookies.js) iba minimálne.

| Krok | Stav |
|---|---|
| 0. Plán, SPEC P7 | ✅ |
| 1. `quiz_sessions` + `POST /api/quiz` + spárovanie s checkoutom a objednávkou | ✅ migrácia aplikovaná, overené lokálne proti Supabase |
| 2. Cron `retention` (90 dní) | ✅ dry run naživo OK |
| 3. Súhlas po kategóriách v `cookies.js` | ✅ (texty lišty na potvrdenie, krok 8) |
| 4. PostHog v prehliadači (udalosti, identify, UTM, replay s maskovaním, proxy `/ingest`) | ✅ overené lokálne, udalosti v PostHogu |
| 5. Server-side udalosti z webhooku (+ `withdrawal_submitted` pre P4) | ⏳ |
| 6. Klaviyo „Started Checkout“ + odkaz späť na výsledok | ⏳ |
| 7. Dashboard v PostHogu | ⏳ |
| 8. Texty: zásady ochrany súkromia a cookie lišta | ⏳ |

## Plán udalostí (PostHog)

| Udalosť | Kde | Vlastnosti |
|---|---|---|
| `$pageview` (= page_view) | prehliadač, automaticky | URL bez `?test`/`session_id`, UTM, referrer |
| `quiz_started` | prvá odpoveď v kroku 1 | `quiz_session_id`, `entry` (nový / uložený pes / odkaz z emailu) |
| `quiz_step_completed` | „Ďalej“ v kroku 1–7 | `step`, odpovede kroku bez mena psa |
| `quiz_completed` | obrazovka výsledku | recept, odporúčaný recept, balenie, gramy, D, cena za vrece/deň |
| `plan_selected` | zmena plánu | `plan` |
| `delivery_selected` | výber dopravcu | `carrier`, `method` |
| `checkout_started` | obrazovka doručenia | recept, balenie, plán, cena, `checkout_open` |
| `payment_submitted` | „Zaplatiť“ / peňaženka | `method` (card / express), suma |
| `payment_failed` | chyba platby v prehliadači | `code` |
| `order_completed` | server, webhook | suma, plán, recept, balenie, dopravca, `order_kind`, `is_first_order` |
| `subscription_renewed` | server, `invoice.paid` | suma, recept, balenie, poradie obnovenia |
| `subscription_cancelled` | server, `customer.subscription.*` | dôvod, `cancel_at_period_end` |
| `withdrawal_submitted` | server, helper pre P4 `/odstupenie` | — |

Funnel: `$pageview` → `quiz_started` → `quiz_completed` → `checkout_started` → `order_completed`.

## Krok 1: quiz_sessions (23. 11. 2026)

### Hotové
- **Migrácia** `supabase/migrations/20261123101735_p7_quiz_sessions.sql` (aplikovaná v Supabase `granula`, verzia = názov súboru). Stĺpce podľa SPEC P7 + `max_step`, `plan`, `bag_id`, `delivery_method`, `referrer` (iba doména), `landing_path`, `dog_id`, `paid_at`. FK na `customers`/`dogs`/`orders` s `on delete set null` (zmazanie zákazníka session anonymizuje). RLS bez policies ako ostatné tabuľky. Do `lib/database.types.ts` vložený iba blok `quiz_sessions` (vygenerovaný zo Supabase).
- **`lib/quiz.ts`**: whitelist odpovedí po poliach (`AnswersSchema`), výsledok cez engine na serveri (recept, odporúčaný recept, balenie, gramy, D, cena vreca po zľave a na deň), prvý zdroj (UTM, referrer, vstupná stránka) sa zapíše iba raz, zaplatená session sa nemení. `linkCheckout` (email, customer_id, dog_id, plán, balenie, doprava, `checkout_started_at` iba raz), `linkOrder`, `restorable`.
- **`POST /api/quiz`** (mimo prepínača predaja, max 16 kB) a **`GET /api/quiz/<id>`** (obnovenie: iba dokončená, nezaplatená session do 90 dní; vráti odpovede, plán, balenie, nič o zákazníkovi).
- **Checkout:** `POST /api/checkout` prijme `quizSession` a `consent`; po vytvorení Session spáruje `quiz_sessions` (chyba nákup nezastaví) a vráti `customerId` (identify v PostHogu). Stripe metadata: `quiz_session`, `ph`, `kl` (SPEC §10 P7.3).
- **Webhook:** `lib/fulfillment.ts` má voliteľné `deps.events` (`orderCreated`, `renewed`, `renewalFailed`, `cancelled`), volané iba pri prvom spracovaní, chyba neprerušuje webhook. `handleSubscriptionChanged` dostáva `previous_attributes` (zrušenie sa započíta raz: pri žiadosti ku koncu obdobia alebo pri okamžitom zrušení). Implementácia v `lib/tracking.ts` (zatiaľ `quiz_sessions.order_id`).
- **`kviz.js`:** id dotazníka v stave (`state.qid`), odoslanie pri každej obrazovke (prázdny krok 1 sa neukladá) a pri zmene plánu; `quizSession` a súhlas v `POST /api/checkout`; obnovenie z `?kviz=<id>` (parameter sa hneď odstráni z URL).

### Overené
- `npm test` 120/120 (nové: `lib/quiz.test.ts` 9, fulfillment P7 2), `tsc` OK.
- Lokálne (`next dev` proti Supabase): dotazník s `?utm_source=facebook&utm_campaign=test-p7&fbclid=…` → riadok s UTM a príznakom `fbclid`, výsledok zo servera (`morka-hus-kacica`, 9 kg, 240 g, 37 dní, 67,50 €); obnovenie `?kviz=<id>` v čistom prehliadači otvorí výsledok s tým istým psom, neznáme id → krok 1.
- Spárovanie s checkoutom a objednávkou je overené testami; naživo sa overí pri teste nákupu na preview/granula.sk.

### Poznámka
- **Zdroj návštevy mimo stránky dotazníka:** UTM zo vstupnej stránky (napr. úvodná s `?utm_…`) prenesie do dotazníka `cookies.js` cez `sessionStorage` iba so súhlasom s analytickými cookies (krok 3). Bez súhlasu má `quiz_sessions.utm` iba UTM priamo z URL dotazníka.

## Krok 2: cron retention (23. 11. 2026)

### Hotové
- **`lib/retention.ts`** + **`GET /api/cron/retention`** (Vercel Cron 03:27 UTC denne, `vercel.json`; `?dry=1` iba spočíta; beh sa zapíše do `fhb_events` ako `cron.retention` ako ostatné crony).
  1. `quiz_sessions` s emailom bez objednávky, nezmenené > 90 dní → email, customer_id, dog_id = null, z odpovedí preč meno psa.
  2. `customers` bez objednávky a predplatného, vytvorený aj zmenený pred > 90 dňami → Stripe zákazník zmazaný (iba `metadata.app = granula`), riadok zmazaný (psy, adresy kaskádou), `audit_log` `retention.customer_deleted` (bez emailu).
  - Poistky: Stripe zákazník s úspešnou platbou sa nemaže (`audit_log` `retention.skipped_paid` na ručné riešenie: platba bez objednávky), cudzí Stripe zákazník sa nemaže, zákazník s prihlásením (`auth_user_id`) sa nemaže, bez Stripe kľúča sa nemaže zákazník so Stripe id. Max. 200 zákazníkov na beh.
- `updated_at` zákazníka sa mení pri každom novom checkoute (`upsertCustomer`), takže 90 dní plynie od posledného pokusu o nákup.

### Overené
- `lib/retention.test.ts` (3), dry run `localhost` proti Supabase: 0 kandidátov (najstarší zákazník je z 21. 11.), bez `CRON_SECRET` 401.

## Krok 3: súhlas po kategóriách (23. 11. 2026)

### Hotové
- **`cookies.js`:** kategórie analytické (PostHog) a marketingové (Klaviyo). Lišta: „Prijať všetky“, „Len nevyhnutné“, „Nastaviť“ (rozbalí prepínače Nevyhnutné / Analytické / Marketingové a „Uložiť výber“). `localStorage` `granula-cookies` = `all` | `necessary` | `analytics` | `marketing` (staré `all`/`necessary` platia). Odkaz „Nastavenia cookies“ (`data-cookie-settings`) otvorí lištu s aktuálnou voľbou.
- Analytický súhlas → `analytics.js` (krok 4) + zdroj návštevy do `sessionStorage` `granula-src`; marketingový → Klaviyo (ako doteraz pri „Prijať všetky“). „Povoliť a zobraziť formulár“ pri Klaviyo embede = iba marketing. Odvolanie súhlasu po načítaní skriptu: PostHog `opt_out_capturing` + obnovenie stránky (ako doteraz pri Klaviyo).
- API pre ostatné skripty: `GranulaConsent.has()`, udalosť `granula:consent`, `GranulaAnalytics.track/identify` (fronta; bez súhlasu sa zahodí, aj udalosti z `kviz.js` spred načítania `cookies.js` cez `__granulaQ`).
- `granula.css`: pár riadkov pre rozbalené nastavenia (desktop aj mobil).

### Overené
- Playwright desktop 1280 aj mobil 390: lišta zbalená / rozbalená, výber „iba analytické“ → `analytics`, `analytics.js` sa pridá, Klaviyo nie.

## Krok 4: PostHog v prehliadači (23. 11. 2026)

### Hotové
- **`public/granula/analytics.js`** (načíta ho iba `cookies.js` po analytickom súhlase): oficiálny načítavač PostHogu, `api_host: /ingest`, `person_profiles: identified_only`, `$pageview` pri načítaní stránky + `$pageleave`, autocapture (klik na uloženého psa sa zahodí, nesie meno). **Záznam relácie:** všetky vstupy maskované (`maskAllInputs` + všetky typy), maskované texty s menom psa, kontaktom a adresou (`[data-name]`, rekapitulácia platby, vybrané výdajné miesto, Hotovo…). `before_send` odstráni z URL `?test=`, `?session_id=`, `?kviz=`.
- **Proxy `/ingest`** (`lib/analytics-routes.ts`, `next.config.ts` beforeFiles; `proxy.ts` nevracia 404 pre `/ingest/…/`). **`GET /api/analytics/config`** dá statickému webu kľúč z env.
- **Udalosti v `kviz.js`** (SPEC P7): `quiz_started` (prvá odpoveď alebo uložený pes; `entry`), `quiz_step_completed` (krok 1–7 + odpovede kroku bez mena), `quiz_completed` (recept, odporúčaný recept, balenie, odporúčané balenie, gramy, D, cena, cena/deň; aj „bez vhodnej receptúry“), `checkout_started`, `plan_selected`, `delivery_selected` (dopravca, spôsob), `payment_submitted` (karta / Apple Pay / Google Pay / Link), `payment_failed` (dôvod). Každá nesie `quiz_session_id`; štart, dokončenie a checkout iba raz na dotazník.
- **Identify:** po `POST /api/checkout` `identify(customer_id)`; email do PostHogu nejde. UTM a referrer: PostHog ich ukladá sám (`$initial_utm_*`, `$initial_referrer` na osobe, `$entry_*` na relácii).

### Overené (Playwright + PostHog)
- Bez súhlasu **0 požiadaviek** na PostHog. So súhlasom: `/ingest/e/`, `/ingest/s/` (záznam), v PostHogu `$pageview` s `utm_source=facebook`, `quiz_started`, `quiz_step_completed` (krok 2, `sex: pes`), `quiz_completed`, `checkout_started`. Meno psa ani `?test=` token sa v žiadnej udalosti neobjavili.
- PostHog zahadzuje udalosti z headless prehliadačov (bot filter) — v teste bol prepísaný user agent. V projekte sú teraz testovacie udalosti z `localhost` (dashboard ich filtruje podľa hostu, krok 7).
