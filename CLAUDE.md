# Petscription / Granula

**Najprv si prečítaj:** `SPEC.md` (zdroj pravdy: predaj, predplatné, FHB, admin, portál; rozhodnutia v §10), `PROGRESS.md` (čo je hotové, čo ostáva, otvorené otázky) a zadanie aktuálneho projektu (`PROJEKT-1.md`). Referenčný Stripe kód (FanpageKit, rovnaký stack, osvedčený v produkcii) je v `reference/fanpagekit/`: vzory preberaj, neprepisuj od nuly.

## Pravidlá (SPEC §0)

- **Iba test mode** (Stripe test kľúče, FHB sandbox), kým nie je celý tok otestovaný end-to-end. Testuje sa priamo na produkcii (granula.sk) s test kľúčmi: **nikdy nepredpokladaj production = live**, režim určuje iba kľúč (`lib/env-mode.ts`).
- **Prepínač predaja** (`lib/checkout-gate.ts`): bez `CHECKOUT_ENABLED=true` alebo `?test=<CHECKOUT_TEST_TOKEN>` je dotazník ako dnes (predregistrácia). Každý serverový endpoint checkoutu musí volať `gateFromRequest`.
- **Kľúče iba v env** (`.env.local`, Vercel Environment Variables), nikdy v repe. Zoznam premenných: `.env.example`.
- **Cena, dávka, D a dátumy sa počítajú iba na serveri** cez `lib/engine-server.ts` (engine.js s predvolenými `PARAMS`). Nič z prehliadača (ani `localStorage` `granula-engine-params`) sa neprevezme.
- **Objednávka vzniká iba z overeného Stripe webhooku**, nie z návratovej URL.
- Každý webhook (Stripe aj FHB) je **idempotentný** (`stripe_events`, `orders.stripe_ref` unique).
- Každý Stripe objekt nesie `metadata.app = "granula"`; webhook cudzie eventy ignoruje (`isOurs`, Stripe účet je bývalý Mamsa účet).
- Statické stránky webu (dizajn, blog) sa **nemenia**, iba sú pod Next.js. Výnimka: krok doručenia a platby v dotazníku.
- Každé rozhodnutie, ktoré sa odchyľuje od SPEC, dopíš do `SPEC.md` (§10) a spýtaj sa. Po každom kroku commit + zápis do `PROGRESS.md`.

## Štruktúra

- **Web:** `public/granula/` (statické HTML, popis v `public/granula/README.md`). Next.js ho servíruje z koreňa domény: `granula.sk/podpora` = `public/granula/podpora.html`. Všetky URL pravidlá (pôvodný `vercel.json`: cleanUrls, presmerovania, hlavičky) sú v `lib/site-routes.ts` + `proxy.ts` (koncová lomka). `vercel.json` obsahuje iba `framework` a `crons` (Vercel Cron sa inde nastaviť nedá; SPEC §10.14).
- **Overenie URL:** `npm run check:urls` porovná produkciu s lokálnym `next start` (status, presmerovanie, obsah).
- **Engine:** `public/granula/engine.js` (UMD: prehliadač aj Node), na serveri `lib/engine-server.ts`.
- **Databáza:** `supabase/migrations/`, typy `lib/database.types.ts`, klient `lib/db.ts` (service role, iba server).
- **Testy:** `npm test` (vitest, `lib/**/*.test.ts`), `npm run typecheck`, `npm run build`.
- **Blog:** pred akoukoľvek prácou na článkoch si prečítaj `content/blog/CLAUDE.md`. Zdroje (`_src/*.md`, `_autori`, `build.py`, `foto.py`, pokyny) sú v `content/blog/` (mimo `public/`, neservírujú sa). HTML generuje `python3 content/blog/build.py` do `public/granula/blog/`, plus `public/granula/sitemap.xml` a `public/robots.txt` (vygenerované súbory sa needitujú ručne).
- Dizajn: Granula Design System (identita v2), zhrnuté v `public/granula/README.md` (časť Systém).
