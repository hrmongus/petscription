# Granula — web

Slovenský web pre granule na mieru **Granula!**, implementovaný podľa návrhu
„Granula — web“ (stránka *Web — finálny* v Claude Design). Statické HTML bez
buildu; stačí otvoriť `index.html` alebo spustiť `python3 -m http.server`.

| Súbor | Čo je v ňom | Artboardy v návrhu |
| --- | --- | --- |
| `index.html` | úvodná stránka: hero, čísla, piliere, 1,8 roka, mäso, suroviny, porovnanie, ako to funguje, Granula = nula, recenzie, odborníci, otázky, výzva, pätička | Homepage + Homepage — pokračovanie |
| `suroviny.html` | podstránka Suroviny | Suroviny |
| `granule-na-mieru.html` | funkčný dotazník: 6 krokov (meno a pohlavie, plemeno s vyhľadávaním, váha a vek, deň, kastrácia a postava, zameranie) → miešanie → výsledok → objednávka → hotovo (smerovanie cez `#krok-1` … `#hotovo`) | Formulár 1–5 + nový krok s menom, Vyberáme granule, Výsledok, Checkout, Hotovo |
| `admin-vypocet.html` | dočasná kontrolná stránka výpočtu (všetky otázky, vhodnosť, pravidlá, dávka krok za krokom, parametre, katalóg) | |
| `engine.js` | výber granúl, dávka a profil psa pre graf; jediný zdroj pravdy | |
| `radar.js` | radarový graf „Profil tvojho psa“ (dotazník aj kontrolná stránka) | |
| `kviz.js` | ovládanie dotazníka | |
| `granula.css` | spoločné tokeny a komponenty (logo-nálepka, tlačidlá, foto s posunutým farebným poľom, pásky, karty mäsa, pätička) | |
| `icons.js` | ikony surovín z návrhu; `<span data-icon="jelen" data-ink="#F4EBE2">` | |
| `blog/`, `admin-blog/` | blog a redakcia, pozri časť Blog (GEO) | |
| `cookies.js` | cookie lišta; Klaviyo (marketing) sa načíta až po „Prijať všetky“, voľba v `localStorage` (`granula-cookies`), lištu znova otvorí odkaz „Nastavenia cookies“ v pätičke | |
| `site.js` | objavovanie pri scrolle, karusel recenzií, sekcia surovín (filtre a šípky) | |
| `img/` | fotky z návrhu, pomenované podľa obsahu; `img/suroviny/` 38 fotiek surovín (WebP 640 px) | |

## Blog (GEO)

- Články: `blog/_src/<slug>.md` (frontmatter + markdown podľa `blog/_src/_template.md`). Pravidlá pre autora (aj pre Claude Code): `blog/CLAUDE.md`, výskum a šablóna: `blog/GEO-TEMPLATE.md`.
- `python3 blog/build.py` (z koreňa: `python3 granula/blog/build.py`) vygeneruje statické HTML: `blog/` (zoznam), `blog/<slug>/` (publikované), `blog/nahlad/<slug>/` (náhľady, noindex), `blog/posts.js`, `sitemap.xml` a `../robots.txt` (AI crawlery povolené). Kontroluje článok voči GEO šablóne; článok s CHYBOU sa nepublikuje ani pri `status: published`. `--check` len skontroluje.
- Úvodná stránka má sekciu „Blog“ (8 najnovších publikovaných článkov, posun doprava, karta „Všetky články“); vkladá ju build medzi značky `blog-home:start/end` v `index.html`, bez publikovaných článkov je skrytá.
- PDF náhľady na review: `blog/nahlad-pdf/<slug>.pdf` (build cez Node + Playwright, prerenderuje len zmenené; noindex hlavička vo `vercel.json`). Článok sa dá vytlačiť aj priamo z prehliadača (tlačové štýly v `blog.css`).
- Redakcia: `admin-blog/` (noindex, nie je pod heslom): stav článkov, kontrola GEO, sekcie, ručný checklist, náhľad a spätná väzba, ktorú skopíruješ do chatu s autorom.
- `BASE_URL` v `blog/build.py` (kanonické adresy, sitemap) je zatiaľ `https://granula.sk/granula`; upraviť podľa skutočnej domény.
- Obrázky: hero (`hero`), fotka autora (`author_photo`, `img/autori/`), obrázky v texte `![alt](cesta)`, grafy `::: graf` a ponuky k téme `::: ponuka` (syntax v `blog/CLAUDE.md`). Fotky článkov patria do `img/blog/<slug>/`. Zástupné obrázky (`placeholder`) a chýbajúca fotka autora blokujú publikovanie.
- `blog/_src/vzor-struktury.md` je vzorový koncept; po prvom skutočnom článku zmazať.

