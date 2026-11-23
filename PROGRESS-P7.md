# PROGRESS — Projekt 7: dáta z dotazníka a analytika

Zadanie: SPEC **P7** · odchýlky SPEC §10 „Projekt 7“ · Branch: `p7-analytics` (do main iba na pokyn používateľa)
Paralelne: P3 admin (`p2-admin`, `admin/`), P4 portál (`p3-portal`). Spoločné súbory (lib/, migrácie, webhook, kviz.js, cookies.js) iba minimálne.

| Krok | Stav |
|---|---|
| 0. Plán, SPEC P7 | ✅ |
| 1. `quiz_sessions` + `POST /api/quiz` + spárovanie s checkoutom a objednávkou | ⏳ |
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
