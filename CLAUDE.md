# Petscription / Granula

Aktuálny web je v `granula/` (statické HTML, bez buildu; popis v `granula/README.md`). Nasadenie: Vercel servíruje `granula/` z koreňa domény cez rewrite vo `vercel.json` (`granula.sk/podpora` = `granula/podpora.html`, `cleanUrls`); staré adresy `/granula/...` sa natrvalo presmerujú.

- **Blog:** pred akoukoľvek prácou na článkoch si prečítaj `granula/blog/CLAUDE.md`. Články sú v `granula/blog/_src/*.md`, HTML generuje `python3 granula/blog/build.py` (vygenerované súbory sa needitujú ručne).
- Dizajn: Granula Design System (identita v2), zhrnuté v `granula/README.md` (časť Systém).
