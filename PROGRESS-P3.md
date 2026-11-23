# PROGRESS — Projekt 3: zákaznícky portál a odstúpenie od zmluvy (SPEC P4)

Branch: `p3-portal` (z main 23. 11.) · Rozhodnutia: SPEC §10.25 a ďalej · Paralelne: `p2-admin` (admin/), `p7-analytics`.

| Krok | Stav |
|---|---|
| Priorita 1: `/odstupenie` | ✅ hotové a otestované lokálne proti produkčnej DB (test mode, FHB sandbox), čaká na súhlas |
| Priorita 2: `/ucet` | ⏳ po súhlase |

## Plán

### Priorita 1: odstúpenie (pred spustením predaja)
1. Migrácia `p4_withdrawals` (pridané stĺpce), typy.
2. `lib/withdrawal.ts`: záznam s časom servera → zhoda e-mailu → lehota → zrušenie predplatného, DELETE vo FHB pri `pending` → e-mail → admin → audit. `lib/withdrawal-store.ts` (Supabase, Stripe, FHB, Resend).
3. `POST /api/odstupenie`, stránka `public/granula/odstupenie.html` (2 kroky + potvrdenie), predvyplnenie `?objednavka=`.
4. E-mail 7 (potvrdenie odstúpenia), interné upozornenie.
5. Tlačidlo „Odstúpiť od zmluvy tu“ v pätičke všetkých stránok.
6. Testy (vitest) + živý test: nákup → odstúpenie → Stripe/FHB/DB/e-mail.

### Priorita 2: `/ucet` (návrh, upresním po súhlase)
- **Prihlásenie:** Supabase magic link cez **token_hash** (odkaz funguje aj na inom zariadení ako žiadosť; PKCE by zlyhalo pri otvorení e-mailu v mobile). `POST /api/ucet/login` (pošle odkaz, iba ak zákazník existuje; odpoveď vždy rovnaká), `GET /api/ucet/auth/confirm?token_hash=…` → `verifyOtp` → cookie session (`@supabase/ssr`, httpOnly) → `/ucet`. Prvé prihlásenie prepojí `customers.auth_user_id` podľa overeného e-mailu.
- **RLS:** policies `select` pre `authenticated` na customers, dogs, addresses, subscriptions, orders, withdrawals (iba vlastné cez `customers.auth_user_id = auth.uid()`), granty iba select. Čítanie v `/api/ucet/*` klientom s JWT používateľa (RLS), zápisy service role po kontrole vlastníctva. Migrácia s časovou značkou.
- **Stránka:** `public/granula/ucet.html` (statická, rovnaká hlavička/pätička, vanilla JS, mobil prvý) nad `/api/ucet/*`.
- **Akcie** (`lib/subscription-schedule`, engine na serveri): posun / preskočenie, pauza / obnovenie, váha psa (náhľad dávky, D, ceny pred potvrdením), balenie a receptúra (iba vhodné podľa engine), adresa a výdajné miesto (doprava.js ako v checkoute), zrušenie s dôvodom (ku koncu obdobia), Stripe Customer Portal (karta, faktúry), tlačidlo odstúpenia pri objednávkach v lehote. Úprava vo FHB iba pri `pending`, inak „už sa balí“. E-maily zrušenia/pauzy.
- **Odkazy z e-mailov** (`/ucet`, „Upraviť predplatné“, „Prejsť na predplatné“, „zmeň kartu“) → funkčné stránky (neprihlásený vidí prihlásenie a po ňom sa vráti).

## Priorita 1: hotové (23. 11.)
- Súbory: `supabase/migrations/20261123102407_p4_withdrawals.sql` (aplikovaná na projekt `granula`, verzia sedí), `lib/withdrawal.ts`, `lib/withdrawal-store.ts`, `lib/withdrawal.test.ts`, `app/api/odstupenie/route.ts`, `public/granula/odstupenie.html`, `content/emails/7-potvrdenie-odstupenia.html` (+ `lib/email-templates.ts`), `lib/emails.ts` (`withdrawalConfirmationEmail`), pätička 20 HTML + `granula.css` (`.foot-wd`).
- **Testy:** 124 ✅ (13 nových: číslo objednávky, lehota vrátane zmeny času a polnoci, formulár, zhoda/nezhoda e-mailu, prihlásený zákazník, „už sa balí“, po lehote, jednorazová mimo FHB, chyby Stripe/FHB, dvojklik, limit). `typecheck` ✅, `build` ✅.
- **Živý test** (lokálny `next start` proti produkčnej DB, Stripe test, FHB sandbox, Resend):
  - nákup predplatného `scripts/e2e-checkout.ts predplatne` → objednávka **#55**, `sub_1UeuQi1U0mpiDjfiHEefXRfo`, FHB `GR-000055` pending,
  - `/odstupenie?objednavka=55` (počítač): číslo predvyplnené, chyba bez mena, rekapitulácia, potvrdenie „Prijaté 23. 11. 2026 o 11:25:59“, token `?objednavka` z URL odstránený,
  - výsledok: `withdrawals` `2828af15-…` `received`, v lehote, `needs_review: false`, akcie: predplatné zrušené, #55 zmazaná vo FHB; Stripe `canceled`, FHB `GET GR-000055` → neexistuje, DB objednávka `cancelled`, predplatné `cancelled`; `email_log` `withdrawal-confirm:…` `sent` (zákazník) a `admin-withdrawal:…` `sent`,
  - mobil (iPhone 13) s neznámym číslom 999999: prijaté, potvrdenie odoslané, `needs_review`.
- Náhľad e-mailu (mobil) skontrolovaný.

## Otvorené / na rozhodnutie
- ⚠️ Texty o refunde a vrátení tovaru (stránka, e-mail) a VOP čl. 6 (dnes lorem ipsum) s odkazom na `/odstupenie` → právnik. Výnimka pre otvorené vrece.
- Na stránke „Chceš iba zrušiť predplatné?“ zatiaľ odkazuje na e-mail podpory; po priorite 2 na `/ucet`.
- Refund po odstúpení je ručný (admin P3). Vrátenie tovaru: pokyny posiela podpora.
