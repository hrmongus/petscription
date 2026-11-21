# Handover: redakcia blogu Granula

## Pre teba

Budeš pripravovať a dokončovať články na blogu Granula. Robíš to cez **Claude Code**: v chate mu povieš, čo chceš, a pošleš fotky. Claude napíše alebo upraví text, osadí fotky, skontroluje článok a nahrá zmeny na web. Ty kontroluješ, či sa text dobre číta a dáva zmysel.

### Ako začať

1. **Redakcia:** https://www.granula.sk/admin-blog/ (prehľad článkov a náhľady).
2. **Claude Code:** na claude.ai/code otvor session s repozitárom **hrmongus/petscription**.
3. **Prvá správa v každej novej session:** „Prečítaj si content/blog/HANDOVER.md a riaď sa ním.“ (alebo vlož celý tento súbor).
4. Potom píš, čo chceš. Vždy uveď **názov článku**. Fotky vkladaj priamo do chatu s poznámkou, kam patria.

### Stavy článkov

| Stav | Čo znamená |
| --- | --- |
| **Námet** | Téma zo zoznamu (zatiaľ len zadanie: čo má článok pokryť a uhol Granuly). Nie je napísaný. |
| **Koncept** | Napísaný článok, ktorý ešte nie je verejný. Vidíš ho len v redakcii a cez odkaz na náhľad. |
| **Zablokované** | Článok má pokyn na zverejnenie, ale kontrola našla chybu (napr. chýba fotka), takže ostáva neverejný. |
| **Publikované** | Článok je na webe na adrese `www.granula.sk/blog/<slug>/`. |

### Ako vyzerá redakcia

- **Vľavo zoznam článkov.** Filtre: Články (všetko okrem námetov), Koncepty, Zablokované, Publikované, Námety. Pod zoznamom sú zbalené časti **Autori** (kto píše, či má fotku, odkaz na stránku autora), **Nový článok** a **Ako to funguje**.
- **Hore pri článku:** stav, počet chýb a upozornení a tlačidlá:
  - **Otvoriť náhľad:** článok tak, ako bude vyzerať na webe. Tento odkaz posielaš autorke na schválenie.
  - **Stiahnuť PDF:** PDF, do ktorého si môžeš písať poznámky (napr. na iPade perom) a potom ho poslať Claude.
  - **Kopírovať schválenie:** text pokynu na zverejnenie, ktorý vložíš do Claude.
- **V strede náhľad článku.**
- **Pod článkom, zbalené** (rozbalíš klikom na +):
  - **Kontrola GEO:** automatická kontrola, či má článok všetko, čo potrebuje, aby ho citovali AI vyhľadávače (ChatGPT, Perplexity, Google). **Chyby** blokujú zverejnenie (napr. chýba fotka autora alebo sú tam zástupné obrázky). **Upozornenia** sú odporúčania (napr. sekcia je príliš dlhá, chýba graf). Splnené pravidlá sú schované.
  - **Sekcie:** tabuľka všetkých nadpisov: koľko slov a čísel sekcia má, či je nadpis otázka, či začína tučnou vetou a aké má obrázky, grafy a ponuky. Červené hodnoty treba skontrolovať.
  - **Ručná kontrola a distribúcia:** checklist vecí, ktoré automat nevie (fakty overené, indexácia v Google a Bing, video, LinkedIn, Reddit). Odškrtávaš si ho sama. Pamätá si ho tvoj prehliadač, nie web.
- **Námet** má namiesto náhľadu zadanie a tlačidlo **Kopírovať zadanie pre Claude**.

### Proces: od námetu po zverejnenie

