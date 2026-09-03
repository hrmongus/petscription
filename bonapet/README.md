# Bonapet — landing page

Slovenská landing page pre značku **Bonapet** (granule pre psov). Jeden
samostatný súbor: `index.html`.

## Smerovanie
Prémiová, pokojná stránka v štýle dizajnového štúdia: serifová typografia,
veľa priestoru, produktové vizuály renderované v canvase (makro granúl
s hĺbkou ostrosti a filmovým zrnom), realistický mockup balenia a jemný,
plynulý pohyb. Žiadne kreslené ilustrácie psov — predchádzajúce hravé aj
„bežiaci pes“ verzie boli zamietnuté ako lacné.

## Systém

| Vrstva | Hodnoty |
| --- | --- |
| Podklad | slonovina `#F7F2E9`, karty `#FFFDF9`, linky `#E3DBCC` |
| Text | `#24201A`, tlmený `#6B6459` |
| Značková zelená | hlboká píniová `#24503B` — primárne tlačidlá, pásy, ilustračné linky |
| Akcent | medená `#9C5624` (eyebrow texty), okrová `#D9A441` (detaily, hviezdy) |
| Písmo | Instrument Serif (titulky) · Hanken Grotesk (text, labely) |

Pozn.: v tomto prostredí sa z Google Fonts reálne načítajú len niektoré rodiny —
Instrument Serif a Hanken Grotesk sú overené vrátane slovenskej diakritiky
(ľ ĺ ŕ ď ť ň ô ä). Playfair, Lora, Fraunces a ďalšie serify padali na fallback.

Stránka je zámerne **jednotematická (svetlá)**. Nemá tmavý režim, každá farba je
vypísaná explicitne, takže drží na akomkoľvek podklade.

## Kvízový funnel
Všetky oranžové CTA („Nájsť jedlo…", „Chcem takéto granule…") otvárajú
trojkrokový dotazník (`data-funnel`):

1. **Spoznajme sa** — meno, pohlavie (podmienený reprodukčný stav podľa vetvy),
   vek s prepínačom roky/mesiace, veľkosť plemena.
2. **Telo a energia** — váha, postavička, aktivita.
3. **Zdravie a výber** — multi-select priority, alergie (pri „Áno" textové pole).

Po odoslaní beží ~3 s obrazovka „Miešame recept…" (napĺňajúce sa vrece +
padajúce suroviny) a výsledok priradí variant v poradí pravidiel:
**Štart** (< 1 rok) → **Senior** (≥ 7 rokov) → **Sensitive** (alergie alebo
priorita trávenie) → **Active** (športovec alebo priorita energia) → **Adult**.
Výsledok zobrazí 6 základných surovín + 2 extra podľa variantu; pri Adult
všetkých 8 základných.

Reprodukčný stav sa zatiaľ len ukladá — do logiky receptu nie je zapojený
(zámer podľa zadania). Meno má fallback „tvoj parťák" / „Tvoj chlpáč".

## Čo treba doplniť pred spustením
1. **Fotky.** Sekcie s prerušovaným rámčekom sú pripravené sloty — pomer strán
   a popis požadovaného záberu sú priamo v nich.
2. **Recenzie.** Karty v sekcii Referencie sú prázdne zámerne. Vymyslené
   hodnotenia = klamlivá reklama.
3. **Číslo `[X]`** v nadpise referencií a hodnotenie **4,9/5** v hero sekcii
   treba nahradiť reálnymi dátami.
4. **Odpovede v FAQ** sú návrh — treba ich odsúhlasiť, najmä tvrdenia
   o výrobcovi a o zložení.

## Pohyb a interakcie
- scroll-reveal cez IntersectionObserver (`[data-reveal]`, stagger cez `--d`),
- hero: slovo po slove odkrývaný titulok, plávajúce balenie s parallax tiltom
  podľa kurzora (len desktop s hover), header sa po scrolle zhutní a rozmaže pozadie,
- nekonečné marquee surovín (pauza na hover), sticky ľavý stĺpec v sekcii Zloženie,
- porovnanie „čo je v miske“ ako before/after slider v kruhu (drag, klávesy ←→,
  jemný úvodný sweep pri objavení),
- časová os s dokresľujúcou sa linkou, FAQ akordeón cez `grid-template-rows`,
- všetko rešpektuje `prefers-reduced-motion`.

## Vizuály
Všetky sú generované v `<script>`: `kibble()` renderuje makro granúl (tienené
matné elipsoidy v troch vrstvách hĺbky ostrosti, kontaktné tiene, zrno) v dvoch
paletách — bohatá Bonapet a fádna „bežné granule“; `packSvg()` kreslí balenie
s gradientovým tvarom, monogramom B a receptúrou (aj kompaktný variant pre kvíz).
