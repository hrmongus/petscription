# Granula — SPEC: predaj, predplatné, FHB, admin, zákaznícky portál

Repo: `hrmongus/petscription` · Stack: Next.js (App Router) + Supabase + Stripe + Vercel · Fulfillment: FHB (Kika API 3)
Referenčný kód: FanpageKit (`fanpagekit-main`) — Stripe vzory prevziať, nie prepisovať od nuly.
Stav: 21. 11. 2026. Tento súbor je zdroj pravdy; každé rozhodnutie počas práce sa sem dopíše.

---

## 0. Pravidlá (platia pre všetky projekty)

- **Iba test mode** (Stripe test kľúče, FHB sandbox), kým nie je celý tok otestovaný end-to-end.
- **Testuje sa priamo na produkcii** (main / granula.sk, zatiaľ bez zákazníkov): Production env má test kľúče (Stripe test, FHB api-stage). Kód **nikdy nepredpokladá production = live**; test/live určuje iba kľúč (`lib/env-mode.ts`).
- **Prepínač predaja:** `CHECKOUT_ENABLED=true` → doručenie a platba pre všetkých; inak dotazník ako dnes (predregistrácia) a doručenie + platba iba s tajným `?test=<CHECKOUT_TEST_TOKEN>`. Kontroluje sa v UI aj na každom serverovom endpointe checkoutu (`lib/checkout-gate.ts`).
- **Kľúče iba v env** (`.env.local`, Vercel Environment Variables). Nikdy v repe. Repo prepnúť na **privátne** (obsahuje aj referenčný kód FanpageKit v `reference/`).
- **Cena, dávka, D a dátumy sa počítajú iba na serveri** cez `engine.js` s predvolenými `PARAMS`. Nič z prehliadača (vrátane `localStorage` `granula-engine-params`) sa neprevezme.
- **Objednávka sa vytvára iba z overeného Stripe webhooku**, nie z návratovej URL.
- Každý webhook (Stripe aj FHB) je **idempotentný**: druhé spracovanie toho istého eventu nič nezduplikuje.
- Každý Stripe objekt nesie `metadata.app = "granula"`; webhook cudzie eventy ignoruje (vzor `isOurs` z FanpageKit — Stripe účet je bývalý Mamsa účet).
- Každá fáza končí commitom; zmeny v rozhodnutiach sa zapíšu do tohto súboru.
- Statické stránky webu (dizajn, blog) sa **nemenia**, iba sa presunú pod Next.js.

---

## 1. Kľúčová logika: cyklus predplatného

- `D` = počet dní, ktoré vrece vydrží = `floor(kg × 1000 / gramy_denne)` (už počíta `engine.js` → `bags[].days`).
- `LEAD = 7` dní (expedícia FHB ~1 d + doručenie 1–2 d + rezerva na neúspešnú platbu 3–4 d). Parameter v configu.
- `SHIP_DAYS = 3` (odhad dňa doručenia od zaplatenia, kým FHB nepošle skutočné `delivered_at`).
- **Interval predplatného = D**, nie D − LEAD. Posun o LEAD sa robí iba raz.
- Prvé obnovenie = `deň_doručenia + D − LEAD`
  - pri vytvorení: `deň_doručenia = zaplatené + SHIP_DAYS` (odhad),
  - keď FHB pošle `delivered_at`, prvé obnovenie sa prepočíta na skutočný dátum (ak sa líši o > 1 deň a je v budúcnosti).
- Ďalšie obnovenia: každých D dní automaticky (Stripe).
- Zmena váhy / dávky / balenia → nové D → `next_charge = posledné_doručenie + D_nové − LEAD` (najskôr zajtra).
- Šteňatá: pri každom obnovení prepočítať D podľa aktuálneho veku (engine).
- **Úprava v `engine.js`:** `reorderLeadDays: 3` → 7 a `nextDay` počítať od doručenia (odhad SHIP_DAYS), nie od objednávky. Zosúladiť texty v `kviz.js`.

### Stripe implementácia cyklu
- Subscription item s `price_data`: `recurring: { interval: "day", interval_count: D }`, `product` = Stripe Product pre recept × balenie, `unit_amount` = cena z engine (zľava predplatného zahrnutá), `currency: "eur"`.
- Po prvej platbe (`checkout.session.completed`): `subscriptions.update(trial_end = prvé_obnovenie, proration_behavior: "none")`.
- Posunúť / preskočiť dodávku: `trial_end = nový_dátum`, `proration_behavior: "none"`.
- Zmena D alebo ceny: v **jednom** update nový item (`price_data`) + `trial_end = next_charge` + `proration_behavior: "none"` — zmena intervalu inak resetuje billing anchor a **stiahne platbu hneď**. ⚠️ Overiť v test mode (test clock) pred nasadením.
- Pauza: `pause_collection: { behavior: "void" }` (+ voliteľne `resumes_at`).
- Zrušenie: `cancel_at_period_end` (zákazník) alebo okamžite (odstúpenie od zmluvy).
- Testovanie cyklov: **Stripe test clocks**.

---

## 2. Projekty a poradie

| # | Projekt | Závisí od | Paralelne s |
|---|---|---|---|
| P0 | Základ: Next.js kostra, Supabase schéma, engine na serveri | — | P2 (FHB klient) |
| P1 | Checkout a predplatné (Stripe) | P0 | P2 |
| P1b | Doprava v checkoute: Packeta + SPS pop-up widgety | P0 (FHB klient pre SPS dáta) | P1, P2 |
| P2 | FHB integrácia | P0 (schéma), samotný klient nie | P1 |
| P3 | Admin portál | P0, P1, P2 | P4 |
| P4 | Zákaznícky portál + odstúpenie od zmluvy | P0, P1 | P3 |
| P5 | Transakčné emaily | P1, P2 | P3, P4 |
| P6 | Spustenie: test celého toku, produkčné kľúče | všetko | — |
| P7 | Dáta z dotazníka a analytika (PostHog, Klaviyo) | P1 | P3, P4 |

Paralelná práca = samostatné Claude Code chaty na samostatných branchoch (git worktree), merge cez PR.

---

## P0 — Základ

**Cieľ:** web beží ako Next.js appka bez vizuálnej zmeny, databáza pripravená, engine spustiteľný na serveri.

- Next.js (App Router, TypeScript) v koreni repa; existujúce `granula/*` → `public/granula/` bez zmien (štruktúra priečinka ostáva).
- **Vercel:** framework nastaviť cez `vercel.json` v branchi (`{ "framework": "nextjs" }`), NIE v nastaveniach projektu — produkcia (main) je do merge stále statická a zmena v dashboarde by ju rozbila. Rewrites/redirects/headers presunúť do `next.config.ts`, vo `vercel.json` ostane iba `framework`. `skipTrailingSlashRedirect: true` (inak slučka s `/blog/`).
- **Interné súbory mimo `public/`:** blogové zdroje (`blog/_src`, `build.py`, `foto.py`, `CLAUDE.md`, `HANDOVER.md`, `NAVOD.md`, `STYL.md`, `TEMY.md`, `GEO-TEMPLATE.md`, `_autori`) → `content/blog/`; dnes sa servírujú verejne. Build zapisuje výstup do `public/granula/blog/`. Zachovať všetky URL (dnes `vercel.json` rewrites + `cleanUrls`) — prepísať do `next.config` rewrites/redirects. Blog build (`content/blog/build.py`, predtým `granula/blog/build.py`) musí fungovať naďalej (upraviť cesty).
- `engine.js`: doplniť export pre Node (UMD: `module.exports` popri `window.GranulaEngine`) bez zmeny logiky. Server ho volá s predvolenými `PARAMS` (`lib/engine-server.ts`). Úprava LEAD podľa §1.
- Supabase: migrácie v `supabase/migrations`, typy `lib/database.types.ts` (vzor FanpageKit).
- `CLAUDE.md`: doplniť odkaz na `SPEC.md` a pravidlá z §0.
- `.env.example` (zoznam v §8).
- Ochrana: `admin-vypocet.html` a `admin-blog/` dnes verejné → do P3 aspoň `noindex` + Vercel password / presun pod admin.

### Dátový model (Supabase, RLS zapnuté všade)

- `customers` — id, auth_user_id, email, name, phone, stripe_customer_id (unique), created_at
- `addresses` — id, customer_id, name, street, city, zip, country, carrier (`sps` | `packeta`), delivery_method (`packeta_point` | `sps_parcelshop` | `sps_courier`), point_id, point_label, is_default _(zmena v P0, pozri §10: pôvodne packeta_point_id / packeta_point_label)_
- `dogs` — id, customer_id, name, answers (jsonb = odpovede dotazníka), weight_kg, birth_date, updated_at
- `subscriptions` — id, customer_id, dog_id, address_id, stripe_subscription_id (unique), status (`active` | `paused` | `past_due` | `cancelled`), product_id (receptúra z engine), bag_id (`4` | `9` | `18`), grams_per_day, days_per_bag (D), unit_amount_cents, plan (`mesiac`), next_charge_at, last_delivered_at, engine_snapshot (jsonb — vstupy a výstup engine pri poslednom prepočte), created_at
- `orders` — id (uuid), number (bigserial → FHB `variable_symbol`, max 10 číslic), customer_id, subscription_id (null pri jednorazovom), kind (`first` | `renewal` | `one_off`), stripe_ref (checkout session / invoice / payment intent id, **unique**), amount_cents, items (jsonb `[{sku, qty}]`), ship_to (jsonb snapshot adresy), status (`paid` | `sent_to_fhb` | `fhb_error` | `confirmed` | `sent` | `delivered` | `returned` | `cancelled` | `refunded`), fhb_error (jsonb — štruktúrované `violations`, §10), tracking (jsonb), shipped_at, delivered_at, created_at
- `stripe_events` — event_id (PK), type, processed_at (idempotencia)
- `fhb_events` — id, order_id, type, payload (jsonb), received_at
- `withdrawals` — id, order_id, subscription_id, name, email, contract_ref, reason, content (jsonb snapshot formulára), submitted_at (čas servera), confirmation_sent_at, status (`received` | `return_pending` | `refunded` | `rejected`)
- `audit_log` — id, actor (admin email / `customer` / `system`), action, entity, entity_id, before, after, at
- Admin rola: Supabase Auth `app_metadata.role = "admin"`; admin dotazy cez service role iba na serveri.

