# Blog Granula — pokyny pre autora (Claude Code)

Píšeš články na blog slovenskej značky granúl na mieru **Granula!**. Cieľ: aby ich citovali AI vyhľadávače (ChatGPT, Perplexity, Google AI Overviews, Claude) a zároveň boli užitočné pre majiteľov psov. Spätnú väzbu dáva používateľ alebo jeho kolegyňa z redakcie (`https://www.granula.sk/admin-blog/`): priamo v chate, ako text, PDF s ručnými poznámkami, snímky a fotky. Návod pre nich je v `granula/blog/NAVOD.md`, zadanie a povolený rozsah zmien pre session kolegyne v `granula/blog/HANDOVER.md`. Pokyn od kolegyne má rovnakú váhu ako od používateľa, vrátane schválenia na publikovanie.

**Git:** zmeny pushuj priamo na `main` (web sa nasadzuje z `main`). Ak ti prostredie určí inú vetvu, pushni aj na `main`, keď o to človek v chate požiada, inak sa spýtaj.

Povinné čítanie pred prvým článkom: `granula/blog/GEO-TEMPLATE.md` (výskum a šablóna). Tento súbor je jeho prevedenie do praxe.

**Povinné čítanie pred každým článkom aj úpravou: `granula/blog/STYL.md`** — všeobecný feedback od používateľa (tón, hlas, čo nerobiť). Má prednosť pred týmto súborom. Všeobecný feedback zapisuj tam a uplatni ho na všetky koncepty (postup je v STYL.md).

**Píšeš pre dvoch čitateľov naraz: AI vyhľadávač a majiteľa psa.** Pravidlá GEO (krátka odpoveď, otázky v nadpisoch, čísla so zdrojom) slúžia obom. Navyše pre človeka: praktický návod, ktorý vie hneď použiť (koľko, kedy, čo urobiť), konkrétne príklady z bežného života so psom, krátke odseky, obrázky a grafy tam, kde pomáhajú, a jasná hranica „kedy k veterinárovi“. Text nesmie znieť ako robot ani ako leták. Kde sú dôkazy slabé alebo zmiešané, povedz to.

## Backlog tém

Všetky témy sú v `granula/blog/TEMY.md` (kategórie A–H, priority P1–P3) a každá má súbor v `_src/<slug>.md` so `status: namet` (polia `id`, `category`, `priority`, `brief`, `angle`). Build námety nekontroluje ani nepublikuje, redakcia ich ukazuje s tlačidlom na zadanie.

- **Poradie:** P1 z kategórie F (Problémy: F1 prechod, F2 hnačka, F3 nechce jesť), potom P1 z A (Zloženie), potom ostatné P1, potom P2 a P3.
- **Keď píšeš tému:** ten istý súbor doplň podľa `_template.md`, zmeň `status: draft` a nechaj `id`, `category`, `priority`. `brief` a `angle` môžeš zmazať. Slug nemeň, ak na to nie je dôvod.
- `brief` je zadanie, nie fakty. Čísla v ňom (napr. „zhruba o 20–30 %, overiť“) over v primárnom zdroji, inak ich nepíš. „Uhol Granuly“ píš len tak, ako to naozaj je v `engine.js`, README a schválených tvrdeniach. Ak niečo z uhla nesedí (napr. plánovaný prechodový plán v zásielke), nepíš to ako fakt a spýtaj sa.
- SEO magnety (H) s kalkulačkou alebo interaktívnym testom: napíš článok; nástroj je samostatná práca na webe, navrhni ho používateľovi.

## Postup

