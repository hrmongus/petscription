# Bonapet — landing page

Slovenská landing page pre značku **Bonapet** (granule pre psov). Jeden
samostatný súbor: `index.html`.

## Smerovanie
Svetlé, teplé a hravé — zámerne opak tmavej „vlčej“ estetiky, ktorú používa
väčšina prémiových značiek krmív. Vlastná identita: kreslené ilustrácie psov,
guľaté tvary, sýte farby.

**Predchádzajúci koncept „Howl & Oats“** (priečinok `brand/`) bol zamietnutý ako
príliš hipsterský. Ostáva v repozitári len ako archív.

## Systém

| Vrstva | Hodnoty |
| --- | --- |
| Podklad | krémová `#FFF7EC`, biele karty `#FFFFFF` |
| Text | `#2A211A`, tlmený `#6E655C` |
| Značková zelená | `#1A6B43` (biely text na nej 6,51:1) |
| CTA oranžová | `#EE6C2B` s tmavým textom `#2A211A` (5,12:1) |
| Medová | `#F5B92E` — plochy a zvýraznenia, nikdy text na svetlom |
| Písmo | Bricolage Grotesque (nadpisy) · Figtree (text) |

Všetky kontrastné pomery sú vypočítané. Biely text na oranžovej má len 3,08:1,
preto má primárne tlačidlo tmavý text — nie biely.

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

## Ilustrácie
Všetky ilustrácie sú SVG generované v `<script>` na konci súboru: psy
(`dog()`, tri plemená), ikony pilierov, ikony surovín a rozdelená miska
(`#bowl`). Miska sa kreslí deterministicky — rovnaké granule pri každom načítaní.