1. **Námet → koncept.** Vyber námet (prednostne P1) a povedz Claude: „Napíš koncept z námetu *…*“ (alebo vlož skopírované zadanie). Claude urobí výskum v odborných zdrojoch a napíše koncept.
2. **Korektúra textu (najdôležitejší krok).** Otvor náhľad alebo PDF a prečítaj článok ako majiteľ psa. Najčastejšie problémy:
   - **krkolomná slovenčina**, ktorá znie ako preklad z angličtiny (zdroje sú väčšinou anglické);
   - **zdĺhavé alebo nepochopiteľné** vety a odseky;
   - **príliš veľa technických detailov** v texte (štúdie, počty psov, metodika). Tie patria do poznámok pod čiarou.
   - článok **neodpovedá jasne na otázku** z nadpisu, alebo stráca rozumnú štruktúru.

   Čo nesedí, napíš Claude (aj ručnými poznámkami v PDF). Kľudne ho požiadaj aj o samostatnú jazykovú korektúru celého článku. Článok sa má dobre čítať, inak nie je hotový.
3. **Kontrola ponúk.** V článku sú dve ponuky (bloky „Granule na mieru“ s tlačidlom: jedna v texte, jedna na konci). Skontroluj, či dávajú zmysel k téme, či nie sú príliš špecifické a či nesľubujú niečo, čo dotazník nerobí.
4. **Obrázky.** Namiesto pruhovaných rámikov „Zástupný obrázok“ (v rámiku je napísané, čo má byť na fotke) treba dodať skutočné obrázky:
   - pekné, prirodzené a **nie príliš „AI“** (bez divných rúk, labiek, textov a plastického vzhľadu);
   - buď **fotka** (vlastná alebo z fotobanky s licenciou na komerčné použitie), alebo **vygenerovaná v AI** (napr. Higgsfield);
   - ku každému obrázku uveď **zdroj**: autora fotky a fotobanku, alebo že je vygenerovaný AI. Claude ho dá do popisu pod obrázkom.

   Pošli ich do chatu s poznámkou, kam patria. Formát je jedno, Claude ich oreže a zmenší. Ideálne aspoň 1600 px na šírku, hlavná vec v strede.
5. **Schválenie autorkou.** Keď je text aj obrázky hotové, pošli autorke odkaz z tlačidla **Otvoriť náhľad** (alebo PDF). Jej pripomienky odovzdaj Claude.
6. **Zverejnenie.** Po schválení napíš Claude: „Článok *…* schvaľujem na publikovanie.“ (alebo vlož text z tlačidla Kopírovať schválenie). Claude ho zverejní a pošle adresu. Potom si odškrtni Ručnú kontrolu a distribúciu.

Zmeny sa na webe ukážu približne do minúty po tom, čo ich Claude nahrá.

### Keď je v redakcii niečo mätúce alebo nefunguje

Povedz to Claude. Redakciu a jej nástroje smie upraviť (viď nižšie), aby sa ti s ňou pracovalo lepšie. Na zvyšok webu nesiaha.

Podrobný návod s príkladmi viet: `content/blog/NAVOD.md`.

---

## Pre Claude Code: zadanie a pravidlá

Pracuješ pre kolegyňu z redakcie blogu značky **Granula!** (slovenské granule na mieru). Jej pokyny majú rovnakú váhu ako pokyny majiteľa projektu, vrátane schválenia článku na publikovanie.

### Git: všetko na `main`

- **Pracuj a pushuj priamo na `main`. Nevytváraj nové vetvy ani pull requesty.** Web sa nasadzuje z `main`.
- Ak ti prostredie session určí inú vetvu, považuj tento dokument za výslovný pokyn pushovať na `main` (`git push origin HEAD:main`).
- Na začiatku session: `git pull origin main` (na webe pracujú aj iné session).
- Ak push odmietne: `git fetch origin main && git merge origin/main`. Pri konflikte vo vygenerovaných súboroch (`posts.js`, náhľady, PDF, `hashes.json`) spusti znova build a commitni výsledok. Konflikt v článku vyrieš ručne, keď nie je jasný, spýtaj sa.

### Rozsah: blog a prostredie redakcie

**Smieš meniť:**

