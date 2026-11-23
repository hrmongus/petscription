# Blog template pre AI citácie (GEO)

Nov 17, 2026 · @Never Hrmo

## Prečo to funguje (stručne)

- AI vyhľadávače (ChatGPT, Perplexity, AI Overviews, Claude) nečítajú článok celý. Rozsekajú ho na **chunky** (odseky / sekcie), vyberú top 5–10 a z nich skladajú odpoveď. Cituje sa **sekcia**, nie stránka.
- Z toho plynie jediné pravidlo: **každá sekcia musí obstáť sama, vytrhnutá z kontextu.**
- Najsolídnejší dôkaz: Princeton paper *GEO: Generative Engine Optimization* (Aggarwal et al., KDD 2024) – pridanie štatistík, citácií zdrojov a citátov zvýšilo viditeľnosť v AI odpovediach o \~30–40 %, pri slabšie rankovaných stránkach ešte viac.
- Novšia analýza ~~21 000 citácií: najsilnejšie signály sú **čísla, jasné definície, štruktúrované porovnania a how-to kroky**. **Čistý Q&A formát vyšiel mierne negatívne** (~~−6 %) – FAQ teda nie je zázrak, len doplnok.
- Skepsa: väčšina „GEO štatistík“ na webe pochádza od agentúr, ktoré GEO predávajú. Smer je konzistentný, presné percentá ber s rezervou.

## Research 2026: čo platí, čo padlo

Rok 2026 priniesol prvé **kontrolované** štúdie. Viaceré obľúbené GEO taktiky v nich neprešli, ostatok sú korelácie.