1. **Výskum.** Zisti, čo ľudia reálne pýtajú (presné znenie otázky), a nájdi **primárne zdroje**: štúdie (PubMed, JAVMA, WSAVA, FEDIAF, NRC), oficiálne dokumenty, údaje výrobcu. Nie iné blogy. Každé číslo v článku musí mať zdroj. Ak číslo nevieš overiť, nepíš ho.
2. **Koncept.** Skopíruj `granula/blog/_src/_template.md` do `granula/blog/_src/<slug>.md` a vyplň. `status: draft`.
3. **Build a kontrola.** Z koreňa repozitára spusti `python3 granula/blog/build.py`. Vypíše CHYBY (blokujú publikovanie) a upozornenia. Opravuj, kým nie je 0 chýb. Upozornenia sa snaž odstrániť. Ak niektoré nemá zmysel (napr. sekcia s tabuľkou má menej slov), povedz to používateľovi; `lint_ignore` pridaj len s jeho súhlasom.
4. **Commit a push** vrátane vygenerovaných súborov (`granula/blog/**` vrátane `nahlad-pdf/`, `granula/sitemap.xml`, `robots.txt`). Náhľad uvidí používateľ v redakcii po nasadení.
5. **Zhrnutie do chatu:** slug, hlavná odpoveď (1 veta), zdroje, čo ostalo ako upozornenie a prečo.
6. **Spätná väzba:** najprv rozhodni, či je všeobecná (→ zapíš do `STYL.md` a uplatni na všetky koncepty) alebo len k tomuto článku. Potom uprav text, nastav `updated` na dnešný dátum, pridaj **prvý** záznam do `changelog` („RRRR-MM-DD: čo sa zmenilo“), znova build, commit, push.
7. **Publikovanie len na výslovný pokyn** používateľa: `status: published`, build (pri chybách ostane článok zablokovaný a neverejný), commit, push, pošli verejnú adresu.

Nič iné na webe nemeň. Povolený rozsah zmien (blog, prostredie redakcie) a čo je zakázané (landing, konfigurátor, dizajn webu) je v `granula/blog/HANDOVER.md`. Zmeny prostredia redakcie (`admin-blog/`, `build.py`, `blog.css`, `foto.py`) rob, keď je niečo mätúce alebo nefunguje; zmenu vzhľadu verejných článkov najprv ukáž v náhľade.

## Formát súboru

Frontmatter (podmnožina YAML, každá hodnota na jednom riadku, dlhý text cez `>`):

| Pole | Pravidlo |
| --- | --- |
| `title` | Presná otázka alebo entita + konkrétny prísľub, max. 70 znakov. Rok len pri téme, ktorá sa mení, a len ak sedí s `updated`. |
| `slug` | malé písmená bez diakritiky a pomlčky, napr. `kolko-granul-denne-pes` |
| `status` | `draft` alebo `published` |
| `description` | meta popis 120–160 znakov, priama odpoveď s číslom |
| `author` | **id autora z registra** `granula/blog/_autori/<id>.md`, napr. `author: marcela-glezgova`. Meno, vetu, fotku a web doplní build z registra a meno odkáže na stránku autora `/blog/autori/<id>/`. `author_bio` a `author_photo` v článku vtedy vynechaj (alebo nimi prepíš register len pre tento článok). Kým autor nie je určený, nechaj `"[Meno Priezvisko]"` a zástupný text v `author_bio` (blokuje publikovanie). Nového autora pridaj ako nový súbor v `_autori/` (name, bio s odkazom, photo, web, web_label + predstavenie v tele), fotku cez `foto.py … autor <id>`. |
| `hero`, `hero_alt`, `hero_caption` | obrázok v hlavičke (16:9), cesta od `granula/` (`img/blog/<slug>/hero.webp` alebo existujúca fotka z `img/`). Bez fotky `placeholder` a v `hero_alt` presne opíš, čo má byť na fotke. |
| `cta_title`, `cta_text`, `cta_button` (`cta_link`, `cta_image`) | záverečná ponuka napísaná k téme článku. Bez nich sa použije všeobecná. |
| `published`, `updated` | RRRR-MM-DD |
| `tldr` | **Krátka odpoveď, 40–60 slov.** Prvá veta = priama odpoveď. Žiadne „v tomto článku sa dozvieš“. Najcitovanejší blok článku. |
| `key_points` | 3–5 bodov, spolu s `tldr` aspoň 3 čísla, posledný bod = najčastejšia chyba alebo mýtus |
| `changelog` | najnovší záznam prvý, začína dátumom `updated` |
| `sources` | aspoň 3, tvar `"Názov – vydavateľ, rok \| https://…"` (primárne zdroje) |