### SKU (FHB produkty)
_(zmenené 21. 11. 2026 podľa zadania používateľa: 18 kg je sada, nie 9 kg × 2 v objednávke)_
- **15 produktov:** 10 bežných (`type: "single"`) `GRAN-<receptúra>-4` a `GRAN-<receptúra>-9` + 5 sád `GRAN-<receptúra>-18` (`type: "multi"`, `items: [{ id: "GRAN-<receptúra>-9", quantity: 2 }]`).
- Objednávka obsahuje vždy jeden produkt podľa balenia (18 kg = sada `GRAN-<receptúra>-18` × 1, nie `-9` × 2).
- Receptúry = `PRODUCTS` v `engine.js` (id ako v engine): `hovadzie-morka-jahna`, `morka-hus-kacica`, `hovadzie`, `jahna`, `jelen-kralik`.
- **ID sa po založení nikdy nemení.** Produkty sa vo FHB nedajú zmazať, iba archivovať (`GET /product/archive`), a archivovaný produkt nemôže byť zložkou sady. Preto sa id receptúr v `engine.js` nesmú premenovať. Nové ID sa pred založením ukážu používateľovi.
- **Názov vo FHB:** „Granula! <receptúra> <kg> kg“, pri sade „… 18 kg (2 × 9 kg)“.

---

## P1 — Checkout a predplatné (Stripe)

**Cieľ:** zákazník dokončí dotazník, zaplatí (predplatné alebo jednorazovo) a vznikne objednávka v DB.

- Prevziať z FanpageKit: `lib/stripe.ts` (klient, `APP_METADATA`, `isOurs`, `idOf`), štruktúru `lib/payment.ts` / `lib/subscription.ts`, `app/api/stripe/webhook/route.ts` (overenie podpisu, switch eventov, chyba → 500 aby Stripe zopakoval), testy (vitest).
- **Tok v `granule-na-mieru.html`:**
  1. Výsledok dotazníka → výber plánu (`mesiac` −10 % / `raz`) a balenia.
  2. Doručenie na našej stránke: meno, email, **telefón (povinný — FHB)** a spôsob doručenia podľa **P1b**.
  3. `POST /api/checkout` s odpoveďami dotazníka + voľbami. Server: engine → produkt, dávka, D, cena; uloží customer/dog/address (draft); vytvorí Checkout Session.
  4. Platba cez **Embedded Checkout** (`ui_mode: embedded`, `initEmbeddedCheckout` vo vanilla JS) — rovnako ako FanpageKit. Pripravené polia Address/Payment Element v HTML nahradiť.
  5. Návrat → stránka „Hotovo“ (číta stav zo servera, nič nezakladá).
- **Predplatné:** `mode: "subscription"`, line item s `price_data` (§1) + doprava `shipping` (4,90 € z `PARAMS.shipping`) ako druhý recurring item s rovnakým intervalom. `subscription_data.metadata` = app, customer_id, dog_id, product_id, bag_id, D.
- **Jednorazovo:** `mode: "payment"`, `price_data`, `customer_creation: "always"`, `invoice_creation.enabled`, `payment_intent_data.setup_future_usage: "off_session"` (ľahký prechod na predplatné).
- **Webhooky:**
  - `checkout.session.completed` → objednávka `first` / `one_off` (status `paid`) → pri predplatnom nastaviť `trial_end` (§1) → P2 odoslanie do FHB → P5 email.
  - `invoice.paid` s `billing_reason = "subscription_cycle"` → objednávka `renewal` → FHB → email. Pred vytvorením prepočítať D (šteňatá).
  - `invoice.payment_failed` → subscription `past_due`, email zákazníkovi, položka v admine.
  - `customer.subscription.updated` / `.deleted` → synchronizácia stavu.
- Stripe Billing nastavenia: Smart Retries zapnuté, emaily na dooverenie karty (SCA) zapnuté, Customer Portal iba na kartu + faktúry (bez zmeny plánu).
- **DPH (rozhodnutie používateľa 21. 11. 2026):** Spark Link s. r. o. zatiaľ **nie je platiteľ DPH**. Ceny z výpočtu (`engine.js`) sú **konečné ceny pre zákazníka**; DPH sa neodvádza ani neuvádza. V checkoute, na faktúre ani v emailoch sa nepíše „s DPH“ (Stripe bez `automatic_tax` a bez daňových sadzieb). `PARAMS.vat` používa iba interná stránka `admin-vypocet`. **Zmeniť, keď sa firma stane platiteľom DPH** (Stripe Tax alebo sadzby, texty, faktúra). Náležitosti faktúry neplatiteľa overiť s účtovníčkou (Stripe faktúra vs. SuperFaktúra).

---

## P1b — Doprava v checkoute: Packeta, DPD, SPS kuriér

_(prepracované 21. 11. 2026 podľa zadania používateľa: SPS iba kuriér, pribudlo DPD, pravidlá podľa balenia)_

**Cieľ:** zákazník v kroku Doručenie (pred platbou) vyberie spôsob doručenia; pri výdajnom mieste ho vyberie na mape alebo zo zoznamu. Vybrané miesto sa uloží tak, aby ho FHB prijal v `delivery_point`.

### Spôsoby doručenia
| Spôsob (`delivery_method`) | V dotazníku | Výber miesta | FHB `parcel_service` | Kód miesta (`delivery_point`) |
|---|---|---|---|---|
| `packeta_point` | Packeta – výdajné miesto alebo Z-BOX | oficiálny widget Packeta v6 (s `PACKETA_API_KEY`); záloha = vyhľadávanie + zoznam nad FHB | `zasielkovna_sk` | číslo miesta Packety (= `id` z widgetu, = FHB `external_code`, napr. `33711`) |
| `dpd_pickup` | DPD – odberné miesta a boxy | oficiálna mapa DPD `pickup-maps.dpd.sk/widget` (bez kľúča a zmluvy); záloha = vyhľadávanie + zoznam nad FHB | `dpd_sk` | `SK…` (= `id` z mapy DPD, = FHB `external_code`, napr. `SK21286`) |
| `sps_courier` | SPS – kuriér na adresu | adresa (ulica, PSČ, mesto) | ⚠️ kód od FHB (zatiaľ predvolená služba účtu) | — |

- SPS výdajné miesta (`sps_pudo`) sa **nepoužívajú** (pop-up a mapa odstránené).
- **Telefón povinný** pri všetkých spôsoboch (+421/+420), e-mail ≤ 50 znakov (FHB). Adresa zákazníka iba pri kuriérovi; pri výdajnom mieste ide do FHB `recipient.address` adresa miesta.
- **Doby doručenia v texte:** Packeta a DPD 2–3, SPS kuriér 1–2 pracovné dni.

### Pravidlá podľa balenia — jeden konfiguračný súbor `public/granula/doprava-config.js`
Ten istý súbor používa dotazník (prehliadač) aj server (`lib/carriers.ts`: overenie v `/api/checkout`, cena, kód služby FHB).

| Balenie | Packeta | DPD odberné | SPS adresa | Predvolené |
|---|---|---|---|---|
| 4 kg | 1,95 € | 2,64 € | 3,29 € | Packeta |
| 9 kg | 4,23 € | 2,71 € | 4,65 € | DPD |
| 18 kg (2 × 9 kg) | **neponúka sa** (limit Packety 15 kg) | 3,15 € (**iba odberné miesta, bez boxov**) | 7,63 € | DPD |

_(ceny FHB bez DPH = `COST`, iba na prehľad; potvrdené používateľom 21. 11. 2026: pri 18 kg DPD predvolené + SPS kuriér, Packeta nie)_
- **Boxy (`BOXES`):** pri 4 kg a 9 kg Packeta aj DPD vrátane boxov (Z-BOX, AlzaBox, DPD Pickup Box…). Pri 18 kg DPD **iba odberné miesta**: mapa DPD s `disableLockers=true`, záložný zoznam s `boxes=0`, validácia v dotazníku aj na serveri (`boxesAllowed`). Ak zákazník zmení balenie na 18 kg, vybraný box sa zruší.
- **Cena dopravy pre zákazníka:** zatiaľ 4,90 € pri všetkých (`PARAMS.shipping`). V `doprava-config.js` → `PRICE` sa dá nastaviť cena podľa dopravcu a balenia (null = `PARAMS.shipping`). Súhrn v dotazníku ju už berie podľa zvoleného dopravcu.
- Kód služby FHB je v `METHODS.fhbService`; prepísať sa dá aj env `FHB_SERVICE_PACKETA` / `FHB_SERVICE_DPD` / `FHB_SERVICE_SPS_COURIER`.

### Výber a overenie miesta
- **Packeta:** s `PACKETA_API_KEY` oficiálny widget (`Packeta.Widget.pick`, SK, výdajné miesta aj Z-BOXy) a pod ním odkaz „Vyhľadať v zozname“. Bez kľúča, alebo keď sa widget nenačíta, vyhľadávanie a zoznam nad FHB.
- **DPD:** naše okno s oficiálnou mapou DPD (iframe, `?lang=sk&countries=SK&enabledCountries=SK`, pri 18 kg `&disableLockers=true`) a prepínač „Zoznam“ (záloha nad FHB). Výsledok príde cez `postMessage` z `https://pickup-maps.dpd.sk` (`data.dpdWidget`: `id`, `name`, `type` parcelShop/locker, `location.address`).
- **Záložný zoznam:** `GET /api/delivery-points?service=packeta|dpd&q=…` (FHB `GET /delivery-point/<kód>`, cache 12 h, CDN 1 h, pri výpadku FHB stará cache; bez FHB kľúčov testovacie miesta `TEST-…`). Hľadá sa podľa mesta alebo PSČ bez diakritiky a výdajné miesta sú pred boxami.
- **Uloženie:** `addresses.carrier` (`packeta`/`dpd`/`sps`), `delivery_method`, `point_id` (= FHB `delivery_point`), `point_label`, plus snapshot v `orders.ship_to` (`point_address`).
- **Overenie na serveri pred Checkout Session (krok 4):** spôsob musí byť povolený pre balenie (`isMethodAllowed`), miesto musí byť v aktuálnom zozname FHB (`findPoint`) a pri balení bez boxov nesmie byť box (`boxesAllowed`). Mapa DPD má ~4 077 miest, FHB sandbox ~3 961; zhoda 3 951 (97 %). Miesto, ktoré FHB nepozná, server odmietne a zákazník vyberie iné.
- Dizajn okna podľa Granula Design System, mobil ako prvý (celá obrazovka), focus trap, Esc zatvorí okno aj z vyhľadávacieho poľa, fokus sa vráti na tlačidlo.
- Zákaznícky portál (P4): zmena výdajného miesta tým istým výberom; admin (P3): zobraziť a meniť (iba v stave `pending`).

### ⚠️ Otvorené
- **`dpd_sk` vs `dpd_eu_pudo`:** v sandboxe majú totožné miesta. Zatiaľ `dpd_sk` (jedno nastavenie `METHODS.dpd_pickup.fhbService` alebo env `FHB_SERVICE_DPD`), používateľ potvrdí s FHB.
- **Kód SPS kuriéra** od FHB.

## P2 — FHB integrácia (Kika API 3)

