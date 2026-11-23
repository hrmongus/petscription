# Granula manažér (admin, SPEC P3)

Samostatná Next.js appka pre ops na https://granula-manazer.vercel.app (interné, bez vlastnej domény). Druhý Vercel projekt z toho istého repa (Root Directory `admin`).
Všetka logika je v zdieľanom `../lib` (engine, Stripe, FHB, DB, cyklus predplatného); tu sú iba obrazovky a serverové akcie.

## Lokálne

```bash
npm ci                      # v koreni repa (admin nemá vlastné node_modules)
cd admin
npm run dev                 # http://localhost:3001; env číta z admin/.env.local (skopíruj ../.env.local)
```

Na skúšanie UI bez prihlásenia: `ADMIN_DEV_USER=ja@granula.sk npm run dev` (platí iba v `next dev`; v produkčnom builde nikdy).

`npm run build` / `npm run typecheck` · testy sú v koreni (`npm test` beží aj `admin/**/*.test.ts`).

## Prihlásenie

- Supabase Auth (ten istý projekt ako web), e-mail + heslo, **povinné 2FA** (aplikácia TOTP). Prístup iba s `app_metadata.role = "admin"`.
- Účty: `npm run create-admin -- meno@granula.sk` (vypíše dočasné heslo), `--password` nové heslo, `--revoke` odobrať prístup,
  `--reset-2fa` nový telefón. Potrebuje `NEXT_PUBLIC_SUPABASE_URL` a `SUPABASE_SERVICE_ROLE_KEY`.
- Každá akcia sa zapíše do `audit_log` (actor = e-mail admina), stránka **Audit**.

## Obrazovky

Prehľad dňa · Objednávky (detail, znova do FHB, úprava doručenia a storno iba pred spracovaním vo FHB, refund, poslať znova) ·
Predplatné (posun, preskočenie, pauza, zmena receptúry/balenia/váhy/veku s náhľadom prepočtu, doručenie, zrušenie) ·
Neúspešné platby · Vrátené zásielky · Odstúpenia · Sklad · Kontrola výpočtu (`/vypocet`) · Audit.

## Vercel

Nový projekt z repa `hrmongus/petscription`:
- **Root Directory:** `admin`, zapnuté „Include files outside the root directory in the Build Step“ (predvolene áno).
- Framework, install a build berie z `admin/vercel.json` (`cd .. && npm ci`, `npm run build`).
- **Adresa:** https://granula-manazer.vercel.app (Vercel doména projektu; vlastnú doménu nepoužívame, admin je interný).
- **Env (Production aj Preview):** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
  `STRIPE_SECRET_KEY`, `FHB_API_URL`, `FHB_APP_ID`, `FHB_SECRET`, `FHB_NOTIFY_TOKEN`, `NEXT_PUBLIC_SITE_URL=https://www.granula.sk`,
  `FHB_VALIDATE_ADDRESS` (rovnako ako web), `RESEND_API_KEY`, `EMAIL_FROM`, `EMAIL_REPLY_TO` (e-maily zákazníkovi po refunde, storne, zrušení a zmene predplatného), voliteľne `FHB_SERVICE_PACKETA` / `FHB_SERVICE_DPD` / `FHB_SERVICE_SPS_COURIER`.
  Rovnaké hodnoty ako projekt webu (test kľúče, kým web beží v teste). **Nenastavovať** `ADMIN_DEV_USER`.
- Crony ostávajú iba na projekte webu (admin nemá `crons`).
