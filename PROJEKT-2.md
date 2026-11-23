# PROJEKT 2: admin portál (SPEC P3)

Branch `p2-admin` (z main). Paralelne bežia `p3-portal` (zákaznícky portál, P4) a `p7-analytics`. Meniť iba svoje časti; spoločné
súbory (`lib/`, migrácie, webhook) opatrne a minimálne, migrácie s časovou značkou.

## Zadanie (používateľ, 23. 11. 2026)

Cieľ: Viktoria a Andrej vedia spravovať objednávky a predplatné bez chodenia do Stripe, Supabase a FHB.
- Samostatná Next.js appka v `admin/` (druhý Vercel projekt, Root Directory `admin`, doména `manazer.granula.sk`; neskôr rozhodnuté: bez vlastnej domény, `granula-manazer.vercel.app`, SPEC §10.25). Zdieľa `lib/`
  (engine, stripe, fhb, db, subscription-schedule), žiadna duplicitná logika.
- Prihlásenie: Supabase Auth, iba používatelia s `app_metadata.role = admin`. Všetky akcie na serveri, zapisujú sa do `audit_log`.
- Obrazovky (SPEC P3): 1. prehľad dňa, 2. objednávky (detail, znova do FHB, úprava adresy a storno iba v `pending`, refund),
  3. predplatné (posun, preskočenie, pauza, zmena receptu/balenia/váhy s prepočtom, zrušenie), 4. neúspešné platby,
  5. vrátené zásielky, 6. odstúpenia od zmluvy, 7. sklad, 8. kontrola výpočtu (presun `admin-vypocet.html`, z verejného webu preč).
- Ďalšie Stripe eventy iba ak treba (napísať presne, ktoré doplniť do webhooku `playful-spark`).
- Jednoduché, rýchle UI pre ops, slovensky. Test mode, testovacie objednávky. Na konci: nastavenie Vercelu a admin účtu.
  Do main iba na pokyn (predtým merge najnovšieho main, testy, build).

## Plán

| Krok | Obsah |
|---|---|
| 1 | **Kostra `admin/` + prihlásenie.** Next.js appka, ktorá importuje `../lib` (bez kópií). Supabase Auth: e-mail + heslo + 2FA (TOTP, SPEC P3), iba `app_metadata.role = admin` a `aal2`. Tokeny v httpOnly cookies, obnovenie v `admin/proxy.ts`, každá stránka a akcia overí admina na serveri (`requireAdmin`). Audit helper (`actor` = e-mail admina). Skript `admin:create-user`. Overenie buildu aj v kópii repa tak, ako ho postaví Vercel (Root Directory `admin`). |
| 2 | **Objednávky.** Zoznam (filter stavu, hľadanie číslo/e-mail/meno), detail: položky, adresa, stav FHB naživo, tracking, platba zo Stripe (refundy), história (`audit_log`, `fhb_events`, emaily). Akcie: znova odoslať do FHB (`sendOrderToFhb`), úprava adresy/výdajného miesta (iba keď FHB `pending` alebo ešte nie je vo FHB; `PUT /order`), storno (iba `pending`; `DELETE /order`, voliteľne s refundom), refund (celý alebo čiastočný). |
| 3 | **Predplatné.** Zoznam (stav, ďalšia platba, ďalšia expedícia, D, cena), detail zákazníka, psa, objednávok a histórie. Akcie: posunúť, preskočiť, pauza/obnoviť, zmena receptúry/balenia/váhy (náhľad prepočtu z engine pred potvrdením, `changePlan`), zrušiť (ku koncu obdobia / hneď). |
| 4 | **Neúspešné platby, vrátené zásielky, odstúpenia.** Past_due s faktúrou zo Stripe (pokus, ďalší pokus, odkaz na platbu, „skúsiť znova“). Vrátené: refund alebo opätovné odoslanie (nová objednávka bez platby → FHB). Odstúpenia: lehoty (14 dní na refund, včasnosť od doručenia prvého tovaru), stav, refund, zrušenie predplatného. |
| 5 | **Sklad a prehľad dňa.** Sklad po SKU z FHB (`free_quantity`, spotreba predplatných, vydrží dní, upozornenia). Prehľad: zaplatené dnes, odoslané do FHB, chyby FHB, nezaplatené, odstúpenia, nízky sklad, platby na najbližších 7 dní. |
| 6 | **Kontrola výpočtu.** `admin-vypocet.html` → `admin/vypocet/`, stránka `/vypocet` za prihlásením, z verejného webu odstránená. |
| 7 | **Test v test mode** (lokálne proti produkčnej DB s test kľúčmi, Stripe test, FHB sandbox; Playwright), dokumentácia, návod na Vercel a admin účet. |

Spoločné súbory, ktoré sa menia (minimálne): `tsconfig.json` (vylúčiť `admin`), `vitest.config.mts` (testy `admin/**`), nové
súbory v `lib/` pre akcie, ktoré bude potrebovať aj zákaznícky portál, jedna migrácia `…_p3_admin.sql`, `lib/database.types.ts`.
Webhook sa nemení, ak nebude nutné.