- `content/blog/_src/*.md`: články a námety
- `content/blog/_autori/*.md`: register autorov
- `content/blog/STYL.md`: všeobecný feedback k písaniu
- `public/granula/img/blog/<slug>/` a `public/granula/img/autori/`: obrázky k článkom a autorom (len cez `content/blog/foto.py`)
- **prostredie redakcie**, keď je niečo mätúce, chýba alebo nefunguje: `public/granula/admin-blog/`, `content/blog/build.py`, `public/granula/blog/blog.css`, `content/blog/foto.py`, `content/blog/CLAUDE.md`, `content/blog/NAVOD.md`, tento `HANDOVER.md`. Pri `build.py` a `blog.css` meň len to, čo sa týka blogu a redakcie. Ak zmena mení vzhľad verejných článkov, ukáž ju kolegyni v náhľade skôr, než ju pushneš.
- súbory, ktoré vygeneruje build. Commituješ ich, ale ručne ich needituješ: `public/granula/blog/**` (náhľady, PDF, `posts.js`, stránky autorov), `public/granula/sitemap.xml`, `robots.txt`, sekcia blogu v `public/granula/index.html` (medzi značkami `blog-home`).

**Nesmieš meniť (ani „len drobnosť“):**

- úvodnú stránku (landing) a ostatné stránky webu: `public/granula/index.html` (okrem sekcie, ktorú vygeneruje build), `podpora.html`, právne stránky (`obchodne-podmienky.html`, `ochrana-sukromia.html`, `reklamacny-poriadok.html`)
- konfigurátor a výpočet: `granule-na-mieru.html`, `kviz.js`, `engine.js`, `admin-vypocet.html`
- dizajn a skripty webu: `granula.css` a všetky `.js` v `granula/`, `img/` mimo `img/blog` a `img/autori`
- nasadenie: `vercel.json`
- `CLAUDE.md` v koreni repozitára a `public/granula/README.md`

Ak by úloha vyžadovala zmenu mimo povoleného rozsahu (napr. „zmeň farbu tlačidla na webe“, „uprav dotazník“), **nič nemeň**. Povedz kolegyni, že to musí urobiť majiteľ projektu, a navrhni presné znenie požiadavky, ktorú mu pošle. Chyby na webe alebo v dotazníku len nahlás.

Pred commitom vždy skontroluj `git status`. Ak je zmenený súbor mimo povoleného rozsahu, vráť ho a zisti prečo.

### Najprv si prečítaj

1. `content/blog/CLAUDE.md`: postup, formát článku, pravidlá GEO, hlas značky, schválené tvrdenia o produkte, fotky.
2. `content/blog/STYL.md`: záväzný štýl a všetok doterajší feedback. **Má prednosť.** Najdôležitejšie: prirodzená slovenčina, nie preklad z angličtiny; krátke vety; technické detaily do poznámok pod čiarou.
3. `content/blog/NAVOD.md`: ako s tebou bude kolegyňa komunikovať.

### Ako spracuješ pokyn

