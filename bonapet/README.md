# Bonapet — landing page

Slovenská landing page pre značku **Bonapet** (granule pre psov). Jeden
samostatný súbor: `index.html`.

## Smerovanie
Prémiové a pokojné, no stále svetlé a priateľské — medzi tmavou „vlčou“
estetikou kategórie a detskou hravosťou. Serifové titulky, tlmená paleta,
jemné ilustrácie psov v medailónoch a mockup balenia ako hero vizuál.
(Prvá, hravejšia verzia bola zamietnutá ako príliš lacná.)

**Predchádzajúci koncept „Howl & Oats“** (priečinok `brand/`) bol zamietnutý ako
príliš hipsterský. Ostáva v repozitári len ako archív.

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

## Scrollová animácia psa
V spodnej časti viewportu beží pes poháňaný scrollom (`#dogStage`):

- pozícia psa zodpovedá priebehu stránky (0 % = vľavo, 100 % = pri miske vpravo),
- kĺbová SVG bábka (4 nohy, hlava, ucho, chvost) s cvalovým cyklom viazaným na
  rýchlosť pohybu; pri scrolle nahor sa otočí a beží späť,
- v strednej časti stránky naháňa skákajúcu loptičku, v 46 % šírky preskočí
  kostičku (gaussov oblúk podľa vzdialenosti), pri konci stránky dobehne
  k miske a žerie (hlava dole, vrtí chvostom),
- keď scroll zastane, pes zastane a prejde do idle (dýchanie, vrtenie),
- `prefers-reduced-motion: reduce` animáciu úplne skryje; vrstva má
  `pointer-events:none`, `aria-hidden` a z-index pod funnelom aj headerom,
- deterministický hák na testovanie: `window.__dogSettle(p, frames)` +
  `window.__dogNoLoop`.

## Ilustrácie
Všetky ilustrácie sú SVG generované v `<script>` na konci súboru: psy
(`dog()`, tri plemená), ikony pilierov, ikony surovín a rozdelená miska
(`#bowl`). Miska sa kreslí deterministicky — rovnaké granule pri každom načítaní.
