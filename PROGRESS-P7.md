# PROGRESS — Projekt 7: dáta z dotazníka a analytika

Zadanie: SPEC **P7** · odchýlky SPEC §10 „Projekt 7“ · Branch: `p7-analytics` (do main iba na pokyn používateľa)
Paralelne: P3 admin (`p2-admin`, `admin/`), P4 portál (`p3-portal`). Spoločné súbory (lib/, migrácie, webhook, kviz.js, cookies.js) iba minimálne.

| Krok | Stav |
|---|---|
| 0. Plán, SPEC P7 | ✅ |
| 1. `quiz_sessions` + `POST /api/quiz` + spárovanie s checkoutom a objednávkou | ✅ migrácia aplikovaná, overené lokálne proti Supabase |
| 2. Cron `retention` (90 dní) | ⏳ |
| 3. Súhlas po kategóriách v `cookies.js` | ⏳ |
| 4. PostHog v prehliadači (udalosti, identify, UTM, replay s maskovaním, proxy `/ingest`) | ⏳ |
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