1. **Koncept z námetu:** postup v `blog/CLAUDE.md` (výskum s primárnymi zdrojmi, súbor námetu doplníš a zmeníš na `status: draft`). Pred odovzdaním urob samostatnú **jazykovú korektúru** podľa `STYL.md`: prirodzenosť, krátke vety, bez technikálií v texte, odpovedá na otázku z nadpisu.
2. **Feedback:** rozhodni, či je **všeobecný** (platí pre všetky články) alebo **len k jednému článku**. Všeobecný zapíš do `STYL.md` a uplatni na všetky koncepty. Keď si nie si istý, spýtaj sa. Pri každej úprave článku nastav `updated` na dnešný dátum a pridaj nový **prvý** záznam do `changelog`.
3. **Ručné poznámky v PDF alebo snímky:** prečítaj ich celé. Čo nevieš prečítať, sa spýtaj, nehádaj.
4. **Ponuky:** pri každej úprave skontroluj, či ponuky sedia k téme, nie sú príliš špecifické a sľubujú len to, čo dotazník naozaj robí (`engine.js`).
5. **Obrázky:** ulož ich do scratchpadu a priprav cez `python3 content/blog/foto.py <subor> hero|text|autor …` (postup je v `blog/CLAUDE.md`). Vlož cestu namiesto `placeholder`, uprav alt text podľa toho, čo je naozaj na obrázku, a **do popisu pod obrázkom daj zdroj** („Foto: Meno, fotobanka“ alebo „Ilustrácia vygenerovaná AI“). Keď zdroj nepoznáš, spýtaj sa. Pri malom rozlíšení upozorni. Ak máš k dispozícii nástroj na generovanie obrázkov (napr. Higgsfield) a kolegyňa o to požiada, vygeneruj prirodzene pôsobiaci obrázok podľa popisu v zástupnom rámiku a ukáž jej ho pred osadením.
6. **Autor:** v článku `author: <id>` z registra `content/blog/_autori/`. Nového autora pridaj súborom v `_autori/` (meno, jedna veta, prečo mu veriť, web, štvorcová fotka).
7. **Build a kontrola:** `python3 content/blog/build.py` z koreňa repozitára. CHYBY blokujú publikovanie, upozornenia sa snaž odstrániť. Vypnúť kontrolu (`lint_ignore`) smieš len so súhlasom kolegyne.
8. **Commit a push na `main`.**
9. **Zhrnutie do chatu:** čo si zmenil (podľa názvu článku), odkaz na náhľad `https://www.granula.sk/blog/nahlad/<slug>/`, čo ešte chýba (obrázky, autor) a otázky. Články spomínaj **názvom**, nie kódom.
10. **Publikovanie** len na výslovný pokyn („schvaľujem na publikovanie“): `status: published`, build bez chýb, commit, push. Pošli verejnú adresu `https://www.granula.sk/blog/<slug>/` a pripomeň indexáciu v Google Search Console a Bing Webmaster Tools a distribúciu.

### Pevné pravidlá obsahu

- **Žiadne vymyslené čísla, štúdie, citáty ani recenzie.** Každé číslo má primárny zdroj. Fakty nemeň bez zdroja.
- Tvrdenia o produkte len zo schváleného zoznamu v `blog/CLAUDE.md`. O dotazníku a receptúrach píš len to, čo naozaj je v `engine.js` (čítať smieš, meniť nie).
- Výživa nie je liečba; pri zdravotných problémoch odkáž na veterinára.
- Nové články píš len na výslovný pokyn.

### Aktuálny stav (20. 11. 2026)

- **9 konceptov**, všetky jazykovo prerobené podľa review a s autorkou **MVDr. Marcela Glezgová** (veterinárka, klinika KiraVet v Handlovej):
  - Ako prejsť na nové granule bez hnačky: plán na 7 dní
  - Pes má po nových granulách hnačku: čo robiť a kedy k veterinárovi
  - Pes nechce jesť nové granule: prečo a ako mu pomôcť zvyknúť si
  - Pes sa škriabe a olizuje si labky: môže za to krmivo?
  - Pes má nadváhu? Ako schudne bezpečne a koľko mu dávať
  - Sú obilniny v granulách pre psa zlé? Kedy áno a kedy nie
  - Kukurica v granulách: kedy psovi nevadí a kedy je problém
  - Kuracie mäso v granulách: kedy je v poriadku a kedy sa mu vyhnúť
  - Čerstvé mäso, sušené či múčka: koľko mäsa je naozaj v granulách
- **Čo chýba na publikovanie:** fotka autorky (štvorec, aspoň 400 × 400 px) a skutočné obrázky namiesto zástupných rámikov.
- Autorka by mala texty pred publikovaním prečítať a fakty potvrdiť (odkaz na náhľad).
- **Námety:** ďalších 77 tém je v redakcii pod filtrom „Námety“.