Telo (markdown): `##` nadpisy sekcií, `###` podčasti, odseky, `**tučné**`, `*kurzíva*`, `[odkaz](url)`, zoznamy `-` a `1.`, tabuľky `| … |`, citát `>`. Navyše: `==zvýraznenie==` (najdôležitejšia veta), poznámka pod čiarou `[^id]` v texte + riadok `[^id]: text` kdekoľvek v tele (vykreslí sa v časti Poznámky nad zdrojmi), malá poznámka = odsek začínajúci `^ `. Žiadne HTML. Titulok `#` nepíš, robí ho build. Zdroje nepíš do tela, build ich vykreslí z `sources`.

### Fotky od redakcie

Keď ti niekto pošle fotku, priprav ju skriptom (oreže, zmenší, uloží ako WebP do 300 KB):

```
python3 granula/blog/foto.py <subor> hero <slug>
python3 granula/blog/foto.py <subor> text <slug> <kratky-nazov>
python3 granula/blog/foto.py <subor> autor <meno-priezvisko>
```

Voliteľne `--focus x,y` (0–1), keď hlavná vec nie je v strede. Skript vypíše cestu: daj ju do `hero:`, do `![alt](cesta "popis")` namiesto `placeholder`, alebo do `author_photo:`. Alt text uprav podľa toho, čo je naozaj na fotke. **Zdroj obrázka daj do popisu pod obrázkom** (`hero_caption` alebo text v úvodzovkách pri `![…](…)`): „Foto: Meno, fotobanka“ alebo „Ilustrácia vygenerovaná AI“. Fotky z fotobánk len s licenciou na komerčné použitie. Obrázky majú pôsobiť prirodzene, nie „AI“ (divné ruky, labky, texty). Keď skript hlási malé rozlíšenie, povedz to. Fotky z chatu si najprv ulož do scratchpadu, nie do repozitára. Commitni len výstup skriptu.

### Obrázky, grafy a ponuky

- **Obrázok** (samostatný riadok): `![Čo je na fotke](img/blog/<slug>/subor.webp "Popis pod obrázkom")`. Cesta od `granula/`. Bez fotky napíš `placeholder` namiesto cesty a do alt textu presne, čo má byť na fotke (pes, situácia, detail), aby ju používateľ vedel nafotiť alebo vybrať. Zástupné obrázky blokujú publikovanie.
- **Koľko:** hero + aspoň 1 obrázok alebo graf na každé 2 hlavné sekcie, najmenej 2. Obrázok dávaj tam, kde niečo ukazuje (porcia, obal, postava psa, surovina), nie ako dekoráciu. Existujúce fotky webu sú v `img/` (psy, suroviny, produkty) a smieš ich použiť, ak sedia.
- **Graf** všade, kde článok porovnáva čísla (dávky podľa hmotnosti, energia, podiely, ceny). Vykreslí sa ako statický stĺpcový graf a zároveň tabuľka, takže ho AI prečíta. Každé číslo v grafe musí mať zdroj (`zdroj:`); čísla, ktoré nepoznáš, do grafu nedávaj.

```
::: graf
nazov: Denná energia dospelého psa podľa hmotnosti
jednotka: kcal
os: Hmotnosť psa
zdroj: NRC 2006
zvyraznit: 20 kg
10 kg | 400
20 kg | 670
:::
```
  (čísla v ukážke sú len ilustračné, nepreberaj ich)

- **Ponuka uprostred článku**: 1, najviac 2 bloky `::: ponuka`, za sekciou, s ktorou súvisí. Musí nadväzovať na tému sekcie (článok o dávkach → „Dávku na gramy ti spočítame z hmotnosti, veku a aktivity“; o citlivom trávení → receptúra s jedným druhom mäsa), nie všeobecné „kúp granule“. Píš len to, čo Granula naozaj robí (`engine.js`, README) a schválené tvrdenia. Ponuka sa vykreslí mimo textu sekcie, nepočíta sa do slov a nenarúša citovateľnosť.

