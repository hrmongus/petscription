# Granula — web

Slovenský web pre granule na mieru **Granula!**, implementovaný podľa návrhu
„Granula — web“ (stránka *Web — finálny* v Claude Design). Statické HTML bez
buildu; stačí otvoriť `index.html` alebo spustiť `python3 -m http.server`.

| Súbor | Čo je v ňom | Artboardy v návrhu |
| --- | --- | --- |
| `index.html` | úvodná stránka: hero, čísla, piliere, 1,8 roka, mäso, suroviny, porovnanie, ako to funguje, Granula = nula, recenzie, odborníci, otázky, výzva, pätička | Homepage + Homepage — pokračovanie |
| `suroviny.html` | podstránka Suroviny | Suroviny |
| `granule-na-mieru.html` | funkčný dotazník: 6 krokov (meno a pohlavie, plemeno, váha a vek, deň, kastrácia a postava, zameranie) → miešanie → výsledok → objednávka → hotovo (smerovanie cez `#krok-1` … `#hotovo`) | Formulár 1–5 + nový krok s menom, Vyberáme granule, Výsledok, Checkout, Hotovo |
| `admin-vypocet.html` | dočasná kontrolná stránka výpočtu (všetky otázky, vhodnosť, pravidlá, dávka krok za krokom, parametre, katalóg) | |
| `engine.js` | výber granúl a dávka; jediný zdroj pravdy | |
| `kviz.js` | ovládanie dotazníka | |
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

Všetko počíta **`engine.js`** (`GranulaEngine.compute`). Dotazník (`kviz.js`)
aj kontrolná stránka **`admin-vypocet.html`** (odkaz „Výpočet granúl (interné)“
v pätičke, `noindex`) volajú ten istý kód, takže sa nemôžu rozísť.

**Produkty** (názvy podľa obalu, `img/produkty/`): Hovädzie, morka & jahňa s ryžou ·
Morka, hus & kačica s tekvicou · Hovädzie s ryžou · Jahňa s batátmi & čučoriedkami ·
Jeleň & králik s batátmi.

**Výber granúl** v troch krokoch:
1. *Odvodené vstupy*: veľkosť v dospelosti (z plemena, pri krížencovi zo zadanej
   kategórie alebo z hmotnosti), životná fáza (štartér < 9 týž., šteňa, dospelý,
   senior; hranice podľa veľkosti), nadváha, pankreas, intolerancia, aktivita, gravidita.
2. *Vhodnosť*: každý produkt má kritériá „vhodné pre“ a „nevhodné pre“ prepísané
   z popisu výrobcu (`ELIGIBILITY`).
3. *Pravidlá* R1–R10 v poradí (`RULES`): štartér → gravidita → nadváha/pankreas
   (najmenej tuku) → intolerancia (monoproteín) → šteňa malé/stredné → šteňa
   veľké/obrie → aktívny → senior → dospelý malý → dospelý. Vyhrá prvé pravidlo,
   ktoré platí a má vhodného kandidáta.

**Denná dávka** = energia psa / energia krmiva:
- energia psa = RER × násobok (WSAVA / AAHA), RER = 70 × kg^0,75; pri nadváhe
  z ideálnej hmotnosti a s násobkom 1,0;
- energia krmiva = ME podľa rovnice NRC 2006 (odporúča FEDIAF) z analytických zložiek.

Všetky čísla sú v `PARAMS` a na kontrolnej stránke sa dajú meniť naživo
(voliteľne aj pre dotazník v tom istom prehliadači).

Odpovede sa držia v `sessionStorage`. Údaje z objednávky sa **nikam
neposielajú** a čísla karty sa po odoslaní mažú.

## Čo treba doplniť pred spustením
1. **Výživa.** Násobky, hranice veku a veľkosti a pravidlá výberu má potvrdiť
   veterinár. Model dáva pri „Hovädzie s ryžou“ o ~25–45 % viac než dávkovacia
   tabuľka výrobcu (sekcia 6 na kontrolnej stránke); treba rozhodnúť o kalibrácii.
2. **Jeleň & králik s batátmi.** Chýba cena, popis vhodnosti, popol, vláknina,
   vlhkosť, minerály, vitamíny a stopové prvky. Vhodnosť je zatiaľ predpoklad.
3. **Ceny.** Podklady uvádzajú €/kg bez DPH; web k nim pripočíta 23 % DPH bez
   marže. Overiť, či sú to predajné ceny. Vrecia: 9 kg a 2 × 9 kg.
4. **Platba.** Polia karty sú len vizuál. Nahradiť ich iframe platobnej brány;
   surové čísla kariet nesmú ísť cez vlastný server.
5. **Výdajné miesta.** Tlačidlo „Vyber výdajné miesto na mape“ zatiaľ otvorí
   textové pole; patrí sem widget SPS / Packeta.
6. **Recenzie a odborníci.** Mená, citácie a hodnotenia sú z návrhu, nie od
   reálnych ľudí. Pred spustením nahradiť skutočnými. Sekcia odborníkov je skrytá.
7. **Tvrdenia na webe.** „62 % mäsa“ je nahradené textom „Kvalitné mäso“ a páska
   „Diviak“ je odstránená. „Recept od MVDr.“ a výrobca od 1992 treba overiť.
8. **Texty zloženia** sú s opravenými preklepmi z podkladov (zoznam na kontrolnej
   stránke, bod 11). Pred tlačou overiť s výrobcom.
9. **Pätička.** Doprava, Kontakt, Obchodné podmienky, Ochrana údajov vedú na `#`;
   `[Firma s.r.o.] · IČO [—]` sú zástupné údaje. Odkaz na kontrolnú stránku pred
   spustením odstrániť.
