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
- **DPH:** `engine.js` počíta ceny s DPH 23 %, Spark Link s. r. o. zatiaľ **nie je platiteľ DPH** → ⚠️ rozhodnúť (ceny ostávajú ako konečné, iba sa neodvádza DPH) a zosúladiť texty a faktúry. Overiť s účtovníčkou náležitosti faktúry (Stripe faktúra vs. SuperFaktúra).

---

## P1b — Doprava v checkoute: Packeta a SPS (pop-up výber výdajného miesta)

**Cieľ:** zákazník v kroku Doručenie vyberie spôsob doručenia a pri výdajnom mieste ho vyberie z mapy v pop-upe. Vybrané miesto sa uloží tak, aby ho FHB prijal v `delivery_point`.

Spôsoby doručenia (cena podľa `PARAMS.shipping`, prípadne rozlíšiť podľa spôsobu):
- **Packeta — výdajné miesto / Z-BOX** → pop-up widget Packeta.
- **SPS — ParcelShop** → pop-up mapa výdajných miest SPS.
- **SPS — kuriér na adresu** → adresný formulár (bez widgetu).
- (Voliteľne Packeta — doručenie na adresu.)

### Packeta
- Oficiálny **Packeta widget v6** (`https://widget.packeta.com/v6/www/js/library.js`, `Packeta.Widget.pick(apiKey, callback, options)`), otvára sa ako modálne okno. Potrebný **Packeta API kľúč** (klientska sekcia Packeta; krajiny SK, prípadne CZ povoliť tam).
- Z callbacku uložiť: `id` výdajného miesta, názov, adresu, typ (výdajné miesto / Z-BOX) → `addresses.packeta_point_id`, `packeta_point_label`.
- **Na serveri** pred vytvorením Checkout Session miesto overiť (Packeta validate endpoint alebo FHB `GET /delivery-point/<packeta_kód>`), nedôverovať hodnote z prehliadača.
- ⚠️ Overiť s FHB: či `delivery_point` pre Packetu = priamo ID výdajného miesta z Packeta widgetu a či služba nevyžaduje `delivery_point_parameters`.

### SPS
- SPS ParcelShop sieť (~340 miest SK). Oficiálny JS widget SPS sa nepodarilo overiť → ⚠️ zistiť u SPS / FHB.
- **Odporúčané riešenie (nezávislé od SPS):** vlastný pop-up s mapou nad dátami z **FHB `GET /delivery-point/<sps_kód>`** → kódy miest sú garantovane tie, ktoré FHB prijme.
  - Server endpoint `GET /api/delivery-points?service=sps` → cache (Vercel/Supabase, obnova 1× denne cez cron).
  - Pop-up: vyhľadávanie podľa mesta / PSČ, zoznam + mapa (Leaflet + OpenStreetMap, bez API kľúča), tlačidlo „Vybrať“.
  - Rovnaký pop-up môže slúžiť aj ako záloha pre Packetu, keby widget nefungoval.
- Ak SPS má vlastný widget a kódy sedia s FHB, môže sa použiť ten (rozhodnúť po odpovedi SPS/FHB).

### Spoločné
- Výber dopravcu a miesta je v našom kroku Doručenie **pred** Stripe Embedded Checkoutom (Stripe výber výdajných miest nevie). Uložené v `addresses` + metadátach objednávky.
- Mapovanie na FHB: `parcel_service` = kód z `GET /parcel-service` (SPS ParcelShop, SPS kuriér, Packeta — presné kódy ⚠️ od FHB), `delivery_point` = kód miesta.
- Zákaznícky portál (P4): zmena výdajného miesta tým istým pop-upom; admin (P3): zobraziť a meniť (iba `pending`).
- Dizajn pop-upu podľa Granula Design System; mobil ako prvý.

---

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
FHB_SERVICE_SPS_PARCELSHOP=
FHB_SERVICE_SPS_COURIER=
FHB_SERVICE_PACKETA=
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
    - **SPS výdajné miesta:** `parcel_service = sps_pudo` (2 875 miest SK). `delivery_point` = `external_code` miesta (napr. `PS-BJRT0558`), číselné `id` FHB odmietne (`DELIVERY_POINT_DOES_NOT_EXISTS`). Kódy SPS kuriéra a Packety zatiaľ nie sú známe (`GET /parcel-service` je v sandboxe prázdny), sú v env `FHB_SERVICE_*`.
    - **`validate`:** SPEC hovorí `validate: true`. Sandbox však odmieta každú adresu („Failed to validate address“). Preto `validate` platí iba pri kuriérovi a dá sa vypnúť cez `FHB_VALIDATE_ADDRESS=false`. Pri výdajnom mieste sa adresa nekontroluje.
    - **Adresa pri výdajnom mieste:** FHB vyžaduje `recipient.address` aj pri výdajnom mieste. Ak zákazník adresu nezadá, pošle sa adresa výdajného miesta (`ship_to.point_address`).
    - **Názvy produktov vo FHB:** „Granula! <receptúra> <kg> kg“.
11. **Doprava v checkoute (krok 3, 21. 11.):**
    - **Mapa SPS:** FHB `GET /delivery-point` **neposiela GPS súradnice** (iba `id, external_code, name, street, city, zip, country`) a verejný zdroj súradníc SPS sa nepodarilo nájsť. Pop-up preto zatiaľ ukazuje vyhľadávanie (mesto/PSČ) a zoznam. Mapa (Leaflet + OSM) je hotová a zobrazí sa, keď budú mať miesta `lat/lng` (overené na testovacích dátach). ⚠️ Rozhodnúť zdroj súradníc.
    - **Rozsah dát:** FHB `sps_pudo` má ~2 900 miest (635 ParcelShopov `PS-…` + ~2 240 balíkovo boxov `SPS-…`), nie ~340.
    - **Adresa:** pri výdajnom mieste sa zákazníkova adresa nepýta (do FHB ide adresa miesta), pri kuriérovi áno.
    - **Telefón:** povinný pri každom spôsobe doručenia, prijímame SK a CZ čísla (+421/+420, aj v tvare 09…). **E-mail:** najviac 50 znakov (limit FHB).
    - **Packeta bez API kľúča:** v testovacom režime sa ponúkne testovacie miesto `TEST-PK01`, pri verejnom predaji hláška. Kľúč widgetu ide do prehliadača cez `/api/checkout/status` (je verejný, tajné je iba API heslo).
    - **Cena dopravy** je pre všetky spôsoby rovnaká (`PARAMS.shipping` 4,90 €). **Doby doručenia** v texte (Packeta a SPS výdajné miesto 2–3, kuriér 1–2 pracovné dni) ⚠️ potvrdiť.
    - **Pôvodný formulár** (adresa, Packeta, kuriér, platobné polia) ostáva pri zatvorenom predaji bez zmeny. Platobné polia sa odstránia v kroku 4.
8. **Receptúra v checkoute:** server prijme akúkoľvek receptúru z `PRODUCTS`, rovnako ako dnešné UI (menej vhodné len označí). V snapshote sa ukladá `eligible`. Pre `/ucet` (P4) platí SPEC: iba vhodné.