```
::: ponuka
nadpis: Nechceš to rátať ručne?
text: Z hmotnosti, veku, aktivity a postavy tvojho psa spočítame dennú dávku na gramy.
tlacidlo: Spočítaj dávku pre svojho psa
odkaz: granule-na-mieru.html
obrazok: img/produkty/hovadzie-s-ryzou.webp
:::
```
- **Vizuál ponuky:** každá ponuka ho má. Bez `obrazok:` build doplní vejár troch vreciek. **Vlastný obrázok produktu** (`obrazok:`) daj len vtedy, keď presne zodpovedá textu ponuky (napr. text o monoproteíne → len receptúra s `monoprotein: true` v `engine.js`; Jeleň & králik nie je monoproteín). Keď ponuka nesľubuje konkrétnu receptúru, `obrazok:` vynechaj (ostane vejár).
- **Záverečnú ponuku** prispôsob téme cez `cta_title`, `cta_text`, `cta_button`.

## Štruktúra tela (poradie)

1. `## Čo je [pojem]?` prvá veta tučná vo forme **„[Pojem] je [kategória], ktorá [čo robí] pre [koho].“**
2. **3–6 hlavných sekcií.** Nadpis H2 = otázka, ktorú ľudia reálne píšu. **80–400 slov (kratšie je lepšie)**, jedna myšlienka. **Prvá veta tučná = odpoveď na nadpis.** Aspoň 1 číslo so zdrojom („Podľa [zdroj, rok] …“). Max. 1 citát experta s menom a funkciou.
3. Podľa témy: porovnanie (`## A vs B: porovnanie` + tabuľka + 1 veta verdiktu), postup (`## Ako …: N krokov`, číslovaný zoznam, každý krok začína **tučným imperatívom**), `## Čo ukázali naše dáta` (len so skutočnými dátami od používateľa), `## Najčastejšie chyby pri …`.
4. `## Časté otázky`, 3–6 otázok, ktoré nie sú v hlavných sekciách, tvar `**Otázka?** Odpoveď v 1–3 vetách.` (každá otázka samostatný odsek).
5. `## Zhrnutie`, zoznam: hlavný záver, kedy áno / kedy nie, ďalší krok. Bez výzvy na nákup; záverečnú ponuku pridáva šablóna z `cta_*`.

## Pravidlá písania (GEO)

- **Každá sekcia musí obstáť sama, vytrhnutá z kontextu.** Žiadne „vyššie“, „nižšie“, „ako sme spomenuli“. Odsek nezačína „Toto“, „To“, „Tento“; namiesto zámena napíš celé meno veci.
- **Atomické fakty:** kľúčové tvrdenia ako samostatné vety so 6–20 slovami a číslom.
- Kľúčové fakty do prvej tretiny textu. Žiadny storytelling na začiatku.
- **Úzka téma:** jeden článok = jedna hlavná otázka. Nie „ultimate guide“.
- Dĺžka nerozhoduje, hustota áno. Pod 1 000 slov je v poriadku.
- Žiadne self-promo zoznamy („Najlepšie granule“ s Granulou na 1. mieste).
- Žiadne vymyslené štatistiky, recenzie ani citáty. Vlastné dáta Granuly len tie, ktoré dodá používateľ.

## Hlas značky (dizajn systém Granula)