## Profil psa (radar v dotazníku)

- Vedľa otázok (desktop vpravo, mobil hore pod lištou krokov) je graf „Profil tvojho psa“ so 6 osami: Energia, Bielkoviny, Tuk, Jednoduché zloženie, Rast, Veľkosť granule. Ukazuje **potreby psa, nikdy receptúry**; tie sú až vo výsledku. Vo výsledku je graf kompletný (všetky osi odomknuté).
- Hodnoty počíta `engine.js` → `profilPsa(odpovede, krok)` z rovnakých odvodených údajov ako odporúčanie (veľkosť z tabuľky plemien, fáza, násobok RER cez spoločnú `factorFor()`, príznaky). Kreslí `radar.js`. Kontrola čísel: `admin-vypocet.html`, sekcia 1b.
- Os je zamknutá (stred, sivá, prerušovaná), kým nie je zodpovedaný jej krok: veľkosť granule → plemeno, rast → vek, energia a bielkoviny → bežný deň, tuk → kastrácia/postava, zloženie → zameranie. Odpovede z neskorších krokov sa nepočítajú (návrat späť). Riadok nad grafom hovorí, čo sa zmenilo.
- Hodnoty osí sú návrh na zobrazenie smeru potreby, nie výživové pravidlo; neoveril ich veterinár.
- Na mobile je navigácia krokov (Späť / Ďalej) stále na spodnej lište. Fotky a „Vedel si?“ z bočných panelov sú zatiaľ odstránené.

## Vyhľadávanie plemena (krok 2)

Pole s lupou nad skrytým `<select name="breed">` (ten drží hodnotu pre výpočet). Hľadá bez diakritiky a podľa začiatku slov („ovciak“ nájde všetkých ovčiakov), šípky a Enter vyberajú, Esc zatvorí. Bez zhody ponúkne krížencov podľa veľkosti. V prázdnom poli sa písmeno po písmene píšu príklady (foxteriér, labradorský retriever…); pri `prefers-reduced-motion` je tam len statický príklad. Kým nie je vybrané plemeno, počíta sa s krížencom strednej veľkosti ako doteraz.

## Sekcia Suroviny

Na úvode (03) aj na podstránke Suroviny (01) je rovnaká sekcia: filtre (Všetko, Mäso a vajcia, Tuky a oleje, Zelenina a prílohy, Ovocie, Bylinky a semiačka, Funkčné zložky), dva riadky fotiek posúvané doprava šípkami alebo potiahnutím. „Všetko“ strieda skupiny, aby nebolo len mäso. Fotka = `img/suroviny/<názov>.webp`, skupina = `data-cat` pri položke.

## Systém

Podľa **Granula Design System** (identita v2, artefakt „Granula Design System“). Hodnoty sú v `granula.css` pod názvami z `tokens.json` (`--g-mlieko`, `--g-kobalt`…) so skratkami `--m`, `--ml`, `--k`, `--o`, `--n`.

| Vrstva | Hodnoty |
| --- | --- |
| Podklad | Mlieko `#F4EBE2` pod každou stránkou; karty, polia a panely Mlieko light `#FFF7EE` |
| Text | len Noc `#000` (na Kobalte a Noci Mlieko); žiadne sivé |
| Značka | Kobalt `#0047BB`, Oranž `#FF6900` ako orámované prvky na Mlieku, nikdy celoplošné sekcie |
| Akcent | Limetka `#C9F04D` len ako jedno slovo/číslo na Kobalte (1,8 · fakty v dotazníku · „Večera je vybavená“). Ružová sa nepoužíva |
| Písmo | Montserrat 400–900 + 900 italic (náhrada Proxima Nova); nadpisy len Black verzálkami, zvýraznenie Kobaltom (`.ac`); nadpisy sekcií max. 52 px, hero 72 px, text 16/1,5 (zmenšené oproti dizajn systému, aby sa sekcia zmestila na jednu obrazovku) |
| Tvar | hranaté boxy, 2px rám Noc, žiadne tiene; foto s oranžovým poľom dole vpravo (Kobalt len vedľa oranžového tlačidla), posun 24px |
| Nálepky | `.st-o` Oranž, `.st-k` Kobalt, `.st-m` Mlieko s rámom; náklon −6° / 3° / −3°, najviac tri na plochu; odznaky štvorcové, 6° |
| Páska | Oranž, text Noc, slová spája hviezdička (`.star`, šesť lupeňov); náklon −1,5°. Prekrížené pásky (Suroviny, „Granula = nula“) sú vedomá výnimka |
| Ikony | vždy v štvorcovej dlaždici s 2px rámom Noc; Mlieko s Kobaltovou kresbou, Kobalt s Mlieko kresbou alebo Oranž s Noc kresbou |
| Fokus | 3px Noc, odsadenie 2px; na Kobalte a Noci Mlieko (trieda `.on-brand`) |

