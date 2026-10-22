# Granula — web

Slovenský web pre granule na mieru **Granula!**, implementovaný podľa návrhu
„Granula — web“ (stránka *Web — finálny* v Claude Design). Statické HTML bez
buildu; stačí otvoriť `index.html` alebo spustiť `python3 -m http.server`.

| Súbor | Čo je v ňom | Artboardy v návrhu |
| --- | --- | --- |
| `index.html` | úvodná stránka: hero, čísla, piliere, 1,8 roka, mäso, suroviny, porovnanie, ako to funguje, Granula = nula, recenzie, odborníci, otázky, výzva, pätička | Homepage + Homepage — pokračovanie |
| `suroviny.html` | podstránka Suroviny | Suroviny |
| `granule-na-mieru.html` | funkčný dotazník: 6 krokov (meno a pohlavie, plemeno, váha a vek, deň, kastrácia a postava, zameranie) → miešanie → výsledok → objednávka → hotovo (smerovanie cez `#krok-1` … `#hotovo`) | Formulár 1–5 + nový krok s menom, Vyberáme granule, Výsledok, Checkout, Hotovo |
| `granula.css` | spoločné tokeny a komponenty (logo-nálepka, tlačidlá, foto s posunutým farebným poľom, pásky, karty mäsa, pätička) | |
| `icons.js` | ikony surovín z návrhu; `<span data-icon="jelen" data-ink="#F4EBE2">` | |
| `site.js` | objavovanie pri scrolle, karusel recenzií | |
| `img/` | fotky z návrhu, pomenované podľa obsahu | |

## Systém

| Vrstva | Hodnoty |
| --- | --- |
| Podklad | mlieko `#F4EBE2`, `#EADFD2`, karty `#FBF6F0` / `#FFFAF4` |
| Text | čierna `#000`, `#2E2E2E`, tlmený `#5E5852` |
| Značka | kobalt `#0047BB` (`#003A99`), oranž `#FF6900` |
| Nálepky | limetka `#C9F04D`, ružová `#FFB3C7` — len nálepky a odznaky |
| Písmo | Montserrat 300–900 (titulky 900 verzálkami, „ľahká“ polovica nadpisov 300) |
| Tvar | hranaté boxy, 2px čierne linky, pootočené nálepky, foto s farebným poľom posunutým doprava dole |

Jedna svetlá téma, bez tmavého režimu (ako v návrhu). Pásky sa pomaly posúvajú;
všetok pohyb rešpektuje `prefers-reduced-motion`. Pod 960 px sa stĺpce skladajú,
dotazník dáva bočný panel pod otázku.

## Dotazník a výpočet

Plemeno iba predvyplní váhu. Dávka: RER = 70 × kg^0,75, násobená podľa
aktivity (1,3 / 1,6 / 2,0 / 2,5), kastrácie (×0,9), seniora 7+ (×0,9), postavy
(×1,1 / 1 / 0,85); šteňa ×3 do 4 mesiacov, potom ×2. Delí sa energiou krmiva
`KCAL_PER_G = 3,45`. Príklad z návrhu (18 kg, 8 rokov, mesto, kastrovaný,
akurát, kĺby) dáva presne hodnoty z artboardov: 230 g, 26/16 %, ~7 kg,
9 kg vydrží 39 dní, 1,59 € na deň, spolu 67,00 €, ďalšie vrece ~35. deň.

Odpovede sa držia v `sessionStorage`. Údaje z objednávky sa **nikam
neposielajú** a čísla karty sa po odoslaní mažú.

## Čo treba doplniť pred spustením
1. **Výživa.** Násobky, `KCAL_PER_G`, pomery bielkovín/tuku a výber mäsa podľa
   odpovedí sú zástupné. Musí ich potvrdiť veterinár podľa reálnych receptúr.
2. **Platba.** Polia karty sú len vizuál. Nahradiť ich iframe platobnej brány;
   surové čísla kariet nesmú ísť cez vlastný server.
3. **Výdajné miesta.** Tlačidlo „Vyber výdajné miesto na mape“ zatiaľ otvorí
   textové pole; patrí sem widget SPS / Packeta.
4. **Recenzie a odborníci.** Mená, citácie a hodnotenia sú z návrhu, nie od
   reálnych ľudí. Pred spustením nahradiť skutočnými, inak je to klamlivá reklama.
   Fotky odborníkov sú prázdne sloty.
5. **Tvrdenia.** „62 % mäsa“, „recept od MVDr.“, výrobca od roku 1992 a ceny
   vriec (37 / 69 / 119 €) treba overiť. Štúdie (Kealy 2002, Salt 2019) sú reálne.
6. **Pätička.** Doprava, Kontakt, Obchodné podmienky, Ochrana údajov vedú na `#`;
   `[Firma s.r.o.] · IČO [—]` sú zástupné údaje.
