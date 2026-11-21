# Granula!

Slovenský web pre granule na mieru **Granula!**: úvodná stránka, suroviny, konfigurátor
(dotazník → výsledok → platba), blog, podpora a právne stránky. Next.js (App Router) + Supabase + Stripe + Vercel.

- Web: `public/granula/` (statické HTML) — popis v [public/granula/README.md](public/granula/README.md); URL pravidlá v `lib/site-routes.ts`
- Blog: zdroje v `content/blog/` — pravidlá v [content/blog/CLAUDE.md](content/blog/CLAUDE.md), build `python3 content/blog/build.py`
- Predaj a predplatné: [SPEC.md](SPEC.md), stav v [PROGRESS.md](PROGRESS.md)
- Vývoj: `npm install`, `npm run dev`, `npm test`, `npm run build`; premenné v `.env.example`
