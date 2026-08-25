<!-- Howl & Oats — brand system -->

# HOWL & OATS
### *Dinner you could read out loud.*

A complete brand for a modern, small-batch dog kibble: strategy, name, voice,
identity, packaging and rollout. Cold-pressed, batch-dated, **grain-positive** —
built as the deliberate opposite of both the vet-clinical white bag and the
wolf-on-a-black-bag fantasy.

> We mill in runs of 400 kilos, which is not efficient. We put a date on every
> bag, which is not required. We name the farm that rolled the oats, which
> nobody asked us to do. Your dog does not care about any of this. Your dog
> would eat a shoe. We do it anyway. Someone in this relationship should be
> paying attention.

---

## Contents

| File | What's in it |
| --- | --- |
| [`brand/01-strategy.md`](brand/01-strategy.md) | The gap in the category, positioning, audience, the four pillars, and the proof behind each |
| [`brand/02-verbal-identity.md`](brand/02-verbal-identity.md) | Name rationale, tagline, five voice rules, word list, manifesto, live copy examples |
| [`brand/03-visual-identity.md`](brand/03-visual-identity.md) | Logo system, clear space, color with measured contrast, type rules, layout, photography |
| [`brand/04-product-line.md`](brand/04-product-line.md) | Naming architecture, the core six recipes, limited runs, sizes, subscription |
| [`brand/05-packaging.md`](brand/05-packaging.md) | The pouch, panel-by-panel layout, the stamp block, print spec, the wider kit |
| [`brand/06-applications.md`](brand/06-applications.md) | Web, retail, social, email, vet channel, and a twelve-month rollout |

## Assets

```
brand/logo/     roundel · wordmark · wordmark-stacked · monogram · mark-moon   (SVG)
brand/tokens/   tokens.css (custom properties, light + dark) · tokens.json
brand/preview/  contact-sheet.html + build.py — regenerates the sheet from the SVGs
```

**Color** — Oat Milk `#F4EBDC` · Kraft `#D9C3A5` · Ink `#17150F` ·
Loden `#37503F` · Ember `#C25A2B` / `#9E4420` · Turmeric `#E3A83C` · Dusk `#455565`.
Every contrast ratio quoted in the docs is computed, not estimated; Ember ships
in two values because the beautiful one fails body-text contrast and the darker
one doesn't.

**Type** — Instrument Serif (display) · Space Grotesk (text) · Space Mono (spec).
All three are open-licence and available from Google Fonts.

## Working with the SVGs

They carry live type rather than outlines, so the wordmark stays editable. Two
consequences:

- **Inline them.** An SVG loaded through `<img src="…">` cannot fetch external
  webfonts and will silently fall back to system mono — which is exactly what
  the ring text is sized against.
- **Outline before print.**

```sh
python3 brand/preview/build.py   # rebuild the contact sheet after editing any SVG
```
