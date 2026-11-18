# Blog Granula — pokyny pre autora (Claude Code)

Píšeš články na blog slovenskej značky granúl na mieru **Granula!**. Cieľ: aby ich citovali AI vyhľadávače (ChatGPT, Perplexity, Google AI Overviews, Claude) a zároveň boli užitočné pre majiteľov psov. Spätnú väzbu dáva používateľ cez redakciu `/granula/admin-blog/`. Do chatu ti vkladá skopírované bloky „Spätná väzba k článku…“, „Napíš nový článok…“ alebo „…schvaľujem na publikovanie“.

Povinné čítanie pred prvým článkom: `granula/blog/GEO-TEMPLATE.md` (výskum a šablóna). Tento súbor je jeho prevedenie do praxe.

## Postup

1. **Výskum.** Zisti, čo ľudia reálne pýtajú (presné znenie otázky), a nájdi **primárne zdroje**: štúdie (PubMed, JAVMA, WSAVA, FEDIAF, NRC), oficiálne dokumenty, údaje výrobcu. Nie iné blogy. Každé číslo v článku musí mať zdroj. Ak číslo nevieš overiť, nepíš ho.
2. **Koncept.** Skopíruj `granula/blog/_src/_template.md` do `granula/blog/_src/<slug>.md` a vyplň. `status: draft`.
3. **Build a kontrola.** Z koreňa repozitára spusti `python3 granula/blog/build.py`. Vypíše CHYBY (blokujú publikovanie) a upozornenia. Opravuj, kým nie je 0 chýb. Upozornenia sa snaž odstrániť. Ak niektoré nemá zmysel (napr. sekcia s tabuľkou má menej slov), povedz to používateľovi; `lint_ignore` pridaj len s jeho súhlasom.
4. **Commit a push** vrátane vygenerovaných súborov (`granula/blog/**`, `granula/sitemap.xml`, `robots.txt`). Náhľad uvidí používateľ v redakcii po nasadení.
5. **Zhrnutie do chatu:** slug, hlavná odpoveď (1 veta), zdroje, čo ostalo ako upozornenie a prečo.
6. **Spätná väzba:** uprav text, nastav `updated` na dnešný dátum, pridaj **prvý** záznam do `changelog` („RRRR-MM-DD: čo sa zmenilo“), znova build, commit, push.
7. **Publikovanie len na výslovný pokyn** používateľa: `status: published`, build (pri chybách ostane článok zablokovaný a neverejný), commit, push, pošli verejnú adresu.

Nič iné na webe nemeň. Ak treba zmeniť šablónu alebo kontrolu (`build.py`, `blog.css`), najprv sa spýtaj.

## Formát súboru

Frontmatter (podmnožina YAML, každá hodnota na jednom riadku, dlhý text cez `>`):

| Pole | Pravidlo |
| --- | --- |
| `title` | Presná otázka alebo entita + konkrétny prísľub, max. 70 znakov. Rok len pri téme, ktorá sa mení, a len ak sedí s `updated`. |
| `slug` | malé písmená bez diakritiky a pomlčky, napr. `kolko-granul-denne-pes` |
| `status` | `draft` alebo `published` |
| `description` | meta popis 120–160 znakov, priama odpoveď s číslom |
| `author`, `author_bio` | meno a 1 veta, prečo mu veriť. Skutočného autora dodá používateľ; dovtedy nechaj zástupný text a upozorni na to. |
| `published`, `updated` | RRRR-MM-DD |
| `tldr` | **Krátka odpoveď, 40–60 slov.** Prvá veta = priama odpoveď. Žiadne „v tomto článku sa dozvieš“. Najcitovanejší blok článku. |
| `key_points` | 3–5 bodov, spolu s `tldr` aspoň 3 čísla, posledný bod = najčastejšia chyba alebo mýtus |
| `changelog` | najnovší záznam prvý, začína dátumom `updated` |
| `sources` | aspoň 3, tvar `"Názov – vydavateľ, rok \| https://…"` (primárne zdroje) |

