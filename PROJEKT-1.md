Prečítaj `CLAUDE.md` v repe, potom celý `~/Desktop/Underdog/SPEC.md`. Referenčný Stripe kód (FanpageKit, rovnaký stack, osvedčený v produkcii) je v `~/Desktop/Underdog/reference/fanpagekit/`.
Pracuješ na branchi, ktorý je práve aktívny.

# PROJEKT 1: predaj, predplatné a doručenie

Cieľ: zákazník prejde dotazník, vyberie doručenie (Packeta, SPS), zaplatí (predplatné alebo jednorazovo), vznikne objednávka v Supabase, odošle sa do FHB a obnovenia chodia automaticky v správnom cykle.
Admin portál a zákaznícky portál NIE sú súčasťou (projekty 2 a 3).

Postupuj po krokoch v tomto poradí. Po každom kroku commit, zápis do `PROGRESS.md` (čo je hotové, čo ostáva, otvorené otázky) a krátke zhrnutie pre mňa. Ďalší krok začni až po mojom „ok“.

## Krok 1: Základ (SPEC P0)
- Skopíruj `~/Desktop/Underdog/SPEC.md` do koreňa repa a `~/Desktop/Underdog/reference/fanpagekit/` do `reference/fanpagekit/`. Do `CLAUDE.md` doplň odkaz na SPEC.md, PROGRESS.md a pravidlá zo SPEC §0.
- Obal statický web do Next.js (App Router, TypeScript). `granula/` presuň do `public/` BEZ zmeny obsahu. Všetky súčasné URL a presmerovania z `vercel.json` musia fungovať rovnako (prepíš do `next.config`). Uprav cesty v blog builde (`blog/build.py`) a over ho.
- `engine.js`: export aj pre Node bez zmeny logiky. `lib/engine-server.ts` počíta iba s predvolenými PARAMS (nikdy nič z klienta). `reorderLeadDays` 3 → 7 a `nextDay` podľa SPEC §1. Zosúlaď texty v `kviz.js`.
- Supabase migrácie podľa dátového modelu v SPEC (P0), RLS všade, `lib/database.types.ts`. Do `.env.example` daj premenné zo SPEC §8. Pridaj vitest.
- `admin-vypocet.html` a `admin-blog/`: `noindex` a nech nie sú v sitemap.
- Kontrola: `next build` prejde a stránky na Vercel preview vyzerajú rovnako ako na produkcii.

## Krok 2: FHB klient (SPEC P2)
- OpenAPI z https://api.fhb.sk/v3/openapi ulož do `reference/fhb-openapi.json` a vygeneruj z neho typy.
- `lib/fhb/`: login s cache tokenu, products, orders (create, update, get, delete, history), parcel-service, delivery-point, rma, stock. Funkcia `buildFhbOrder` podľa SPEC P2. Chyby 400 ukladaj ako štruktúru (`violations`).
- `scripts/fhb-sync-products.ts` (10 SKU) a `scripts/fhb-smoke.ts` (test proti sandboxu).
- Kľúče zatiaľ nemám: testuj na mockoch. URL sandboxu ber z env (docs uvádzajú api-dev, FHB v emaile api-stage).
- Pripíš do PROGRESS.md otázky pre FHB: formát notifikácií, kódy SPS a Packety, formát `delivery_point`.

## Krok 3: Doprava v checkoute (SPEC P1b)
- V kroku objednávky v `granule-na-mieru.html`, pred platbou, výber doručenia: Packeta výdajné miesto / Z-BOX, SPS ParcelShop, SPS kuriér na adresu.
- Packeta: oficiálny widget v6 v modálnom okne (API kľúč z konfigurácie, zatiaľ placeholder).
- SPS ParcelShop: vlastný pop-up v Granula dizajne (vyhľadávanie podľa mesta alebo PSČ, zoznam a mapa Leaflet + OSM). Dáta z `GET /api/delivery-points?service=sps` (FHB delivery-point, cache), kým nie sú kľúče, z mocku.
- Povinný telefón (+421) a email, validácia, výsledok ako jeden objekt `delivery`.
- Mobil ako prvý, focus trap a Esc v modale.

## Krok 4: Checkout a predplatné (SPEC §1 a P1), Stripe TEST MODE
- Prevezmi vzory z FanpageKit: `lib/stripe.ts` (APP_METADATA app=granula, isOurs), webhook so signatúrou a idempotenciou (`stripe_events`).
- `POST /api/checkout`: server prepočíta dávku, D a cenu cez engine-server, overí výdajné miesto, uloží draft customer/dog/address a vytvorí Checkout Session (`ui_mode: embedded`).
  - predplatné: `price_data.recurring = { interval: day, interval_count: D }` + doprava ako recurring item, EUR,
  - jednorazovo: `mode: payment`, `customer_creation: always`, `invoice_creation`, `setup_future_usage: off_session`.
- Embedded Checkout napoj vo vanilla JS za krok doručenia. Pripravené Address a Payment Element polia odstráň. Stránka „Hotovo“ len číta stav zo servera.
- Webhooky: `checkout.session.completed` → objednávka + `trial_end` na prvé obnovenie (doručenie + D − 7) → odoslanie do FHB. `invoice.paid` (subscription_cycle) → prepočet D → renewal objednávka → FHB. Ďalej `invoice.payment_failed`, `customer.subscription.updated` a `.deleted`.
- `lib/subscription-schedule.ts`: výpočet dátumov a úpravy predplatného (posun, preskočenie, zmena D alebo ceny v JEDNOM update s `trial_end` a `proration_behavior: none`, pauza, zrušenie). Projekty 2 a 3 ich budú volať.
- Over na Stripe test clocks: obnovenie po D dňoch vytvorí renewal objednávku a zmena intervalu nestiahne platbu hneď.
- DPH: engine má ceny s 23 % DPH a firma nie je platiteľ DPH. Nerieš, označ TODO a spýtaj sa ma.

## Krok 5: FHB stavy a základné emaily
- Notifikačné URL `/api/fhb/notify/[typ]/[orderId]?t=…`: zalogovať do `fhb_events` a stav overiť cez `GET /order`. Vercel Cron: `order/history`, `rma/list`, `stock/all`.
- `delivered_at` → prepočet prvého obnovenia (SPEC §1). Nízky sklad → interné upozornenie.
- Resend (vzor `reference/fanpagekit/lib/email.ts`): potvrdenie objednávky (s odkazom „Odstúpiť od zmluvy tu“ na `/odstupenie`), zásielka odoslaná s trackingom, neúspešná platba.

## Krok 6: Test celého toku
- V test mode prejdi celý tok: dotazník → doručenie → platba → objednávka v DB → FHB (sandbox alebo mock) → odoslané → doručené → obnovenie na test clocku. Ďalej zlyhaná karta a jednorazový nákup.
- Výsledky s dôkazmi (id objednávok a eventov) zapíš do PROGRESS.md.

## Pravidlá
- Iba TEST MODE (Stripe test, FHB sandbox). Kľúče iba v `.env.local` a vo Vercel env, nikdy v repe (repo je verejné).
- Cenu, dávku, D ani dátumy nikdy neber z prehliadača.
- Objednávka vzniká iba z overeného webhooku.
- Statické stránky sa vizuálne nemenia (okrem kroku doručenia a platby v dotazníku).
- Každé rozhodnutie, ktoré sa odchýli od SPEC, dopíš do SPEC.md a spýtaj sa ma.
- Ak je tento chat príliš dlhý, povedz mi to. Pokračovať sa dá v novom chate podľa PROGRESS.md.

Začni krokom 1. Najprv mi ukáž plán.