| Taktika | Verdikt 2026 | Dôkaz |
| --- | --- | --- |
| Priama odpoveď hneď na začiatku | **Funguje**, jediné univerzálne pravidlo naprieč 7 odvetviami | Indig, Growth Memo, mar 2026: 44 % citácií ChatGPT pochádza z prvých 30 % textu. [SEL](https://searchengineland.com/chatgpt-citations-content-study-469483) |
| Atomické fakty (1 veta, 6–20 slov) | **Funguje** | Takéto tvrdenia tvoria >90 % citovaného obsahu (Shashko/Indig, 2026). [PracticalEcommerce](https://www.practicalecommerce.com/studies-reveal-ai-citation-clues) |
| H2 nadpisy ako otázky | **Funguje** | 78 % citácií viazaných na otázku pochádza z nadpisov. Celý článok ako FAQ ale nie (−6 %). |
| Úzko zameraná stránka namiesto „ultimate guide“ | **Funguje** | Stránky pokrývajúce 100 % sub-otázok tému boli citované *menej* ako tie s pokrytím 26–50 % (Indig + AirOps, 815k párov, apr 2026). [Passionfruit](https://www.getpassionfruit.com/research/is-query-fan-out-a-marketing-buzzword-or-something-relevant) |
| Klasické SEO pozície | **Stále dôležité, ale slabnú** | Stránky na #1 v Google cituje ChatGPT v 43 % prípadov (3,5× viac než mimo top 20). Prekryv AI Overviews s top 10 však po Gemini 3 klesol zo 76 % na 38 %. |
| Zmienky o značke mimo webu | **Najsilnejší signál** | Zmienky o značke na webe korelujú s viditeľnosťou v AI Overviews na 0,664, backlinky len 0,218 (Ahrefs, 75k značiek). [Ahrefs](https://ahrefs.com/blog/ai-overview-brand-correlation/) Zmienky na YouTube 0,737. |
| Čerstvosť obsahu | **Korelácia, nie dôkaz** | AI citovaný obsah je o \~26 % čerstvejší než organická top 10 (Ahrefs, 17M citácií). Žiadna kontrolovaná štúdia zatiaľ nepotvrdila, že update citácie spôsobuje. Len zmena dátumu bez úpravy obsahu nepomáha. |
| Schema / JSON-LD | **Žiadny efekt na citácie** | Kontrolovaná štúdia Ahrefs (máj 2026, 1 885 stránok vs 4 000 kontrolných): AI Mode +2,4 %, ChatGPT +2,2 % (štatisticky nula), AI Overviews −4,6 %. [Ahrefs](https://ahrefs.com/blog/schema-ai-citations/) |
| llms.txt | **Mŕtve** | 97 % súborov llms.txt nezaznamenalo za máj 2026 ani jeden request (Ahrefs, 137k domén). SE Ranking (300k domén) ani Trakkr nenašli žiadny nárast citácií. [Optimizely](https://www.optimizely.com/field-notes/articles/does-llms-txt-work/) |
| Self-promo listicles („Best X“, kde si sám #1) | **Riziko** | Od dec 2025 / jan 2026 prepady viditeľnosti o 30–50 % (Lily Ray). Google takúto stránku často cituje, ale odporučí konkurenta (\~69 % prípadov). [SEL](https://searchengineland.com/google-cracking-down-self-promotional-best-of-listicles-468227) |
| Dĺžka | **Nerozhoduje** | 53 % stránok citovaných v AI Overviews má pod 1 000 slov. Rozhoduje hustota, nie dĺžka. |

**Platformy sa líšia, optimalizuj podľa cieľa:**

- **ChatGPT** (Bing index): Wikipedia, etablované médiá a stránky značiek. Self-promo listicles cituje najmenej (\~4 %).
- **Perplexity**: Reddit, výskum, news a extrémne čerstvý obsah.
- **Google AI Overviews / AI Mode**: YouTube (najcitovanejšia doména v roku 2026) a Reddit, stále najviac naviazané na organické SEO.
- 91 % citácií sa objaví len na jednej z troch platforiem (Indig, H1 2026, 3,7M URL). „Optimalizácia pre AI“ ako jeden celok neexistuje.

**Hlavná výhrada:** Indig (mar 2026) zistil, že signály, ktoré v jednom odvetví citácie zvyšujú, môžu v inom škodiť. Univerzálne platí len jedno: začni priamym, definitívnym tvrdením.

---

## Template (kopíruj a vyplň)

### 1. Titulok

`[Presná otázka alebo entita] – [konkrétny prísľub] ([rok])`

- Príklad: *Instagram Reels audio seeding: ako funguje a koľko stojí (2026)*
- Obsahuje hlavný pojem doslovne tak, ako by ho niekto napísal do ChatGPT.
- Rok daj do titulku len pri téme, ktorá sa naozaj mení (ceny, nástroje, štatistiky), a len ak obsah naozaj aktualizuješ. Rok v každom titulku je spam signál.

### 2. Meta riadok

`Autor: [meno + 1 veta prečo mu veriť] · Publikované: [dátum] · Aktualizované: [dátum]`

- Dátum aktualizácie viditeľne v texte, nie len v metadátach.

### 3. TL;DR / Kľúčové zistenia (hneď pod titulkom)

> **Krátka odpoveď:** \[Odpoveď na hlavnú otázku v 40–60 slovách. Bez úvodu, bez „v tomto článku sa dozviete“. Prvá veta = priama odpoveď.\]

**Kľúčové body:**

- &#91;Fakt s číslom\]
- &#91;Fakt s číslom\]
- &#91;Fakt / odporúčanie\]
- &#91;Najčastejšia chyba / mýtus\]

*Toto je najdôležitejší blok celého článku – najčastejšie citovaný chunk.*

### 4. Definícia

## Čo je \[pojem\]?

**\[Pojem\] je \[kategória\], ktorá \[čo robí\] pre \[koho\].** \[1–2 vety kontextu. Odlíšenie od podobného pojmu.\]

- Formát „X je Y, ktoré Z“ – presne to, čo model potrebuje na vytiahnutie definície.

### 5. Hlavné sekcie (3–6×)

## &#91;Nadpis ako otázka alebo konkrétne tvrdenie\]

**\[Prvá veta = odpoveď na nadpis.\]** \[Potom vysvetlenie, dôkaz, príklad.\]

Pravidlá pre každú sekciu:

- **200–400 slov**, jedna myšlienka, jedna otázka.
- **Žiadne odkazy dozadu** („ako sme spomenuli vyššie“, „toto“, „to“) – nahradiť plným menom entity.
- **Min. 1 číslo** so zdrojom: *„Podľa \[zdroj, rok\] … \[číslo\].“*
- **Max. 1 citát** experta s menom a funkciou.
- Nadpis H2 = otázka, ktorú reálne ľudia píšu. H3 len na podčasti.

### 6. Porovnávacia tabuľka

## &#91;A\] vs \[B\] vs \[C\]: porovnanie

| Kritérium | A | B | C |
| --- | --- | --- | --- |
| Cena |  |  |  |
| Pre koho |  |  |  |
| Hlavná výhoda |  |  |  |
| Hlavná nevýhoda |  |  |  |
| Verdikt |  |  |  |

- Tabuľky sú pre LLM extrémne ľahko parsovateľné a dobre citovateľné pri „X vs Y“ promptoch.
- Pod tabuľku **1 vetu verdiktu** – model ju často prevezme doslova.

### 7. Postup krok za krokom

## Ako \[urobiť X\]: \[N\] krokov

1. **\[Sloveso + objekt\].** \[1–2 vety čo a prečo.\]
2. **\[Sloveso + objekt\].** \[...\]
3. **\[Sloveso + objekt\].** \[...\]

- Číslovaný zoznam, každý krok začína tučným imperatívom.

### 8. Vlastné dáta / skúsenosť (najväčší diferenciátor)

## Čo ukázali naše dáta

&#91;Konkrétne čísla z vlastnej praxe: N kampaní, priemer, medián, rozptyl. Metodika v 1 vete.\]

- Originálne dáta = jediná vec, ktorú AI nemôže zobrať odinakiaľ. Toto ťa robí **primárnym zdrojom** namiesto 50. kópie.

### 9. Časté chyby / mýty

## Najčastejšie chyby pri \[X\]

- **\[Mýtus\].** Realita: \[korekcia + číslo\].
- **\[Mýtus\].** Realita: \[...\]

### 10. FAQ (krátke, nie ako hlavný formát)

## Časté otázky

**\[Otázka presne ako ju ľudia píšu\]?** \[Odpoveď 1–3 vety, prvá veta = odpoveď.\]

- 3–6 otázok, ktoré **neboli** pokryté v hlavných sekciách. Neduplikovať.

### 11. Záver = zhrnutie, nie výzva

## Zhrnutie

- &#91;Hlavný záver v 1 vete\]
- &#91;Kedy áno / kedy nie\]
- &#91;Ďalší krok\]

### 12. Zdroje

## Zdroje

1. &#91;Názov – vydavateľ, rok – URL\]
2. &#91;...\]

- Odkazy na primárne zdroje (štúdie, oficiálna dokumentácia), nie na iné blogy.

---

## Technická vrstva (bez toho to nefunguje)

- **Neblokuj AI crawlery** v `robots.txt`: `GPTBot`, `OAI-SearchBot`, `ChatGPT-User`, `PerplexityBot`, `ClaudeBot`, `Google-Extended`. Častý tichý zabijak, a z technických krokov ten s najväčším dopadom.
- **Server-side rendered HTML.** Obsah renderovaný len cez JavaScript veľa AI crawlerov nevidí.
- **Indexovanosť v Bingu aj Google.** ChatGPT hľadá cez Bing index, AI Overviews cez Google. Over si to v Bing Webmaster Tools.
- **Sémantické HTML:** reálne `<h2>`, `<table>`, `<ol>` – nie divy naštýlované ako nadpisy.
- **Schema.org JSON-LD:** len ako SEO hygiena (rich results, entity). Kontrolovaná štúdia z roku 2026 nenašla žiadny efekt na AI citácie, takže to nie je GEO páka.
- **`llms.txt`: preskoč.** Crawlery ho takmer nikdy nestáhnu a žiadna štúdia nenašla efekt.
- **Reálne aktualizácie**, nie len zmena dátumu. Viditeľný changelog („Aktualizované nov 2026: pridané dáta Q3“) a `dateModified`, ktorý sedí s obsahom.

## Distribúcia mimo blogu

- **Tu je v roku 2026 najväčší efekt.** Zmienky o značke mimo webu korelujú s AI viditeľnosťou 3× silnejšie než backlinky.
- **YouTube:** najcitovanejšia doména v AI Overviews a najsilnejšia korelácia (0,737). Každý kľúčový článok môže mať video verziu s rovnakými faktami v názve, popise a transkripte.
- **Reddit:** #1 na Perplexity a v AI Overviews. Autentické odpovede vo vláknach, nie spam.
- **LinkedIn:** #2 v citáciách naprieč ChatGPT Search, Perplexity a AI Mode (Indig, 2026). ChatGPT preferuje osobné profily, Perplexity firemné stránky.
- **Third-party „best of“ zoznamy, recenzie, PR v médiách:** cudzia stránka, ktorá ťa odporúča, má väčšiu váhu než tvoja vlastná.
- GEO nie je náhrada za budovanie značky. Objem vyhľadávania značky je jeden z najsilnejších predikčných faktorov pre ChatGPT.

## Checklist pred publikovaním

- [ ] Prvá veta článku = priame, definitívne tvrdenie (odpoveď do 60 slov)
- [ ] Kľúčové fakty sú v prvej tretine textu, nie v odseku 12
- [ ] TL;DR s ≥3 číslami
- [ ] Kľúčové tvrdenia ako atomické vety (6–20 slov, jedna myšlienka)
- [ ] H2 nadpisy formúllované ako reálne otázky
- [ ] Každá H2 sekcia funguje vytrhnutá z kontextu (žiadne „toto“, „vyššie“)
- [ ] Stránka je úzko zameraná na jednu otázku, nie „ultimate guide“ na všetko
- [ ] Min. 1 štatistika so zdrojom na sekciu
- [ ] Vlastné dáta alebo skúsenosť (info gain)
- [ ] Ak je to „Best X“: transparentná metodika a nie seba na #1
- [ ] Autor + viditeľný changelog aktualizácie
- [ ] AI crawlery povolené, server-side HTML, stránka indexovaná v Bingu aj Google
- [ ] Distribúcia: video na YouTube, post na LinkedIn, zmienka na Reddite alebo v médiách

## Čo nefunguje / preceňované

- **Schema markup ako GEO taktika:** kontrolovaná štúdia Ahrefs 2026 = nulový efekt. Korelácia „citované stránky majú 3× častejšie schema“ bola spôsobená tým, že také stránky sú celkovo kvalitnejšie, nie samotnou schémou.
- **llms.txt:** crawlery ho ignorujú, Google oficiálne uvádza nulový efekt.
- **Self-promo listicles** („Najlepšie nástroje 2026“ s tebou na #1): od jan 2026 prepady o 30–50 % a AI aj tak často odporučí konkurenta.
- **„Ultimate guide“ pokrývajúci všetky sub-otázky:** v dátach dopadol najhoršie.
- **Falešná čerstvosť:** zmena `dateModified` alebo „2026“ v titulku bez zmeny obsahu nepomáha. Používanie rokov v titulkoch vo veľkom je zároveň signál, ktorý Lily Ray našla pri penalizovaných weboch.
- **Keyword stuffing:** v Princeton štúdii bez efektu alebo škodil.
- **Celý článok ako FAQ:** mierne negatívny efekt. Otázky patria do H2, nie do formátu celého článku.
- **Dlhé úvody a storytelling na začiatku:** AI cituje hlavne z prvej tretiny, takže ju neplýtvaj.
- **Univerzálne „GEO frameworky“:** signály sa líšia podľa odvetvia aj platformy. Testuj na vlastných promptoch.