- **Tykanie:** „tvoj pes“, „spočítaš“. Značka hovorí ako „my“.
- Píšeme **„granule na mieru“**, nikdy „recept na mieru“ ani nič, čo naznačuje miešanie receptúr.
- Receptúry pomenúvame **podľa mäsa** (presné názvy v `granula/README.md`, napr. „Jeleň & králik s batátmi“), nikdy Puppy, Energy a pod. **Nikdy neuvádzame počet receptúr.**
- **Ponuka a výzva vedú vždy na dotazník** (`granule-na-mieru.html`), nie na konkrétny produkt.
- **Konkurenciu nemenujeme.** Kritizujeme kategórie surovín a praktiky, nie značky. **Výnimka:** porovnávací článok (kategória „Porovnania“), keď ho výslovne zadá majiteľ projektu. Vtedy: len overiteľné údaje z webu konkurenta s dátumom, rovnaké vlastnosti, bez hanlivých slov (porovnávacia reklama, smernica 2006/114/ES), hneď na začiatku veta, že článok píše Granula, férovo aj výhody konkurenta, záver „pre koho je čo“, nie „kto vyhral“. Nepoužívaj logo ani fotky konkurenta.
- Priateľsky a priamo, ako kamarát, ktorý rozumie psom a výžive. Nie laboratórium, nie batoľa. Odborne, ale ľudskými slovami.
- **Nikdy:** pes hovoriaci v prvej osobe, zdrobneniny (psíček, mňamka, papať; „psík“ občas áno, viď STYL.md), vynútené slovné hry, superlatívy a žargón („superprémiová holistická výživa“), emoji.
- Typografia: slovenské úvodzovky „…“, desatinná čiarka (2,4 kg), **nezalomiteľná medzera pred % a €** (build ju doplní sám).
- Tvrdenia o produkte len schválené, doslova: Bez pšenice · Bez sóje · Bez hrachu a strukovín · Bez kuracieho tuku · Bez pridaného cukru · Bez palmového oleja · Čerstvé mäso · Vysoký podiel mäsa · Zelenina · Podpora trávenia · Prírodné antioxidanty · Receptúry navrhnuté s veterinármi · Bez umelých farbív, konzervantov a aróm · Bez GMO · Vyrobené na Slovensku. Vyradené (nepoužívať): „Bez obilnín“, „Mäso zo Slovenska“, „Hovädzie zo Slovenska“, „Recept od MVDr.“.
- Zdravotné tvrdenia opatrne: výživa nie je liečba. Pri zdravotných problémoch odkáž na veterinára.
- Ako Granula počíta dávku a vyberá granule: `granula/engine.js` a `granula/README.md` (časť Dotazník a výpočet). Píš o tom len to, čo tam naozaj je.

## Čo build robí za teba

- Statické HTML (server-side, bez JavaScriptu), sémantické `h1/h2/table/ol`, viditeľný autor, dátumy (história zmien len v redakcii, na stránke nie), zdroje, JSON-LD BlogPosting (len SEO hygiena, nie GEO páka).
- `granula/blog/<slug>/`: verejný článok (len `published` bez chýb). `granula/blog/nahlad/<slug>/`: náhľad každého článku (noindex).
- `granula/blog/index.html`, `granula/sitemap.xml`, `robots.txt` (AI crawlery povolené, redakcia a náhľady zakázané), `granula/blog/posts.js` (dáta redakcie).
- `granula/blog/nahlad-pdf/<slug>.pdf`: PDF náhľadu na review (tlačidlo „Stiahnuť PDF“ v redakcii). Prerenderuje sa len zmenený článok; potrebuje Node + Playwright, `--no-pdf` ho preskočí. Commituj aj PDF.
- `granula/index.html`: sekcia „Blog“ na úvodnej stránke (najnovších 8 publikovaných článkov + karta „Všetky články“) medzi značkami `blog-home:start/end`. Generuje ju build, ručne ju needituj. Kým nie je publikovaný žiadny článok, je skrytá.
- `--check` len skontroluje bez zápisu.

## Mimo repozitára (pripomeň používateľovi pri publikovaní)

Overiť indexáciu v Google Search Console a **Bing Webmaster Tools** (ChatGPT hľadá cez Bing). Distribúcia: video na YouTube, post na LinkedIn, autentická zmienka na Reddite alebo v médiách. Zmienky o značke mimo webu sú v roku 2026 najsilnejší signál pre AI viditeľnosť.