Jedna svetlá téma, bez tmavého režimu. Pásky sa pomaly posúvajú; všetok pohyb rešpektuje `prefers-reduced-motion`. Pod 960 px sa stĺpce skladajú,
dotazník dáva bočný panel pod otázku.

**Vedomé výnimky z dizajn systému:** oranžová lišta hore počas predregistrácie; celoplošné Kobaltové obrazovky miešania a hotovo a Noc zhrnutie v objednávke (zatiaľ nechané); chybová farba `--err #B3261E` (systém ju nemá); `--g-kobalt-soft #2F68CC` (systém ho používa, ale nedefinuje).

## Dotazník a výpočet

Všetko počíta **`engine.js`** (`GranulaEngine.compute`). Dotazník (`kviz.js`)
aj kontrolná stránka **`admin-vypocet.html`** (odkaz „Výpočet granúl (interné)“
v pätičke, `noindex`) volajú ten istý kód, takže sa nemôžu rozísť.

**Produkty** (názvy podľa obalu, `img/produkty/`): Hovädzie, morka & jahňa s ryžou ·
Morka, hus & kačica s tekvicou · Hovädzie s ryžou · Jahňa s batátmi & čučoriedkami ·
Jeleň & králik s batátmi.

**Výber granúl** v troch krokoch:
1. *Odvodené vstupy*: veľkostná kategória z tabuľky 86 plemien a krížencov
   (`BREEDS`; trpasličie / malé / stredné / veľké / obrie), životná fáza (štartér < 9 týž., šteňa, dospelý,
   senior; hranice podľa veľkosti), nadváha, pankreas, intolerancia, aktivita, gravidita.
2. *Vhodnosť*: každý produkt má kritériá „vhodné pre“ a „nevhodné pre“ prepísané
   z popisu výrobcu (`ELIGIBILITY`).
3. *Pravidlá* R1–R10 v poradí (`RULES`): štartér → gravidita → nadváha/pankreas
   (najmenej tuku) → intolerancia (monoproteín) → šteňa malé/stredné → šteňa
   veľké/obrie → aktívny → senior → dospelý malý → dospelý. Vyhrá prvé pravidlo,
   ktoré platí a má vhodného kandidáta.
4. *2. možnosť* (zatiaľ len na kontrolnej stránke): ďalší vhodný kandidát vo
   víťaznom pravidle, inak prvý vhodný kandidát z ďalších platných pravidiel.
   R1–R4 (štartér, gravidita, nadváha/pankreas, intolerancia) berú len zo svojho
   zoznamu. Ak kandidát nie je, druhá možnosť sa neukáže.

**Iné mäso.** Pod nálepkami surovín je odkaz „Netoleruje [meno] tento typ proteínu?“. Otvorí
všetky ostatné receptúry (pri spoločnom mäse so súčasnou je štítok „rovnaké: …“ a varovanie v porovnaní; `proteins` pri produkte), po kliknutí
porovnanie (mäso, bielkoviny/tuk, dávka, cena, kĺbové látky) a tlačidlo „Zmeniť na …“.
Receptúry, ktoré engine pre psa nevyhodnotí ako vhodné, sa dajú porovnať, ale nie zvoliť.
Zmena platí, kým sa nezmení odporúčanie (`recipe` + `recipeFor` v odpovediach).

**Denná dávka** = energia psa / energia krmiva:
- energia psa = RER × násobok (WSAVA / AAHA), RER = 70 × kg^0,75; pri nadváhe
  z ideálnej hmotnosti a s násobkom 1,0;
