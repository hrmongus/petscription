# Granula!

Slovenský web pre granule na mieru **Granula!**: úvodná stránka, suroviny, konfigurátor
(dotazník → výsledok → platba), blog, podpora a právne stránky.

- Web: `granula/` (statické HTML, bez buildu) — popis v [granula/README.md](granula/README.md)
- Blog: `granula/blog/` — pravidlá v [granula/blog/CLAUDE.md](granula/blog/CLAUDE.md), build `python3 granula/blog/build.py`
- Nasadenie: Vercel, `granula/` sa servíruje z koreňa domény (`vercel.json`), napr. `www.granula.sk/podpora`