Telo (markdown): `##` nadpisy sekcií, `###` podčasti, odseky, `**tučné**`, `*kurzíva*`, `[odkaz](url)`, zoznamy `-` a `1.`, tabuľky `| … |`, citát `>`. Žiadne HTML. Titulok `#` nepíš, robí ho build. Zdroje nepíš do tela, build ich vykreslí z `sources`.

## Štruktúra tela (poradie)

1. `## Čo je [pojem]?` prvá veta tučná vo forme **„[Pojem] je [kategória], ktorá [čo robí] pre [koho].“**
2. **3–6 hlavných sekcií.** Nadpis H2 = otázka, ktorú ľudia reálne píšu. **200–400 slov**, jedna myšlienka. **Prvá veta tučná = odpoveď na nadpis.** Aspoň 1 číslo so zdrojom („Podľa [zdroj, rok] …“). Max. 1 citát experta s menom a funkciou.
3. Podľa témy: porovnanie (`## A vs B: porovnanie` + tabuľka + 1 veta verdiktu), postup (`## Ako …: N krokov`, číslovaný zoznam, každý krok začína **tučným imperatívom**), `## Čo ukázali naše dáta` (len so skutočnými dátami od používateľa), `## Najčastejšie chyby pri …`.
4. `## Časté otázky`, 3–6 otázok, ktoré nie sú v hlavných sekciách, tvar `**Otázka?** Odpoveď v 1–3 vetách.` (každá otázka samostatný odsek).
5. `## Zhrnutie`, zoznam: hlavný záver, kedy áno / kedy nie, ďalší krok. Bez výzvy na nákup; výzvu ku konfigurátoru pridáva šablóna.

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
- Priateľsky a priamo, ako kamarát, ktorý rozumie psom a výžive. Nie laboratórium, nie batoľa. Odborne, ale ľudskými slovami.
- **Nikdy:** pes hovoriaci v prvej osobe, zdrobneniny (psíček, mňamka, papať), vynútené slovné hry, superlatívy a žargón („superprémiová holistická výživa“), emoji.
- Typografia: slovenské úvodzovky „…“, desatinná čiarka (2,4 kg), **nezalomiteľná medzera pred % a €** (build ju doplní sám).
- Tvrdenia o produkte len schválené, doslova: Bez pšenice · Bez sóje · Bez hrachu a strukovín · Bez kuracieho tuku · Bez pridaného cukru · Bez palmového oleja · Čerstvé mäso · Vysoký podiel mäsa · Zelenina · Podpora trávenia · Prírodné antioxidanty · Receptúry navrhnuté s veterinármi · Bez umelých farbív, konzervantov a aróm · Bez GMO · Vyrobené na Slovensku. Vyradené (nepoužívať): „Bez obilnín“, „Mäso zo Slovenska“, „Hovädzie zo Slovenska“, „Recept od MVDr.“.
- Zdravotné tvrdenia opatrne: výživa nie je liečba. Pri zdravotných problémoch odkáž na veterinára.
- Ako Granula počíta dávku a vyberá granule: `granula/engine.js` a `granula/README.md` (časť Dotazník a výpočet). Píš o tom len to, čo tam naozaj je.

## Čo build robí za teba

- Statické HTML (server-side, bez JavaScriptu), sémantické `h1/h2/table/ol`, viditeľný autor, dátumy a história zmien, zdroje, JSON-LD BlogPosting (len SEO hygiena, nie GEO páka).
- `granula/blog/<slug>/`: verejný článok (len `published` bez chýb). `granula/blog/nahlad/<slug>/`: náhľad každého článku (noindex).
- `granula/blog/index.html`, `granula/sitemap.xml`, `robots.txt` (AI crawlery povolené, redakcia a náhľady zakázané), `granula/blog/posts.js` (dáta redakcie).
- `--check` len skontroluje bez zápisu.

## Mimo repozitára (pripomeň používateľovi pri publikovaní)

Overiť indexáciu v Google Search Console a **Bing Webmaster Tools** (ChatGPT hľadá cez Bing). Distribúcia: video na YouTube, post na LinkedIn, autentická zmienka na Reddite alebo v médiách. Zmienky o značke mimo webu sú v roku 2026 najsilnejší signál pre AI viditeľnosť.