- energia krmiva = ME podľa rovnice NRC 2006 (odporúča FEDIAF) z analytických zložiek.

Všetky čísla sú v `PARAMS` a na kontrolnej stránke sa dajú meniť naživo
(voliteľne aj pre dotazník v tom istom prehliadači).

Odpovede sa držia v `sessionStorage`. Dokončené odpovede (bez údajov z objednávky) sa navyše uložia do `localStorage` (`granula-psy`, max. 3 psy); na 1. kroku sa potom ukáže „Alebo pokračuj s: [meno psa]“ s možnosťou psa zabudnúť (×). Nič z toho neopustí prehliadač, cookies sa nepoužívajú. Údaje z objednávky sa **nikam
neposielajú** a čísla karty sa po odoslaní mažú.

## Predregistrácia (do 20. 11.)
- Oranžová lišta hore (`.topbar`) s CTA „Chcem byť prvý“ otvorí Klaviyo pop-up `YcSYzw` (`data-klaviyo-open`).
- Embed `klaviyo-form-RuSXNc` je na úvode (sekcia `#zapis`) a v objednávke pod možnosťami doručovania.
- Bez súhlasu s marketingovými cookies sa Klaviyo nenačíta: CTA najprv ukáže cookie lištu, embed ukáže tlačidlo „Povoliť a zobraziť formulár“.
- Objednávka je vypnutá: možnosti predplatného sú sivé a neaktívne, tlačidlo „Objednávky od 20. 11.“ je `disabled`. Po štarte odstrániť `disabled` (plan inputy, `#s-submit`, `fieldset.co-locked` okolo doručenia, kontaktu a platby), triedu `locked`, pásku `.soon-tape` a vrátiť text tlačidla v `renderOrder`.

## Čo treba doplniť pred spustením
1. **Výživa.** Násobky, hranice veku a veľkosti a pravidlá výberu má potvrdiť
   veterinár. Model dáva pri „Hovädzie s ryžou“ o ~25–45 % viac než dávkovacia
   tabuľka výrobcu (sekcia 6 na kontrolnej stránke); treba rozhodnúť o kalibrácii.
2. **Jeleň & králik s batátmi.** Chýba cena, popis vhodnosti, popol, vláknina,
   vlhkosť, minerály, vitamíny a stopové prvky. Vhodnosť je zatiaľ predpoklad.
3. **Ceny.** Jednotné pre všetky receptúry (`PARAMS.bagPrices`): 4 kg 35 €, 9 kg 75 €
   (−5 % za kg), 2 × 9 kg 140 € (−11 % za kg). Ceny €/kg bez DPH z podkladov výrobcu
   ostávajú v katalógu len ako informácia. Predplatné (doručenie každých X dní podľa veľkosti balenia, 3 dni pred minutím) dáva navyše −10 %; ďalšia možnosť je jednorazový nákup.
4. **Platba.** Polia karty sú len vizuál. Nahradiť ich iframe platobnej brány;
   surové čísla kariet nesmú ísť cez vlastný server.
5. **Výdajné miesta.** Tlačidlo „Vyber výdajné miesto na mape“ zatiaľ otvorí
   textové pole; patrí sem widget SPS / Packeta.
6. **Recenzie a odborníci.** Mená, citácie a hodnotenia sú z návrhu, nie od
   reálnych ľudí. Pred spustením nahradiť skutočnými. Sekcia odborníkov je skrytá.
7. **Tvrdenia na webe.** „62 % mäsa“ je nahradené textom „Kvalitné mäso“ a páska
   „Diviak“ je odstránená. „Receptúry navrhnuté s veterinármi“ a výrobca od 1992 treba overiť.
8. **Texty zloženia** sú s opravenými preklepmi z podkladov (zoznam na kontrolnej
   stránke, bod 11). Pred tlačou overiť s výrobcom.
9. **Cookies.** Text lišty odkazuje na „Ochrana údajov“, ktorá zatiaľ vedie na `#`. Doplniť stránku so zoznamom cookies (Klaviyo) a právnym základom.
10. **Pätička.** Doprava, Kontakt, Obchodné podmienky, Ochrana údajov vedú na `#`;
   údaje prevádzkovateľa (Spark Link, s. r. o.) sú doplnené. Odkaz na kontrolnú stránku pred
   spustením odstrániť.
