# Visual Identity

The reference points are a **grain sack, a letterpress job ticket, and a good
wine label** — not a pet store. Everything is printed-feeling: hairline rules,
near-square corners, one spot color per surface, generous paper.

## Logo system

| Asset | File | Use |
| --- | --- | --- |
| Primary wordmark | `logo/wordmark.svg` | Default. Anything above 120px wide. |
| Stacked wordmark | `logo/wordmark-stacked.svg` | Square/vertical formats, bag fronts. |
| Roundel | `logo/roundel.svg` | Seals, bag closures, stickers, favicons ≥64px. |
| Monogram | `logo/monogram.svg` | Avatars, embroidery, favicons, scoop stamp. |
| Moon-and-oat mark | `logo/mark-moon.svg` | Bullet, divider, watermark, tiny sizes. |

### Construction
The wordmark is **Instrument Serif** with one intervention: the **ampersand is
set in italic**, one size up. It is the only decorated character in the system —
the joint between the wild half of the name and the pantry half — so it gets the
flourish and nothing else does.

The symbol is a **crescent moon with an oat sprig rising into it**: the two
halves of the name in one shape, and a deliberate refusal of the obvious move.
There is no dog in the logo. The category is full of dog silhouettes and wolf
heads; a moon and a grain say the same thing with more restraint, and they
survive being shrunk. Everything is built on a 200-unit circle — moon centered
at (134, 66) r28, sprig on a 63° axis rising from the lower left into the
crescent's hollow. Ring text runs clockwise from bottom-centre, with a solid
lozenge closing the gap at six o'clock.

### Clear space and minimum size
- **Clear space** = the cap-height of the `H` on all four sides. Nothing enters it.
- **Minimum sizes:** wordmark 120px / 32mm wide · roundel 96px / 26mm ·
  moon mark 40px / 11mm · monogram 24px / 8mm. Below roundel minimum, use the
  moon mark; below that, the monogram. **The monogram is the favicon and the
  app icon** — the ring text turns to mud under 96px, and the sprig loses its
  grains under 40px.

### A production note about the SVGs
The files carry **live type**, not outlines, so the wordmark and ring text stay
editable. Two consequences: inline the SVG (`<svg>` in the document) rather than
referencing it through `<img src="…">`, because an `<img>`-loaded SVG cannot
fetch external webfonts and will silently fall back to system mono; and convert
type to outlines before sending anything to print.

### Ten things not to do
1. Don't set the ampersand upright, or in a different face.
2. Don't stretch, condense, or re-space the wordmark. Use the stacked lockup.
3. Don't outline, emboss, drop-shadow, or gradient any mark.
4. Don't put the wordmark on a photo without a flat panel behind it.
5. Don't recolor outside the palette. Ember, loden, ink, oatmilk, kraft. That's it.
6. Don't put the descriptor line in anything but Archivo Narrow, uppercase, tracked.
7. Don't rotate the roundel to "make it playful."
8. Don't add a paw print. Ever.
9. Don't lock the wordmark to a photo of a dog looking soulful into the middle distance.
10. Don't put the mark inside another shape (badge-in-a-badge).

## Color

Grounds do the heavy lifting; accents are rationed to roughly **one accent per
surface**. The default page is Ink on Oat Milk with Loden for structure.

| Token | Hex | Role |
| --- | --- | --- |
| Oat Milk | `#F4EBDC` | Primary ground. The brand's "white". |
| Bone | `#FBF8F2` | Raised surface, cards, paper stock. |
| Kraft | `#D9C3A5` | Packaging stock, secondary panels. |
| Ink | `#17150F` | All primary type. |
| Loden | `#37503F` | House color. Structure, seals, No. 01. |
| Ember | `#C25A2B` | Display and spot ink only — 3.71:1, fails body text. |
| Ember Ink | `#9E4420` | The text-safe ember. Use this for anything under 24px. |
| Turmeric | `#E3A83C` | Fills, highlights, batch stamps. Never type on light. |
| Dusk | `#455565` | Cool counterweight. No. 03. |

Every ratio above is computed, not estimated. Ember has two values on purpose:
the beautiful one for print and headlines, the darker one for anything a person
has to actually read.

### Product color coding
Each recipe owns one accent, which is the *only* accent on that bag.
`01 Loden · 02 Ember · 03 Dusk · 04 Ink+Turmeric · 05 Turmeric · 06 Kraft+Loden`

## Typography

| Role | Face | Rules |
| --- | --- | --- |
| Display | **Instrument Serif** (roman + italic) | Never below 24px. Tracking −0.02em. Sentence case for headlines; the wordmark is the only all-caps display setting. |
| Text | **Archivo** 400/500/600/700 | Body 18px/1.55, measure capped at 68 characters. A grotesque built for print — it holds up at 8pt on kraft, which is where most of our type lives. |
| Label | **Archivo Narrow** 600 | ALWAYS uppercase, +0.12em tracking. Nav, buttons, table heads, ingredient decks, legal. |
| Variable data | **Courier Prime** | **Reserved.** Batch numbers, mill dates, run sizes, best-by — anything that changes from one run to the next, and nothing else. |

That last rule is the typographic idea of the whole system: the typewriter face
is the tell that a human inked something for *this* run. Spend it on a section
heading and it stops meaning anything.

Three faces plus one narrow cut, four jobs, no overlap. If a piece of type
doesn't obviously belong to one of the four, it's decoration — cut it.

Scale: 1.333 from an 18px base — 12.5 · 15 · 18 · 24 · 42.6 · 75.8 · 134.6.
Skipping a step is fine. Inventing one is not.

## Layout and form
- **Grid:** 12 columns, 24px gutters, 168px max side margin. Text sits in 7.
- **Corners:** 2px. Effectively square. The pill radius exists only for batch
  chips and stamps.
- **Rules:** 1px hairlines in `--ho-rule` do the separating. No card shadows —
  elevation is a border and a change of ground, never a blur.
- **Whitespace is the luxury signal.** When a layout feels wrong, the answer is
  almost always more space above the heading, not a bigger heading.

## Photography and illustration
**Do:** raking daylight, one window, real countertops. Grain in the frame — a
scoop, a jar, the actual oats. Dogs photographed as they are: mid-yawn, asleep
on a vent, unimpressed. Bags with wear on them.

**Don't:** studio seamless. Wet-nose macro. A dog in a bandana. Anything shot
from below to make a labrador look majestic. Motion blur of a dog "living life."

**Illustration:** single-weight (1.5pt at 100%) line drawings in ink or loden —
oat stalks, scoops, mill diagrams, a moon. Botanical-plate register, not
cartoon. Never illustrate the dog's face; illustrate its ears, its shadow, its
paws under a door.
