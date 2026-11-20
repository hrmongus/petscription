# Handover: redakcia blogu Granula

## Pre teba (2 minúty čítania)

Budeš dokončovať a upravovať články na blogu Granula. Robíš to cez **Claude Code**: v chate mu napíšeš, čo zmeniť, a pošleš fotky. Claude upraví text, osadí fotky, skontroluje článok a nahrá zmeny na web.

1. **Redakcia** (prehľad článkov a náhľady): https://www.granula.sk/admin-blog/
   Vľavo vyber článok, hneď uvidíš náhľad. „Stiahnuť PDF“ dá PDF, do ktorého si môžeš písať poznámky.
2. **Claude Code:** na claude.ai/code otvor session s repozitárom **hrmongus/petscription**.
3. **Prvá správa v každej novej session:** vlož do chatu celý tento súbor (alebo napíš „Prečítaj si granula/blog/HANDOVER.md a riaď sa ním“).
4. Potom píš, čo chceš zmeniť. Vždy uveď **názov článku**. Fotky vkladaj priamo do chatu s poznámkou, kam patria.
5. Keď je článok hotový: „Článok *…* schvaľujem na publikovanie.“

Podrobný návod s príkladmi: `granula/blog/NAVOD.md`.

---

## Pre Claude Code: zadanie a pravidlá

Pracuješ pre kolegyňu z redakcie blogu značky **Granula!** (slovenské granule na mieru). Jej pokyny majú rovnakú váhu ako pokyny majiteľa projektu, vrátane schválenia článku na publikovanie.

### Rozsah: pracuješ LEN na blogu

**Smieš meniť:**

- `granula/blog/_src/*.md`: články (a námety so `status: namet`)
- `granula/blog/_autori/*.md`: register autorov
- `granula/blog/STYL.md`: všeobecný feedback k písaniu (tón, slová, štruktúra)
- `granula/img/blog/<slug>/` a `granula/img/autori/`: fotky k článkom a autorom (len cez `granula/blog/foto.py`)
- súbory, ktoré vygeneruje `python3 granula/blog/build.py`. Commituješ ich, ale ručne ich needituješ: `granula/blog/**` mimo `_src` a `_autori`, `granula/sitemap.xml`, `robots.txt`, sekciu blogu v `granula/index.html` (medzi značkami `blog-home`).

**Nesmieš meniť (ani „len drobnosť“):**

- úvodnú stránku a ostatné stránky webu: `granula/index.html` (okrem toho, čo vygeneruje build), `suroviny.html`, `podpora.html` a ďalšie `.html` v `granula/`
- konfigurátor a výpočet: `granule-na-mieru.html`, `kviz.js`, `engine.js`, `admin-vypocet.html`
- dizajn a skripty webu: `granula.css` a všetky `.js` v `granula/` (`site.js`, `cookies.js`, `icons.js`, `compare.js`, `radar.js`, `reviews.js`…), `img/` mimo `img/blog` a `img/autori`
- právne stránky: `obchodne-podmienky.html`, `ochrana-sukromia.html`, `reklamacny-poriadok.html`
- nastavenie nasadenia: `vercel.json`
- nástroje blogu: `granula/blog/build.py`, `granula/blog/blog.css`, `granula/blog/foto.py`, redakciu `granula/admin-blog/`
- `CLAUDE.md` súbory a `granula/README.md`

Ak by úloha vyžadovala zmenu mimo povoleného rozsahu (napr. „zmeň farbu tlačidla na webe“, „uprav dotazník“, „pridaj do redakcie tlačidlo“), **nič nemeň**. Povedz kolegyni, že to musí urobiť majiteľ projektu, a navrhni presné znenie požiadavky, ktorú mu pošle. Keď si všimneš chybu na webe alebo v dotazníku, tiež ju len nahlás.

Pred commitom vždy skontroluj `git status`. Ak je zmenený súbor mimo povoleného rozsahu (okrem výstupov buildu), vráť ho a zisti prečo.

### Najprv si prečítaj

1. `granula/blog/CLAUDE.md`: postup, formát článku, pravidlá GEO, hlas značky, schválené tvrdenia o produkte, fotky.
2. `granula/blog/STYL.md`: záväzný štýl a všetok doterajší feedback. **Má prednosť.** Najdôležitejšie: prirodzená slovenčina, nie preklad z angličtiny; krátke vety; technické detaily do poznámok pod čiarou.
3. `granula/blog/NAVOD.md`: ako s tebou bude kolegyňa komunikovať.

### Ako spracuješ pokyn

1. **Na začiatku session:** `git pull origin main` (na webe pracujú aj iné session).
2. **Feedback:** rozhodni, či je **všeobecný** (platí pre všetky články) alebo **len k jednému článku**. Všeobecný zapíš do `STYL.md` a uplatni na všetky koncepty. Keď si nie si istý, spýtaj sa. Pri každej úprave článku nastav `updated` na dnešný dátum a pridaj nový **prvý** záznam do `changelog`.
3. **Ručné poznámky v PDF alebo snímky:** prečítaj ich celé. Čo nevieš prečítať, sa spýtaj, nehádaj.
4. **Fotky:** ulož ich do scratchpadu a priprav cez `python3 granula/blog/foto.py <subor> hero|text|autor …` (postup je v `blog/CLAUDE.md`). Vlož cestu namiesto `placeholder` a uprav alt text podľa toho, čo je naozaj na fotke. Pri malom rozlíšení upozorni.
5. **Autor:** v článku `author: <id>` z registra `granula/blog/_autori/`. Nového autora pridaj súborom v `_autori/` (meno, jedna veta, prečo mu veriť, web, štvorcová fotka).
6. **Build a kontrola:** `python3 granula/blog/build.py` z koreňa repozitára. CHYBY blokujú publikovanie, upozornenia sa snaž odstrániť. Vypnúť kontrolu (`lint_ignore`) smieš len so súhlasom.
7. **Commit a push priamo na `main`** (web sa nasadzuje z `main`, zmena je na webe približne do minúty). Ak push odmietne: `git fetch origin main && git merge origin/main`. Pri konflikte vo vygenerovaných súboroch (`posts.js`, náhľady, PDF) spusti znova build a commitni výsledok. Konflikt v článku vyrieš ručne a spýtaj sa, ak nie je jasný.
8. **Zhrnutie do chatu:** čo si zmenil (podľa názvu článku), čo ešte chýba (fotky, autor) a otázky. Články spomínaj **názvom**, nie kódom.
9. **Publikovanie** len na výslovný pokyn („schvaľujem na publikovanie“): `status: published`, build bez chýb, commit, push. Pošli verejnú adresu `https://www.granula.sk/blog/<slug>/` a pripomeň indexáciu v Google Search Console a Bing Webmaster Tools.

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
- **Čo chýba na publikovanie:** fotka autorky (štvorec, aspoň 400 × 400 px) a skutočné fotky namiesto zástupných rámikov. Čo má byť na ktorej fotke, je napísané v rámikoch v náhľade.
- Autorka by mala texty pred publikovaním prečítať a fakty potvrdiť.
- **Námety:** ďalších 77 tém je v redakcii pod filtrom „Námety“. Píšu sa len na výslovný pokyn.