Dokumentácia: https://api.fhb.sk/v3/docs (OpenAPI: `GET https://api.fhb.sk/v3/openapi`)
Produkcia: `https://api.fhb.sk/v3` · Sandbox: ⚠️ docs uvádzajú `https://api-dev.fhb.sk/v3`, email FHB `https://api-stage.fhb.sk/v3` → **overiť u FHB**.

- **Auth:** `POST /login` `{ app_id, secret }` → `{ token, expiration }`. Hlavička `X-Authentication-Simple: base64(token)`. Token cachovať na serveri, pri expirácii / 401 znova login. Kľúče generované v ZOE (https://zoe2.fhb.sk), zvlášť sandbox a produkcia.
- **Klient** `lib/fhb/` (typovaný, testy s mockom): login, products, orders, parcel services, delivery points, history, rma, stock.
- **Produkty:** skript `scripts/fhb-sync-products.ts` → `POST /product` / `PUT /product` pre 15 produktov (najprv bežné, potom sady). Posiela `id`, `name`, `type`, `items` (sady) a `notify_url`.
  - **EAN sa nikdy neposiela ani neprepisuje.** FHB ho upraví podľa skutočného vrecka.
  - **`notify_url`** pri každom produkte = `https://granula.sk/api/fhb/stock-notify?t=<FHB_NOTIFY_TOKEN>` (skladové notifikácie: POST JSON `id, type, qty, stockQuantity, reason`, `serialNumbers[]`).
- **Príjem tovaru (stock receipt):** `POST/PUT/GET/DELETE /stock-receipt` v klientovi. Úprava a zmazanie sú možné iba v stave `created`. Položky sú iba bežné produkty (4 kg, 9 kg); sada 18 kg v príjemke byť nemôže (FHB vráti 400 „is multi product“). Prvý príjem tovaru pôjde cez príjemku.
- **Vytvorenie objednávky** (`POST /order`) po `paid`:
  - `id` = `orders.id`, `variable_symbol` = `orders.number` (iba číslice, ≤ 10, unikátne),
  - `parcel_service` = kód SPS / Packeta (z `GET /parcel-service`), `delivery_point` = Packeta box,
  - `recipient.address` {name, street, city, zip, country `SK`}, `recipient.contact` {email ≤ 50 znakov, phone v medzinárodnom formáte} — **obe povinné**,
  - `items` [{id: SKU, quantity}], `value` = suma objednávky (poistenie), `cod` = 0, `validate: true`,
  - `notification` = URL pre `confirmed` / `sent` / `delivered` / `returned`: `https://granula.sk/api/fhb/notify/<typ>/<order_id>?t=<tajný token>`,
  - `invoice` = odkaz na PDF faktúry (Stripe hosted invoice PDF), ak dostupné.
  - Chyba 400 → `status = fhb_error`, `fhb_error` = `violations` → úloha v admine. Opakovanie bezpečné (FHB `id` = naše id).
- **Úpravy / storno:** `PUT` a `DELETE /order` iba v stave `pending`. Portál aj admin musia vedieť, či objednávka je ešte upraviteľná.
- **Notifikácie:** formát (metóda, telo, podpis) **nie je zdokumentovaný** → ⚠️ opýtať sa FHB. Do implementácie: notifikácii neveriť, iba ju zalogovať do `fhb_events` a stav overiť cez `GET /order?id=`.
- **Cron (Vercel Cron), denne + každú hodinu počas dňa:** `GET /order/history` (stavy, tracking, `delivered_at`), `GET /rma/list` (vrátené zásielky), `GET /stock/all` (sklad).
- Pri `sent` → tracking do DB + email (P5). Pri `delivered` → `delivered_at`, prepočet prvého obnovenia (§1).
- **Sklad:** upozornenie na nízky stav = spotreba za 4–5 týždňov (dodávateľ má lead time min. 3 týždne) → email + admin.
  - Počíta sa z **`free_quantity`** (voľné, nerezervované kusy) z `GET /product` / `GET /product/all`, **nie** zo `stock_quantity`. `/stock/all` a skladová notifikácia majú iba celkový stav; notifikácia slúži ako podnet na prečítanie `free_quantity`.
  - Sledujú sa iba bežné produkty (4 kg, 9 kg). Dostupnosť sady 18 kg = `free_quantity` zložky 9 kg / 2.
- Stavy FHB: `pending → confirmed → sent → delivered`, `rejected`, vrátené (`returned_at`, `return_type`).

---

## P3 — Admin portál (`manazer.granula.sk`)

Samostatná Next.js appka v `admin/`, druhý Vercel projekt (Root Directory = `admin`), zdieľa `lib/` (engine, stripe, fhb, db).
Prihlásenie: Supabase Auth, iba emaily s rolou admin, 2FA. Všetky akcie na serveri, zapisujú do `audit_log`.

Obrazovky:
1. **Prehľad dňa** — zaplatené / odoslané do FHB / chyby FHB / nezaplatené / odstúpenia na riešenie / sklad.
2. **Objednávky** — filter podľa stavu, detail (položky, adresa, stav FHB, tracking, platba), akcie: znova odoslať do FHB, upraviť adresu (iba `pending`), stornovať (iba `pending`), refund (Stripe).
3. **Predplatné** — zoznam (stav, ďalšia platba, ďalšia expedícia, D, cena), detail zákazníka + psa + histórie, akcie: posunúť, preskočiť, pauza/obnoviť, zmeniť receptúru/balenie/váhu (prepočet engine), zrušiť.
4. **Neúspešné platby** — past_due, stav opakovania.
5. **Vrátené zásielky** (`/rma/list`) — refund alebo opätovné odoslanie.
6. **Odstúpenia od zmluvy** — lehoty, stav vrátenia, refund do 14 dní.
7. **Sklad** — stav po SKU, spotreba, upozornenia.
8. **Kontrola výpočtu** — presunúť sem `admin-vypocet.html`.

---

## P4 — Zákaznícky portál (`granula.sk/ucet`) + odstúpenie od zmluvy

- Prihlásenie: Supabase magic link na email (bez hesla). Po zaplatení zákazník dostane odkaz do účtu.
- Akcie (všetky cez `/api/ucet/*`, kontrola vlastníctva na serveri):
  - posunúť ďalšiu dodávku skôr/neskôr, preskočiť,
  - pozastaviť / obnoviť,
  - aktualizovať váhu / vek psa → prepočet dávky, D, ceny (zobraziť pred potvrdením),
  - zmeniť balenie, receptúru (iba z vhodných podľa engine), adresu, Packeta box,
  - zmena karty a faktúry → Stripe Customer Portal (session),
  - **zrušiť predplatné** (ku koncu obdobia, krátky dôvod),
  - objednávka v stave `pending` vo FHB → povoliť úpravu; inak „už sa balí“.
- **Odstúpenie od zmluvy** (§ 20a zák. 108/2024 Z. z., od 19. 6. 2026) — ⚠️ **musí byť hotové pred spustením predaja**:
  - **Verejná stránka `granula.sk/odstupenie` bez prihlásenia** + rovnaké tlačidlo v `/ucet` pri každej objednávke (predvyplnené).
  - Označenie: **„Odstúpiť od zmluvy tu“**, výrazné tlačidlo; odkaz v pätičke (nie splývajúci text) a v potvrdzovacích emailoch.
  - Dva kroky: formulár (meno, email, číslo objednávky/predplatného, voliteľne dôvod) → samostatné **„Potvrdiť odstúpenie“**.
  - Okamžité potvrdenie emailom s obsahom odstúpenia a **dátumom a časom prijatia** (čas servera).
  - Lehota pri opakovanej dodávke plynie od prevzatia **prvého** tovaru (`delivered_at` z FHB).
  - Po potvrdení: záznam `withdrawals`, zrušiť predplatné, ak je objednávka vo FHB `pending` → `DELETE /order`, úloha v admine.
  - Odlíšiť od „Zrušiť predplatné“ (to je bez refundu, kedykoľvek).
  - Obchodné podmienky + poučenie o odstúpení: doplniť odkaz na online funkciu. ⚠️ Právnik: výnimka pre otvorené vrece (hygiena).

---

## P5 — Transakčné emaily

Resend ako vo FanpageKit (`lib/email.ts`, idempotency key = event id). Odosielateľ na overenej doméne `granula.sk`.
Marketing ostáva v Klaviyo (iba udalosti: objednávka, zrušenie).

- Potvrdenie objednávky (+ odkaz do účtu, odkaz „Odstúpiť od zmluvy tu“).
- Zásielka odoslaná + tracking.
- Pripomienka pred obnovením (napr. 3 dni pred platbou: „posunúť / preskočiť“).
- Neúspešná platba.
- Potvrdenie odstúpenia od zmluvy.
- Potvrdenie zrušenia / pauzy.
- Admin: chyba FHB, nízky sklad.

---

## P6 — Spustenie

0. **Premazať testovacie dáta** (Supabase objednávky/zákazníci/predplatné z testov na granula.sk, Stripe test objekty, FHB sandbox) a **prepnúť Production env na live kľúče** (Stripe live, FHB produkcia); potom `CHECKOUT_ENABLED=true`.
1. End-to-end v test mode + FHB sandbox (Stripe test clocks): prvá objednávka → FHB → odoslanie → doručenie → obnovenie; posun; preskočenie; zmena váhy; zlyhaná karta; storno v `pending`; odstúpenie; vrátená zásielka; refund.
2. Potvrdiť FHB úspešný test (kontrola v ich testovacom portáli) → produkčné kľúče FHB.
3. Stripe live: aktivovaný účet Spark Link s. r. o., statement descriptor, live webhook endpoint + secret, Billing nastavenia.
4. Produkty vo FHB produkcii (10 SKU), príjemka skladu.
5. Právne texty (VOP, reklamačný poriadok, ochrana súkromia sú dnes lorem ipsum + `noindex`) → finálne, odstrániť `noindex`.
6. DNS `manazer.granula.sk`.

---

## P7 — Dáta z dotazníka a analytika (PostHog)
Cieľ: ukladať všetky odpovede z dotazníka (aj keď zákazník nezaplatí) a merať celý funnel od návštevy po platbu.

Všetky odpovede z dotazníka
- Nová tabuľka quiz_sessions: id (anonymné, z prehliadača), started_at, updated_at, last_step, completed (bool), answers (jsonb), result (recept, balenie, gramy, D, cena z engine), utm/source, email a customer_id (iba ak ich zákazník neskôr zadá), checkout_started_at, order_id.
- Ukladá sa priebežne po každom kroku (POST /api/quiz), bez emailu je záznam anonymný. Pri checkoute sa session spáruje so zákazníkom a objednávkou.
- GDPR: anonymné odpovede bez emailu možno držať dlhodobo na štatistiku. Nedokončené nákupy s emailom (customers bez objednávky) mazať alebo anonymizovať po 90 dňoch (cron). Uviesť v zásadách ochrany súkromia.
- Opustený košík: udalosť do Klaviyo „Started Checkout“ (pes, recept, cena, odkaz späť na výsledok), iba so súhlasom s marketingom.

PostHog (celý funnel)
- PostHog US cloud (us.i.posthog.com, NEXT_PUBLIC_POSTHOG_KEY a NEXT_PUBLIC_POSTHOG_HOST sú v env). V zásadách ochrany súkromia uviesť prenos do USA (PostHog Inc., EÚ–USA Data Privacy Framework).
- Načítať iba po súhlase s analytickými cookies (cookies.js). Bez súhlasu nič, alebo cookieless režim bez osobných údajov.
- Udalosti: page_view, quiz_started, quiz_step_completed (krok, odpoveď bez osobných údajov), quiz_completed (recept, balenie, cena), plan_selected, delivery_selected (dopravca), checkout_started, payment_submitted, payment_failed, order_completed (server-side z webhooku: suma, plán, recept, dopravca, nový/opakovaný), subscription_renewed, subscription_cancelled, withdrawal_submitted.
- Identifikácia: anonymné id → po zadaní emailu identify (customer_id, nie email v properties, ak to nie je nutné). UTM a referrer ako person/session properties.
- Dashboard v PostHogu: funnel návšteva → štart dotazníka → dokončenie → checkout → platba; odchody po krokoch; konverzia podľa zdroja (Meta kampane), receptu, balenia a dopravcu; retencia predplatného.
- Session replay iba so súhlasom a s maskovaním všetkých polí formulára.

---

## 7. Blokery mimo kódu (vybaviť hneď)

- [ ] FHB: sandbox `app_id` + `secret` (ZOE), správna sandbox URL, formát notifikácií, kódy SPS a Packeta.
- [x] Supabase: projekt `granula` (eu-central-1), migrácie P0 aplikované.
- [ ] Stripe: test kľúče, webhook secret; pre live aktivácia účtu na Spark Link s. r. o.
- [ ] Packeta: API kľúč pre widget výdajných miest (a povolené krajiny v klientskej sekcii).
- [ ] SPS / FHB: má SPS oficiálny widget ParcelShopov? Akú formu kódu miesta čaká FHB pre SPS a pre Packetu?
- [ ] Resend: overenie domény granula.sk.
- [ ] Účtovníčka: faktúry, neplatiteľ DPH vs. ceny s DPH v engine.
- [ ] Právnik: VOP, poučenie o odstúpení, výnimka pre otvorené vrece.
- [ ] Zvážiť prepnutie repa na privátne.

---

## 8. Env premenné

```
NEXT_PUBLIC_SITE_URL=
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
STRIPE_SECRET_KEY=
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=
STRIPE_WEBHOOK_SECRET=
FHB_API_URL=
FHB_APP_ID=
FHB_SECRET=
FHB_NOTIFY_TOKEN=
FHB_SERVICE_PACKETA=
FHB_SERVICE_DPD=
FHB_SERVICE_SPS_COURIER=
FHB_VALIDATE_ADDRESS=
PACKETA_API_KEY=
RESEND_API_KEY=
EMAIL_FROM=
EMAIL_REPLY_TO=
CRON_SECRET=
CHECKOUT_ENABLED=
CHECKOUT_TEST_TOKEN=
```

---

## 9. Otvorené otázky

- Sandbox URL a formát notifikácií FHB.
- DPH: ceny s DPH v engine vs. neplatiteľ.
- Výnimka z odstúpenia pre otvorené vrece.
- CZ doručovanie (FHB `cod`/mena — teraz iba SK, platba kartou).
- Ďalší projekt, na ktorý si Andrej nespomenul (kandidáti: transakčné emaily = P5, faktúry/účtovníctvo, právne texty, Packeta widget, SPS pop-up = P1b).

---

## 10. Rozhodnutia počas práce (odchýlky od pôvodnej SPEC)

Každá položka čaká na potvrdenie, kým nie je označená ✅.

**Projekt 1, krok 1 (P0), 21. 11. 2026**
1. **`addresses`:** namiesto `packeta_point_id` / `packeta_point_label` sú stĺpce `delivery_method` (`packeta_point` | `sps_parcelshop` | `sps_courier`), `point_id`, `point_label`. Dôvod: SPS ParcelShop (P1b) má tiež výdajné miesto a jeho kód musí ísť do FHB `delivery_point`. Check constraints: spôsob ↔ dopravca, výdajné miesto povinné okrem kuriéra, kuriér musí mať adresu.
2. **`orders.fhb_error` je `jsonb`**, nie text: chyby FHB 400 sa ukladajú ako štruktúra `violations` (PROJEKT-1, krok 2).
3. **Doplnené stĺpce a obmedzenia:** `updated_at` (customers, dogs, subscriptions, orders, trigger), unikátny email zákazníka bez ohľadu na veľkosť písmen, `orders.number` 1–9 999 999 999, `kind = one_off` ⇔ `subscription_id is null`, `subscriptions.plan` iba `mesiac`.
4. **RLS bez policies:** všetko ide zo servera cez service role; anon/authenticated nemajú policies ani granty. Policies pre `/ucet` sa pridajú v P4, ak budú treba.
5. **Engine:** nový parameter `PARAMS.shipDays = 3` (SHIP_DAYS). `bags[].nextDay = max(1, D − LEAD + SHIP_DAYS)` = deň **od doručenia** vreca, keď príde ďalšie (platba ide v deň D − LEAD). Text v súhrne objednávky: „Ďalšie vrece pošleme tak, aby prišlo asi 4 dni predtým, ako sa minie“ (LEAD − SHIP_DAYS), predtým „pošleme 3 dni predtým“.
6. **Routing:** pravidlá vo `lib/site-routes.ts` (next.config.ts). Koncovú lomku Next pri pravidlách ignoruje, preto `/blog` → `/blog/`, `/admin-blog` → `/admin-blog/` a 404 pre `/stranka/` rieši `proxy.ts`. `experimental.caseSensitiveRoutes` (ako Vercel; na Verceli sa pri presmerovaniach neuplatní, `/SUROVINY` → `/#suroviny`, neškodné). Navyše hlavička `X-Robots-Tag: noindex` pre `/admin-vypocet`, `/admin-blog/*`, `/blog/nahlad/*`.
7. **`public/granula/README.md`** (interná dokumentácia webu) ostal v `public/` a je verejne dostupný na `/README.md` ⚠️ presunúť mimo `public/`?
9. **Testovanie na produkcii + prepínač predaja** (zadanie od používateľa, 21. 11.): `CHECKOUT_ENABLED` + `?test=<CHECKOUT_TEST_TOKEN>`, `GET /api/checkout/status`, token sa z URL odstráni a drží v `sessionStorage` záložky, na server ide v hlavičke `X-Checkout-Test`. Výklad: `CHECKOUT_ENABLED=true` otvorí predaj pre všetkých (spustenie), token slúži na testovanie pred spustením.
10. **FHB (krok 2, overené v sandboxe api-stage 21. 11.):**
    - **Sandbox URL:** `https://api-stage.fhb.sk/v3` funguje. Docs uvádzajú `api-dev`, to však presmeruje (302).
    - **Kódy služieb (sandbox, 21. 11.):** Packeta `zasielkovna_sk` (3 857 miest SK, kód miesta = číslo Packety), DPD `dpd_sk` (= `dpd_eu_pudo`, 3 961 miest SK, kód `SK…`), SPS výdajné miesta `sps_pudo` (nepoužívame). `delivery_point` = `external_code` miesta, číselné interné `id` FHB odmietne (`DELIVERY_POINT_DOES_NOT_EXISTS`). Testovacie objednávky cez Packetu aj DPD FHB prijal. Kód SPS kuriéra zatiaľ nie je známy (`GET /parcel-service` je v sandboxe prázdny).
    - **`validate`:** SPEC hovorí `validate: true`. Sandbox však odmieta každú adresu („Failed to validate address“). Preto `validate` platí iba pri kuriérovi a dá sa vypnúť cez `FHB_VALIDATE_ADDRESS=false`. Pri výdajnom mieste sa adresa nekontroluje.
    - **Adresa pri výdajnom mieste:** FHB vyžaduje `recipient.address` aj pri výdajnom mieste. Ak zákazník adresu nezadá, pošle sa adresa výdajného miesta (`ship_to.point_address`).
    - **Názvy produktov vo FHB:** „Granula! <receptúra> <kg> kg“.
11. **Doprava v checkoute (krok 3, 21. 11.):** prepracované podľa zadania používateľa, pozri sekciu **P1b**. Pôvodný návrh s SPS výdajnými miestami (`sps_pudo`), vlastným pop-upom a mapou Leaflet bol nahradený. Zmeny voči pôvodnej SPEC:
    - SPS iba kuriér; pribudlo DPD (oficiálna mapa bez zmluvy, kód `dpd_sk`); Packeta má zálohu (zoznam nad FHB `zasielkovna_sk`), kým nie je `PACKETA_API_KEY`, a aj potom, ak sa widget nenačíta.
    - Pravidlá a ceny podľa balenia sú v jednom súbore `public/granula/doprava-config.js`. Packeta sa pri 18 kg neponúka. Pri 18 kg platí tabuľka (DPD predvolené, iba odberné miesta, + SPS kuriér). ✅ Potvrdené 21. 11.
    - `addresses`: `carrier` ∈ `packeta`/`dpd`/`sps`, `delivery_method` ∈ `packeta_point`/`dpd_pickup`/`sps_courier` (migrácia `p1b_carriers_dpd`).
    - Pôvodný formulár ostáva pri zatvorenom predaji bez zmeny; platobné polia sa odstránia v kroku 4.
12. **Checkout a predplatné (krok 4, 21. 11.):**
    - **`ui_mode: 'embedded_page'`** (Stripe API `2026-08-26.dahlia`, SDK `stripe@22` ako FanpageKit; zadanie hovorí `embedded`, je to nový názov). V prehliadači `https://js.stripe.com/dahlia/stripe.js` a `createEmbeddedCheckoutPage`.
    - **Stripe zákazník** sa vytvorí už v `POST /api/checkout` (jeden na e-mail, `customers.stripe_customer_id`) a Session dostane `customer`. Preto sa pri jednorazovom nákupe nepoužije `customer_creation: always` (Stripe ho s `customer` nedovolí). `invoice_creation` a `setup_future_usage: off_session` ostávajú.
    - **Stripe Products** so stabilným ID: `granula-<SKU>` (recept × balenie, 18 kg = `granula-GRAN-<receptúra>-18`) a `granula-doprava`; založia sa pri prvom použití. Cena je v `price_data` (zo servera).
    - **Doprava** je druhá položka (pri predplatnom opakovaná s rovnakým intervalom D). Cena podľa dopravcu a balenia z `doprava-config.js` (zatiaľ 4,90 €).
    - **Návratová URL** = pôvod požiadavky (`/granule-na-mieru?session_id=…#hotovo`), takže preview ostane na preview. Stránka „Hotovo“ číta `GET /api/checkout/session` a nič nezakladá.
    - **Draft** pri `POST /api/checkout`: zákazník (podľa e-mailu), pes (`answers` po validácii, `birth_date` odhadnutý z veku na prepočet pri obnovení), adresa (pri výdajnom mieste ulica/PSČ/mesto = adresa miesta, do FHB `recipient.address`). Predplatné a objednávka vznikajú iba vo webhooku.
    - **Čas platby:** obnovenia o 06:00 UTC (7:00/8:00 SK), aby objednávka do FHB prišla ráno.
    - **Prepočet D pri obnovení** (šteňatá): vek k dátumu platby z `birth_date`, engine s predvolenými PARAMS. Pri zmene D jeden `changePlan` a ďalšia platba = dnešná platba + D_nové (nové vrece sa začne používať o LEAD dní a vydrží D_nové). Hmotnosť (`kg`) sa nemení, nové vstupy príjme portál P4.
    - **Webhook a FHB:** chyba odoslania do FHB webhook neprerušuje (objednávka ostane `paid`/`fhb_error`, zopakuje cron v kroku 5 alebo admin). Chýbajúci draft alebo chyba DB → 500 (Stripe zopakuje).
    - **Stripe webhook eventy** (nastaviť v Stripe → Developers → Webhooks, endpoint `https://granula.sk/api/stripe/webhook`): `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `invoice.paid`, `invoice.payment_failed`, `customer.subscription.updated`, `customer.subscription.deleted`.
    - **DPH:** ✅ firma nie je platiteľ → ceny sú konečné, „s DPH“ sa nikde neuvádza (sekcia P1).
    - **Stripe API verzia:** `2026-08-26.dahlia` (SDK `stripe` presne `22.6.2`, nastavená v `lib/stripe.ts`). Webhook endpoint v Stripe má mať rovnakú verziu.
13. **Test kroku 4 (21. 11.):**
    - **FHB `order.id` = `GR-000123`** (`fhbOrderId(orders.number)`, rovnaké číslo ako na stránke Hotovo a v emaile, dá sa podľa neho hľadať vo FHB portáli). FHB má limit **30 znakov** (sandbox `TOO_LONG_ERROR`, OpenAPI ho neuvádza); UUID (36) nevyhovuje, prechodne bol base36 UUID. ✅ návrh používateľa 21. 11. **Sekvencia `orders.number` sa nikdy nesmie resetovať** (ani pri premazaní testovacích dát). Poistka: ak POST zlyhá a vo FHB už objednávka s týmto id je, za odoslanú sa berie iba pri zhode obsahu (VS, e-mail, položky), inak `fhb_error` `ID_COLLISION`. Notifikačné URL ostávajú s naším UUID.
    - **EAN:** zatiaľ nemáme; pole `ean` sa pri produktoch vo FHB nevypĺňa, identifikátor je SKU. Pred spustením vyriešiť čiarový kód (PROGRESS).
    - **Doména:** `granula.sk` presmeruje 308 na `www.granula.sk`; Stripe ani FHB presmerovania nesledujú. Webhooky a notifikačné URL musia ísť na `https://www.granula.sk/...` (`NEXT_PUBLIC_SITE_URL=https://www.granula.sk`). Stripe test webhook prepnutý na www, `notify_url` produktov vo FHB sandboxe tiež.
    - **`invoice.paid` (obnovenie) bez predplatného v DB:** vždy varovanie v konzole + `audit_log` (`stripe.invoice_paid.subscription_missing` / `…subscription_pending`, entity `stripe_invoice`, id faktúry a predplatného, suma). Bez draftu z checkoutu (`metadata.customer_id`) → 200; s draftom → 500 (checkout ešte nespracovaný, Stripe zopakuje).
    - **Stripe webhook eventy:** k šiestim vyššie aj `checkout.session.async_payment_failed` (endpoint má 7; kód ho zatiaľ nespracúva, odpovie 200).
14. **Krok 5: FHB stavy a emaily (21. 11.).** 23. 11. používateľ potvrdil ✅: potvrdenie aj pri obnovení, `ADMIN_EMAIL`, odkaz na `/odstupenie` v emaile, `crons` vo `vercel.json`. Crony: pred spustením predaja prechod na **Vercel Pro** (Hobby nie je na komerčné použitie) a `fhb-orders` každú hodinu (PROGRESS, Pred spustením predaja). Doplnené 23. 11.: každý beh cronu sa zapíše do `fhb_events` (`cron.<úloha>`, výsledok alebo chyba); testovacia route `POST /api/test/email-preview` (hlavička `x-checkout-test`, iba Stripe test mode, príjemca iba `ADMIN_EMAIL` alebo existujúci zákazník, predmet „[TEST]“, nezapisuje do `email_log`) → **pred spustením zmazať**.
    - **Stavy:** `lib/fhb/sync.ts` `applyFhbOrder` (spoločné pre notifikácie a cron). FHB `pending`/`new`/`imported` → `sent_to_fhb`, iný spracovávaný stav (`confirmed`, `packed`…) → `confirmed`, `sent`/`shipped_at` → `sent`, `delivered`/`delivered_at` → `delivered`, `returned_at` → `returned`, `rejected` → `fhb_error`. Iba dopredu; `cancelled`/`refunded` sa nemenia. Tracking = `{ numbers: tracking_numbers, links: tracking_links }`. Každá zmena stavu → `audit_log` `order.status.<stav>`.
    - **Doručenie:** `last_delivered_at`; pri objednávke `first` prepočet prvého obnovenia od skutočného `delivered_at` (`recomputeOnDelivery`: iba ak > 1 deň rozdiel a v budúcnosti) → Stripe `trial_end` + `next_charge_at` + audit.
    - **Notifikácie FHB:** `/api/fhb/notify/<typ>/<orders.id>?t=` prijme GET aj POST s ľubovoľným telom, celé ho uloží do `fhb_events` (`notify.<typ>`), stav overí cez `GET /order` (id `GR-…`). 401 zlý token, 404 neznámy typ/objednávka, inak 200. `/api/fhb/stock-notify?t=` → `fhb_events` (`stock`) + kontrola skladu produktu.
    - **Cron (Vercel Cron vo `vercel.json`, iba denne, aby nasadenie prešlo aj na pláne Hobby; SPEC P2 chce aj hodinový → vyžaduje Pro):** `fhb-orders` 18:17 UTC (znova odoslať `paid` staršie ako 5 min + `GET /order/history` od najstaršej otvorenej objednávky, max. 60 dní; FHB filtruje podľa dátumu vytvorenia), `fhb-rma` 05:37 UTC (`GET /rma/list` 60 dní → `returned` + upozornenie), `fhb-stock` 06:47 UTC. Autorizácia `Authorization: Bearer CRON_SECRET` (bez neho 503).
    - **Sklad:** nízky = `free_quantity` < spotreba aktívnych a `past_due` predplatných × 35 dní (18 kg = 2 × 9 kg; iba bežné SKU). Upozornenie raz denne (email `ADMIN_EMAIL` + `audit_log` `stock.low` na SKU a deň).
    - **Emaily (Resend):** `lib/email.ts` (odosielanie, `email_log` s unikátnym kľúčom + Idempotency-Key) a `lib/emails.ts` (šablóny). Potvrdenie objednávky pri `first`, `one_off` **aj `renewal`** (zároveň potvrdenie platby) s výrazným odkazom **„Odstúpiť od zmluvy tu“** → `/odstupenie?objednavka=<číslo>` (stránka príde v P4, pred spustením predaja); zásielka odoslaná s trackingom (iba pri prechode na `sent`); neúspešná platba s odkazom na faktúru Stripe (zaplatiť aj inou kartou). Bez `RESEND_API_KEY` sa email iba zaloguje (`skipped`), nikdy nehodí chybu (odchýlka od FanpageKit, kde v produkcii hodí). Chyba emailu webhook neprerušuje → `audit_log` `email.failed`.
    - **Interné upozornenia** na nový `ADMIN_EMAIL`: chyba FHB (`fhb_error`), vrátená zásielka, nízky sklad.
    - **Nová tabuľka `email_log`** (migrácia `p5_email_log`): key (PK), kind, to_email, order_id, status `sent`/`skipped`, provider_id, sent_at.
15. **Emaily podľa návrhu (23. 11.):** HTML šablóny od používateľa v `content/emails/*.html` (premenné `{{…}}`), do kódu cez `npm run emails` → `lib/email-templates.ts` (test stráži aktuálnosť). Obrázky `public/granula/img/email/` = `https://www.granula.sk/img/email/`: fotky vriec z návrhu, logo vyrenderované z dodaného SVG do PNG 600 × 133 (Gmail/Outlook SVG nezobrazia), zdroj `content/emails/logo-granula.svg`. Úpravy oproti návrhu (✅ potvrdené používateľom 23. 11.):
    - email 4: doba doručenia podľa dopravcu v pracovných dňoch, zámerne dlhšia („radšej dlhšie ako kratšie“): `METHODS.etaEmail` v `doprava-config.js` = Packeta 2 – 4, DPD 2 – 4, SPS 1 – 3 (dotazník ostáva `eta` 2–3 / 1–2); pri kuriérovi namiesto „Keď budú pripravené na vyzdvihnutie…“ veta „V deň doručenia ti kuriér dá vedieť SMS alebo e-mailom.“; blok „Prvé vrece?“ pri `first` aj `one_off` (prvý nákup), pri obnovení nie,
    - email 2: „zmenila {{dog_poss}} váha“ (jeho/jej podľa pohlavia psa) namiesto pevného „jeho“,
    - email 5: veta „Platbu skúsime znova …“ iba ak Stripe naplánoval ďalší pokus (`next_payment_attempt`),
    - **pády mena psa sa neukladajú**, počítajú sa heuristikou (`lib/dog-name.ts`: Bodka → Bodku/Bodke, Rex → Rexa/Rexovi, Lucky → Luckyho, Daisy nesklonné); kde si nie je istá (viac slov, Šmolek…), použije „tvojho psa / tvojmu psovi“ (fenka „tvoju fenku / tvojej fenke“),
    - id receptúry → fotka: `hovadzie` → `hovadzie-ryza`, `jahna` → `jahna-bataty-cucoriedky`, ostatné rovnaké,
    - rozpis ceny zo Stripe (`metadata.ship_cents` pri checkoute, riadok dopravy na faktúre pri obnovení/neúspešnej platbe),
    - interné upozornenia ostávajú v jednoduchej podobe (logo + text).
    - Odkazy: „Môj účet“ / „Upraviť predplatné“ / „Prejsť na predplatné“ / „zmeň kartu“ → `/ucet` (P4, zatiaľ neexistuje), VOP `/obchodne-podmienky`, reklamácie `/reklamacny-poriadok`, „Odstúpiť od zmluvy tu“ `/odstupenie?objednavka=<číslo>` v pätičke (podľa návrhu: výrazné tlačidlo vyžaduje zákon na webe a v účte, nie v emaile).
16. **Pripomienka pred platbou (23. 11., na žiadosť používateľa; SPEC P5):** denný cron `/api/cron/reminders` 07:07 UTC; aktívne predplatné s platbou o 24–72 h a staršie ako 4 dni (nie hneď po kúpe) → email `6-pripomienka-platby` (odvodený zo šablóny 5 návrhu: dátum a suma platby, „Nemusíš nič robiť“, posunúť/preskočiť/upraviť v účte alebo odpísať na email, rozpis ceny, adresa doručenia na kontrolu). Kľúč `renewal-reminder:<predplatné>:<deň platby>`: nepošle sa dvakrát, po posune dátumu príde nová. Pri behu o 07:07 UTC príde 3 dni pred platbou (06:00 UTC); ak cron deň vynechá, príde o deň neskôr. ⚠️ text na potvrdenie.
17. **Vlastný platobný formulár (23. 11., zadanie používateľa po teste 1):** namiesto Embedded Checkout Checkout Session s `ui_mode: 'elements'` (v API `dahlia` nový názov pre „custom“) a v prehliadači `stripe.initCheckoutElementsSdk` → Express Checkout Element (Apple Pay / Google Pay) + Payment Element (karta) v pôvodnom rozložení sekcie Platba (peňaženky, „alebo“, karta), štýl cez Appearance API (rám 2 px Noc, Mlieko light, Montserrat, Kobalt pri fokuse). Session: `payment_method_types: ['card', 'link']` (bez lokálnych metód; Apple/Google Pay idú ako karta), `locale: 'sk'`. **Link povolený (používateľ 23. 11.)** ako tlačidlo „Plaťte bezpečne pomocou link“ v Express Checkout Element; vo formulári karty je Link vypnutý (`wallets.link: 'never'`), inak Payment Element pridá zaškrtnuté „Uložiť údaje pre rýchlejšiu platbu“ s e-mailom a povinným telefónom (s predvoľbou podľa IP), čo blokuje platbu a pýta údaje, ktoré už máme. Payment Element: `fields.billingDetails` všetko `never` (meno, e-mail, telefón z kroku doručenia; zákazník je na Session), `terms.card: 'never'` (vlastný súhlas s opakovanou platbou pod tlačidlom), fakturačná adresa pri potvrdení `country: 'SK'` (+ ulica/PSČ/mesto pri kuriérovi). Tlačidlo „Pokračovať k platbe“ pripraví Session, potom „Zaplatiť X €“ → `actions.confirm()` (3D Secure v okne Stripe) → `return_url` → Hotovo. Ceny, metadata, webhooky a objednávky bez zmeny. Doména `www.granula.sk` zaregistrovaná v Stripe (payment method domain, test mode) pre Apple Pay; **pri live režime zaregistrovať aj v live**.
18. **Klaviyo pop-up (23. 11.):** automatický pop-up „Email Popup“ (YcSYzw) sa na webe skryje (`cookies.js` hidePopups: POPUP/FLYOUT/FULLSCREEN dialógy Klaviyo → `display:none`, odomknutie scrollovania `klaviyo-prevent-body-scrolling`); tlačidlá „Chcem byť prvý →“ vedú na formulár v sekcii `/#zapis` (Rezervacia, RuSXNc), ktorý ostáva. Text „spúšťame 20. novembra“ je v nastavení oboch formulárov v Klaviyo → opraviť v Klaviyo (a pop-up tam vypnúť).
19. **Povinné polia v checkoute (23. 11.):** pri otvorenom predaji hviezdička pri e-maile, telefóne, mene, priezvisku a (pri kuriérovi) ulici, PSČ a meste + poznámka „Polia označené * sú povinné.“ (`.co-req`, `aria-required`); pri zatvorenom predaji (predregistrácia) bez zmeny. Polia karty sú povinné vždy (Stripe).
20. **Ceny vriec na stránke výsledku (23. 11., zadanie používateľa):** karty „Vyber veľkosť vreca“ ukazujú cenu s predplatným (cena × (1 − `PARAMS.plans.mesiac`), napr. 9 kg 67,50 € namiesto 75,00 €), rovnako ako „na deň s predplatným“ pod nimi a cena v kroku platby. Jednorazová cena je v kroku platby pri voľbe „Jednorazovo“. Iba zobrazenie; cenu účtuje server.
21. **Platba ako samostatná stránka (23. 11., zadanie používateľa):** pri otvorenom predaji stránka doručenia („Ešte krok. Doručenie.“) nemá sekciu Platba, pod formulárom je tlačidlo „Pokračovať k platbe →“ (bočné ostáva, na mobile sa skryje, aby neboli dve pod sebou). Po overení doručenia server pripraví Checkout Session a otvorí sa obrazovka `#platba` („Posledný krok. Platba.“): rekapitulácia kontaktu a doručenia so „Zmeniť“, platobný formulár (Link / Apple Pay / Google Pay, alebo, karta; pevná výška počas načítania), súhrn a „Zaplatiť X €“ so súhlasom s opakovanou platbou. „Späť na doručenie“ bez zmeny použije tú istú Session; zmena doručenia, plánu alebo balenia ju zruší. `#platba` bez pripravenej platby (napr. po obnovení stránky) presmeruje na doručenie. Predregistrácia bez zmeny.
22. **Karty dopravcov v checkoute (23. 11., zadanie používateľa):** pri zvolenej Packete alebo DPD je v karte oranžové tlačidlo „Vybrať výdajné miesto alebo Z-BOX →“ / „Vybrať odberné miesto alebo box →“; vybrané miesto sa ukáže pod kartou s odkazom „Zmeniť výdajné miesto“. Adresné polia kuriéra (ulica a číslo, PSČ, mesto) sú priamo pod kartou „SPS – kuriér na adresu“ (formulár ide zhora nadol) s nápovedou „Doručujeme na Slovensko. Číslo bytu alebo poschodie napíš k ulici.“ Ďalšie polia nepridávame: FHB adresa má iba meno, ulicu, mesto, PSČ, krajinu (+ provinciu), bez druhého riadku a firmy; poznámka objednávky (`note`) ide iba skladu, nie dopravcovi; krajina je vždy SK. Pri výdajnom mieste stačí meno, e-mail, telefón a miesto (adresu FHB doplní z miesta).
23. **Dotazník a doručenie (23. 11., zadanie používateľa):** pri alergiách je „Na nič nie je alergický“ prvá a najvýraznejšia voľba (celá šírka, väčšia), pod ňou „alebo označ, na čo je alergický:“ a suroviny. V doručení nie je nič predvolené (predtým `defaultFor`): kým zákazník nevyberie dopravcu, súhrn ukazuje „od 4,90 €“ a „Spolu od …“, odoslanie bez výberu hlási „Vyber spôsob doručenia.“ Karty Packeta, DPD a SPS majú logo dopravcu (`public/granula/img/dopravcovia/`, na počítači vľavo od názvu, na mobile nad názvom).
24. **Cenník dopravy (23. 11., zadanie používateľa):** cena závisí od balenia, spôsobu a plánu (`PRICE` v `doprava-config.js`, `{ raz, mesiac }`). Jednorazovo: výdajné miesto 4 kg 3,90 € (Packeta alebo DPD), 9 kg 3,90 € (iba DPD), 18 kg 4,90 € (iba DPD); SPS kuriér 4,90 / 5,90 / 9,90 €. Predplatné: výdajné miesto zadarmo; SPS kuriér 1,90 / 1,90 / 3,90 €. **Packeta sa pri 9 kg už neponúka** (tabuľka „iba DPD“; FHB Packeta 9 kg 4,23 € vs. DPD 2,71 €). Doprava zadarmo = v Stripe bez riadku dopravy (Checkout aj zmena plánu); v dotazníku a emailoch „zadarmo“. Existujúce predplatné si v Stripe nechávajú pôvodnú cenu dopravy (iba testovacie).
8. **Receptúra v checkoute:** server prijme akúkoľvek receptúru z `PRODUCTS`, rovnako ako dnešné UI (menej vhodné len označí). V snapshote sa ukladá `eligible`. Pre `/ucet` (P4) platí SPEC: iba vhodné.


**Projekt 7 (P7, dáta z dotazníka a analytika), 23. 11. 2026** — branch `p7-analytics`, priebeh v `PROGRESS-P7.md`. Body 1–12 ✅ potvrdil používateľ 23. 11.; 13–14 zadanie používateľa 23. 11.:
1. **`page_view` = automatický `$pageview` PostHogu** (pri načítaní stránky; obrazovky dotazníka sú `#hash`, merajú sa udalosťami `quiz_*`). Vlastnú udalosť `page_view` neposielame, aby sa nezdvojovala s webovou analytikou PostHogu.
2. **Súhlas po kategóriách:** `cookies.js` dnes pozná iba „všetky / nevyhnutné“. Pribudnú samostatné kategórie **analytické** (PostHog) a **marketingové** (Klaviyo) a v lište voľba „Nastaviť“ s dvoma prepínačmi (GDPR: súhlas musí byť konkrétny). Staré uložené voľby platia ďalej (`all` = obe, `necessary` = žiadna). PostHog (`analytics.js`) aj Klaviyo načíta `cookies.js`, HTML stránok sa to netýka.
3. **Bez súhlasu v prehliadači nič** (žiadny cookieless režim). Server-side udalosti z webhooku pri zákazníkovi bez analytického súhlasu idú **bez osobného profilu** (`$process_person_profile: false`, náhodné id, iba suma/recept/plán/dopravca), aby sedeli tržby a počty objednávok; so súhlasom s `distinct_id = customer_id`. Súhlas sa nesie v Stripe metadata (`ph`, `kl`).
4. **Identify v okamihu „Pokračovať k platbe“:** `customer_id` vzniká až v `POST /api/checkout` (email je overený spolu s doručením). Odpoveď vráti `customerId`, prehliadač zavolá `identify(customer_id)`; email do PostHogu nejde. V tej istej chvíli sa `quiz_sessions` spáruje so zákazníkom (email, customer_id, `checkout_started_at`) a do Klaviyo ide „Started Checkout“.
5. **Reverse proxy `/ingest`** (Next rewrites → `us.i.posthog.com`, `us-assets.i.posthog.com`), aby blokovače reklám neskresľovali funnel. Iba prenos, súhlas platí rovnako.
6. **Id dotazníka** (`quiz_sessions.id`, UUID) žije v stave dotazníka v `sessionStorage` (ako dnes odpovede); nový dotazník = nové id. Nie je to trvalý identifikátor návštevníka.
7. **Klaviyo bez privátneho kľúča:** „Started Checkout“ (a „Placed Order“ na stránke Hotovo, aby flow opusteného košíka skončil) cez `klaviyo.js` v prehliadači (`identify` email + `track`), iba so súhlasom s marketingom. Odkaz späť: `/granule-na-mieru?kviz=<id>#vysledok` obnoví odpovede z `GET /api/quiz/<id>` (iba nezaplatená session, max. 90 dní).
8. **Cron `retention` (denne):** zákazník bez objednávky a predplatného, vytvorený aj naposledy zmenený pred > 90 dňami → zmazať Stripe zákazníka (iba `metadata.app = granula`) a riadok `customers` (psy a adresy kaskádou). `quiz_sessions` takého zákazníka sa anonymizujú (email, customer_id = null, meno psa z odpovedí preč). Mazanie namiesto anonymizácie zákazníka: anonymný riadok zákazníka nemá využitie.
10. **Zdroj návštevy v `quiz_sessions`:** UTM a referrer z URL stránky dotazníka vždy (bez ukladania v prehliadači); zo vstupnej stránky webu (sessionStorage `granula-src`) iba so súhlasom s analytickými cookies.
11. **`order_completed` pri každej zaplatenej objednávke** vrátane obnovení (`order_kind` = `first` | `one_off` | `renewal`, `customer_type` nový/opakovaný), aby súčet `revenue` = tržby; pri obnovení navyše `subscription_renewed`. Funnel z webu filtruje `order_kind ≠ renewal`. Navyše `subscription_payment_failed` (neúspešná platba obnovenia) pre retenciu.
12. **`withdrawal_submitted`** posiela P4 (`/odstupenie`) cez `trackWithdrawal()` z `lib/analytics.ts` po zápise do `withdrawals`; webhook ho nevie rozlíšiť od bežného zrušenia (okamžité zrušenie sa započíta ako `subscription_cancelled` s `at_period_end: false`).
9. **`quiz_step_completed`** nesie odpovede kroku bez mena psa (pohlavie, plemeno, váha, vek, aktivita, kastrácia, postava, zameranie, alergie).
15. **Serverové udalosti bez súhlasu** (zadanie používateľa 23. 11., spresňuje bod 3): neodíde žiadny identifikátor ani nič z neho odvodené (customer_id, email, meno, order_id, subscription_id, id dotazníka, ani hash). `distinct_id` aj `uuid` sú náhodné (`crypto.randomUUID()`), `$process_person_profile: false`, vlastnosti iba z whitelistu `ANON_PROPERTIES` v `lib/analytics.ts` (suma, typ nákupu, receptúra, balenie, doprava, nový/vracajúci sa; + technické `source`, `$lib`). Ochrana pred duplicitou na našej strane: tabuľka `analytics_sent` (kľúč udalosti s PK, zápis pred odoslaním; najviac raz, zlyhané odoslanie sa neopakuje). So súhlasom bez zmeny (customer_id, deterministické uuid, všetky vlastnosti).
16. **Klaviyo zo servera** (zadanie používateľa 23. 11., mení bod 13): s `KLAVIYO_PRIVATE_KEY` (Private API Key, Events: Write + Profiles: Write; iba Vercel env, Sensitive) posiela „Started Checkout“ `POST /api/checkout` iba so zaškrtnutým políčkom pripomenutia, **nezávisle od cookies**, jedna udalosť na dotazník (`unique_id` = `checkout-<id dotazníka>`, rovnaký ako `$event_id` v prehliadači). Odpoveď nesie `reminderServer: true` a prehliadač vtedy „Started Checkout“ ani „Placed Order“ neposiela. „Placed Order“ (`order-<číslo>`) posiela webhook pri novej objednávke, ak zákazník dal súhlas s pripomenutím v niektorom svojom dotazníku, aby flow opusteného košíka skončil. Bez kľúča sa zo servera nič nepošle a platí bod 13 (prehliadač, iba s marketingovými cookies). Duplicity: `analytics_sent` + `unique_id` v Klaviyo. Chyba Klaviyo nezastaví nákup ani webhook.
13. **Súhlas s pripomenutím nedokončenej objednávky** (zadanie používateľa): v checkoute pod e-mailom nezaškrtnuté políčko „Ak objednávku nedokončíš, pripomenieme ti ju e-mailom.“ (iba pri otvorenom predaji). Hodnota, čas servera a zobrazený text sa uložia do `quiz_sessions` (`reminder_consent`, `reminder_consent_at`, `reminder_consent_text`) pri „Pokračovať k platbe“; čas sa mení iba pri zmene voľby. „Started Checkout“ do Klaviyo ide iba so zaškrtnutým políčkom **a** so súhlasom s marketingovými cookies (klaviyo.js bez neho nebeží); udalosť nesie `ReminderConsent: true` na filter vo flow. Súhlas s cookies sám na emaily nestačí.
14. **Funkčné cookies** (zadanie používateľa): štvrtá kategória v lište „Funkčné“ (zapamätanie psov z dotazníka a nastavení na tomto zariadení), bez ďalšieho políčka na stránke. So súhlasom `granula-psy` v `localStorage` trvalo, bez neho v `sessionStorage` do zatvorenia záložky; udelenie súhlasu presunie psov zo záložky do `localStorage`, odvolanie ich z `localStorage` zmaže. Psi uložení skôr bez súhlasu sa pri prvej návšteve presunú do záložky. `granula-cookies` = `all` | `necessary` | zoznam kategórií oddelený čiarkou (`functional,analytics`); staré hodnoty platia, staré `all` zahŕňa aj funkčné.

**Projekt 2: admin portál (P3), 23. 11. 2026** (branch `p2-admin`, zadanie `PROJEKT-2.md`)
25. **Appka `admin/`:** závislosti iba z koreňového `node_modules` (`admin/vercel.json`: `installCommand: cd .. && npm ci`), `admin/package.json` uvádza `next` iba kvôli detekcii frameworku na Verceli. Žiadne npm workspaces (zmena koreňového `package.json` by kolidovala s paralelnými branchmi).
26. **Prihlásenie:** e-mail + heslo + povinné 2FA (TOTP, `aal2`), iba `app_metadata.role = "admin"`. Tokeny v httpOnly cookies (7 dní bez aktivity), overenie v Supabase pri každej požiadavke. Účty iba skriptom `admin/scripts/create-admin.ts` (žiadna registrácia ani reset hesla e-mailom). Lokálne obídenie prihlásenia `ADMIN_DEV_USER` platí iba v `next dev`.
27. **Žiadne nové Stripe eventy.** Refund z admina zapíše stav hneď (synchrónne), detail objednávky číta platbu a refundy zo Stripe naživo. `charge.refunded` sa nepridáva: pri obnoveniach charge nemá `metadata.app` a webhook by ho aj tak zahodil (`isOurs`). Dôsledok: refund urobený priamo v Stripe dashboarde detail ukáže, ale stav objednávky v DB nezmení → refundy robiť v admine.
28. **Úprava doručenia a storno:** vo FHB iba v stave `pending` (PUT / DELETE `/order`); objednávka `paid` / `fhb_error`, ktorá ešte nie je vo FHB, sa mení iba u nás a potom „Znova odoslať do FHB“. Storno nerobí refund samo (v admine je zaškrtnuté „a vrátiť peniaze“) a nezruší predplatné. Overenie doručenia je spoločné s checkoutom (`resolveDelivery` v `lib/checkout.ts`).
29. **Poslať znova (vrátená/stratená zásielka)** = nová objednávka s rovnakými položkami, 0 €, `stripe_ref = reship:<pôvodná>:<n>`, nový stĺpec `orders.reship_of` (migrácia `p3_admin_reship`, aplikovaná). FHB `value` = 0.
30. **Zmena predplatného s prepočtom** (`lib/subscription-actions.ts`): admin smie zvoliť aj menej vhodnú receptúru (náhľad ju označí; portál P4 iba vhodné). Ďalšia platba: rovnaké D → nemení sa; iné D → posledné doručenie + D − LEAD (bez doručenia odhad: posledná objednávka + SHIP_DAYS), najskôr zajtra. Zmena doručenia predplatného = nový riadok `addresses` + prepočet ceny dopravy v Stripe (napr. DPD zadarmo → SPS kuriér 1,90 €); už vytvorené objednávky sa nemenia.
31. **Oprava `skipDelivery`:** preskočená dodávka sa platí o 06:00 UTC (predtým o polnoci, `addDays` zahodil čas).
32. **Kontrola výpočtu** je na `manazer.granula.sk/vypocet` (za prihlásením), `granula.sk/admin-vypocet` → 404. ⚠️ Prepínač „použiť testovacie parametre v dotazníku“ (localStorage) už dotazník na www neovplyvní (iná doména); server ich ignoroval vždy. Banner v `kviz.js` so starým odkazom sa zobrazí iba pri starom nastavení v prehliadači.
33. **Odstúpenie: lehota a refund až po vrátení tovaru:** peniaze vrátiť do 14 dní od prijatia odstúpenia (prijaté 23. 11. → posledný deň 7. 12.; od P4 stĺpec `refund_due_at`). (zadanie 23. 11., stĺpce z `p4_withdrawal_refund`): čakajúce = `refunded_at is null` (okrem zamietnutých), zoradené podľa `refund_due_at`, prešvihnuté červeno, do 3 dní oranžovo. Admin zapíše vrátenie (`return_status`, `return_received_at`, `return_condition`, `return_note`); refund je povolený iba pri `not_needed` alebo `received` (kontrola aj na serveri), potom `refunded_at`, `refund_amount_cents` (súčet), `stripe_refund_id`.
34. ✅ **E-maily zákazníkovi po akciách admina** (rozhodnutie používateľa 23. 11.): refund, storno objednávky, zrušenie predplatného, zmena predplatného (receptúra/balenie/váha/vek). Šablóna `content/emails/9-zmena.html` (dizajn ako ostatné), buildery `lib/emails-admin.ts`, odosielanie cez `email_log`: kľúče `refund:<re_…>`, `order-cancelled:<objednávka>` (storno s refundom = jeden e-mail so sumou), `subscription-cancelled:<predplatné>` (iba raz, aj pri opakovanom zrušení), `subscription-changed:<predplatné>:<nové hodnoty>:<deň platby>`. Bez e-mailu: posun, preskočenie, pauza, zmena doručenia, poslať znova (zákazník dostane e-mail o odoslaní z FHB).

**Projekt 3 (P4): zákaznícky portál a odstúpenie, 23. 11. 2026** (pôvodne §10.25, prečíslované za §10.34; branch `p3-portal`, stav v `PROGRESS-P3.md`)
35. **Odstúpenie `/odstupenie`:** statická stránka `public/granula/odstupenie.html` (rovnaká hlavička a pätička ako web) + `POST /api/odstupenie` (bez prepínača predaja, odstúpiť sa dá vždy). Krok 1 formulár s tlačidlom „Odstúpiť od zmluvy tu“, krok 2 rekapitulácia s vyhlásením „Týmto oznamujem, že odstupujem od zmluvy.“ a „Potvrdiť odstúpenie“, krok 3 čas prijatia zo servera. Predvyplnenie `?objednavka=<číslo>`. Číslo sa prijme aj ako `#17`, `č. 17`, `GR-000017`.
    - **E-mail musí sedieť s objednávkou** (✅ používateľ 23. 11.; v `/ucet` podľa prihláseného zákazníka). Krok 1 sa overí na serveri (`confirm: false`, nič sa nezakladá). Pri nezhode alebo neexistujúcom čísle sa **nič nezaloží ani nezruší** a formulár ukáže: „Tento email nesedí s objednávkou č. X. Zadaj email, ktorý si použil pri objednávke. Ak si ho nepamätáš, napíš nám na podpora@granula.sk – odstúpenie platí aj takto.“ (HTTP 422). **Žiadne overovanie kódom ani e-mailom** pred odstúpením (zákon ho zakazuje). Predplatné sa pri nezhode nepozastavuje.
    - **Lehota:** koniec dňa prevzatia prvého tovaru (najskorší `delivered_at` objednávok zmluvy) + 14 dní, Europe/Bratislava. Pred doručením lehota neplynie (v lehote). Po lehote: prijme sa, predplatné sa zruší, zaplatené objednávky sa **nezastavia** (rozhodne admin), `needs_review`.
    - **V lehote:** predplatné okamžite zrušené (Stripe + DB `cancelled`), objednávky `paid`/`fhb_error`/`sent_to_fhb`/`confirmed`: overenie vo FHB, `pending` → `DELETE` → `cancelled`; inak „už sa balí“ → `return_pending`. Odoslané/doručené objednávky → `return_pending`.
    - **Refund nikdy automaticky** (✅ používateľ 23. 11.): admin (P3) ho spraví po prijatí vráteného vreca a kontrole stavu. Do `withdrawals` sa ukladá lehota na refund a stav vrátenia (migrácia `p4_withdrawal_refund`): `refund_due_at` (koniec dňa prijatia + 14 dní), `return_status` (`not_needed` tovar neodišiel · `awaiting` čaká sa na vrátenie · `received` vrátené · `not_returned` nevrátené), `return_received_at`, `return_condition` (`ok` / `opened` / `damaged`), `return_note`, `refunded_at`, `refund_amount_cents`, `stripe_refund_id` (posledných šesť vypĺňa admin).
    - **Ochrana:** skrytá pasca na roboty, dvojklik do 10 min vráti pôvodný záznam, najviac 10 odstúpení z e-mailu za 24 h (429). Odpoveď API obsahuje iba zadané údaje a čas prijatia. Hláška pri nezhode prezradí iba to, či daný e-mail patrí k danému číslu (rovnaká hláška pre neexistujúce číslo).
    - **DB** (migrácia `p4_withdrawals`): `withdrawals` + `customer_id`, `deadline_at`, `in_deadline`, `needs_review`, `review_note`, `actions` (čo sa automaticky urobilo). `content` = formulár, vyhlásenie, zdroj, IP, user agent.
    - **E-mail 7** `content/emails/7-potvrdenie-odstupenia.html` (dizajn ako ostatné): obsah odstúpenia, dátum a čas prijatia, čo bude ďalej. Kľúč `withdrawal-confirm:<id>`, `confirmation_sent_at`. Admin: `admin-withdrawal:<id>` na `ADMIN_EMAIL`. Audit `withdrawal.received`. ⚠️ text (refund do 14 dní, vrátenie tovaru) na posúdenie právnikom.
    - **Pätička všetkých stránok:** tlačidlo „Odstúpiť od zmluvy tu“ (orámované, verzálky, `.foot-wd` v `granula.css`) v stĺpci PRÁVNE, blog cez `index.html` (build.py dáva zhodné HTML). Výnimka z pravidla „statické stránky sa nemenia“ na základe zadania.
36. **Zákaznícky portál `/ucet`** (prihlásenie kódom, RLS, akcie s predplatným; spoločné funkcie s adminom `lib/subscription-actions.ts` a `lib/order-actions.ts`, pozri §10.30 a §10.28):
    - **Odstúpenie v `/ucet`:** tlačidlo „Odstúpiť od zmluvy tu“ pri poslednej objednávke zmluvy v lehote (bez odstúpenia), meno a e-mail z účtu, „Potvrdiť odstúpenie“ → `POST /api/ucet/odstupenie` (rovnaký `submitWithdrawal`, zhoda podľa prihláseného zákazníka, zdroj `ucet`).
    - **`/ucet` prihlásenie (✅ používateľ 23. 11.):** bez hesla, jednorazový kód e-mailom (Supabase email OTP), nie magic link. `POST /api/ucet/kod` pošle kód iba existujúcemu zákazníkovi, odpoveď je vždy rovnaká. Kód vygeneruje Supabase (`auth.admin.generateLink` → `email_otp`, používateľ sa založí s potvrdeným e-mailom), **e-mail posielame my cez Resend** (šablóna 8 `8-prihlasovaci-kod`, `email_log`), nie SMTP Supabase: rovnaký dizajn a doména ako ostatné e-maily, šablóna v repe, netreba vlastné SMTP v Supabase (vstavané posiela iba členom tímu). `POST /api/ucet/prihlasit` → `verifyOtp({ type: 'email' })` → session v httpOnly cookie (`@supabase/ssr`) → `customers.auth_user_id`. Limity (`ucet_login_attempts`): 5 kódov na e-mail za hodinu, 5 zlých pokusov za 15 min. Nový kód ruší predošlý. Dĺžku kódu (6) a platnosť (10 min) nastaviť v Supabase (Auth → Providers → Email).
    - **`/ucet` dáta a RLS** (migrácia `p4_ucet`): policies iba `SELECT` pre `authenticated` na customers, dogs, addresses, subscriptions, orders, withdrawals (vlastné cez `customers.auth_user_id = auth.uid()`). `GET /api/ucet/ja` číta klientom s JWT zákazníka (RLS), zmeny idú cez `/api/ucet/predplatne/<id>/<akcia>` service rolou po kontrole vlastníctva. CSRF: cookie `sameSite=lax` + kontrola `Origin`.
    - **`/ucet` stránka:** statická `public/granula/ucet.html` (hlavička a pätička webu, vanilla JS, mobil prvý, `noindex`). Akcie: posunúť (zajtra … +120 dní), preskočiť (+D), pozastaviť / obnoviť (s dátumom), váha psa a receptúra/balenie s porovnaním „Teraz / Po zmene“ pred potvrdením (engine na serveri, iba vhodné receptúry, balenie musí sedieť s doručením a boxom), doručenie rovnakým výberom ako checkout (`doprava.js`, overenie `prepareCheckout`), zrušenie s povinným dôvodom ku koncu obdobia (Stripe `cancel_at_period_end`, stĺpce `cancel_at`, `cancel_requested_at`, `cancel_reason`) a odvolanie zrušenia.
    - **Zmena D/ceny** (✅ používateľ 23. 11.): spoločná funkcia s adminom `previewPlanChange` / `applyPlanChange` (§10.30): jeden `changePlan` s `trial_end`; nové D → posledné (alebo odhadované) doručenie + D_nové − LEAD (SPEC §1), predošlý ručný posun/preskočenie sa prepočíta; **rovnaké D → dátum ďalšej platby ostáva** (zmena iba ceny/receptúry). `/ucet` nad ňou navyše: iba vhodné receptúry (`lib/ucet/plan.ts`), kontrola boxu pri balení bez boxov; po zmene e-mail `subscriptionChangedEmail`. 
    - **Doručenie a otvorená objednávka** (✅ zmeny receptúry/balenia/váhy od ďalšieho vreca, používateľ 23. 11.): overenie `resolveDelivery` (ako checkout a admin, e-mail = e-mail účtu), cena dopravy `syncShipping` (iba riadok dopravy, dátum ostáva), objednávky cez `updateOrderDelivery` (§10.28): `paid`/`fhb_error` → nová adresa v DB (cron ju pošle), FHB `pending` → `PUT /order`, výpadok FHB → hláška, že príde na pôvodné miesto, inak „Objednávka č. X sa už balí… nové doručenie platí od ďalšieho vreca“. Zmena receptúry, balenia a váhy platí vždy od ďalšieho vreca.
    - **Karta a faktúry:** „Zmeniť kartu“ = Stripe Customer Portal rovno vo flow `payment_method_update` (prehľad portálu by ukazoval „Bezplatná skúšobná verzia končí…“, lebo dátum platby posúvame cez `trial_end`). Konfiguráciu portálu (karta + faktúry, bez zmeny/zrušenia predplatného) založí kód sám (`metadata.purpose=ucet`). Faktúry sú priamo v `/ucet` (Stripe PDF a online verzia, `GET /api/ucet/faktury`).
    - **Analytika odstúpenia (✅ používateľ 23. 11.):** `trackWithdrawal()` (P7) po zázname a e-mailoch, s aj bez súhlasu (test na presný obsah udalosti v `lib/withdrawal.test.ts`). So súhlasom s analytickými cookies: udalosť na osobu. **Bez súhlasu iba naozaj anonymne:** žiadny e-mail, meno, `customer_id`, číslo/id objednávky ani predplatného, žiadne id odvodené z našich id (ani hash), **náhodné `distinct_id`** (a náhodné `uuid` udalosti) a `$process_person_profile: false`. Ak to implementácia nespĺňa, bez súhlasu sa neposiela nič. Súhlas posiela stránka (`GranulaConsent.has('analytics')`), server ho neprevezme inak.
    - **E-maily k zmenám** = šablóna `9-zmena` a `lib/emails-admin.ts` od admina (§10.34), jedna verzia: zrušenie `subscriptionCancelledEmail` (vlastný kľúč a záver pre `/ucet`), zmena `subscriptionChangedEmail`, nové `subscriptionPauseEmail` (pauza, obnovenie, odvolanie zrušenia). Pôvodná šablóna `9-zmena-predplatneho` zrušená.
    - **„Prejsť na predplatné“** (✅ používateľ 23. 11.; e-mail po jednorazovej objednávke) vedie na `/ucet`, kde je pri zákazníkovi bez predplatného tlačidlo do dotazníka (`/granule-na-mieru`). Priamy prechod jednorazovej objednávky na predplatné uloženou kartou zatiaľ nie je.
