/* vygenerované build.py — needitovať */
window.GRANULA_POSTS = {
 "built": "2026-11-18 08:12",
 "base": "https://granula.sk/granula",
 "problems": [],
 "posts": [
  {
   "slug": "vzor-struktury",
   "file": "granula/blog/_src/vzor-struktury.md",
   "title": "Vzor štruktúry článku – ako vyzerá článok pre AI citácie",
   "status": "draft",
   "wanted": "draft",
   "example": true,
   "published": "2026-11-18",
   "updated": "2026-11-18",
   "author": "[Meno autora]",
   "words": 263,
   "description": "Vzorový koncept, ktorý ukazuje rozloženie článku: krátka odpoveď, definícia, sekcie s otázkami, tabuľka, postup, časté otázky a zdroje.",
   "preview": "../blog/nahlad/vzor-struktury/index.html",
   "live": null,
   "lint": [
    {
     "id": "title",
     "level": "error",
     "ok": true,
     "msg": "Titulok je vyplnený",
     "details": []
    },
    {
     "id": "title-length",
     "level": "warn",
     "ok": true,
     "msg": "Titulok má najviac 70 znakov (má 56)",
     "details": []
    },
    {
     "id": "title-year",
     "level": "warn",
     "ok": true,
     "msg": "Rok v titulku len pri téme, ktorá sa mení, a len ak sedí s dátumom aktualizácie",
     "details": []
    },
    {
     "id": "description",
     "level": "warn",
     "ok": true,
     "msg": "Meta popis má 120–160 znakov (má 135)",
     "details": []
    },
    {
     "id": "author",
     "level": "error",
     "ok": true,
     "msg": "Autor a jedna veta, prečo mu veriť (author, author_bio)",
     "details": []
    },
    {
     "id": "dates",
     "level": "error",
     "ok": true,
     "msg": "Dátumy published a updated (RRRR-MM-DD), updated ≥ published",
     "details": []
    },
    {
     "id": "changelog",
     "level": "warn",
     "ok": true,
     "msg": "Viditeľný changelog: prvý záznam má dátum aktualizácie",
     "details": [
      "2026-11-18: Vzorový koncept"
     ]
    },
    {
     "id": "tldr",
     "level": "error",
     "ok": true,
     "msg": "Krátka odpoveď (tldr) má 40–60 slov (má 44)",
     "details": []
    },
    {
     "id": "tldr-range",
     "level": "warn",
     "ok": true,
     "msg": "Krátka odpoveď presne v rozsahu 40–60 slov (má 44)",
     "details": []
    },
    {
     "id": "tldr-intro",
     "level": "error",
     "ok": true,
     "msg": "Krátka odpoveď začína priamou odpoveďou, nie úvodom („v tomto článku…“)",
     "details": []
    },
    {
     "id": "key-points",
     "level": "error",
     "ok": true,
     "msg": "Aspoň 3 kľúčové body (má 4)",
     "details": []
    },
    {
     "id": "tldr-numbers",
     "level": "warn",
     "ok": true,
     "msg": "Krátka odpoveď a kľúčové body obsahujú aspoň 3 čísla (majú 10)",
     "details": []
    },
    {
     "id": "definition",
     "level": "warn",
     "ok": true,
     "msg": "Sekcia „Čo je …?“ s definíciou vo forme „X je Y, ktoré Z“",
     "details": []
    },
    {
     "id": "sections",
     "level": "warn",
     "ok": true,
     "msg": "3–6 hlavných sekcií (má 3)",
     "details": []
    },
    {
     "id": "h2-questions",
     "level": "warn",
     "ok": true,
     "msg": "Aspoň polovica nadpisov H2 sú otázky (2 z 4)",
     "details": [
      "Šablóna A vs šablóna B: porovnanie",
      "Ako napísať článok: 3 kroky"
     ]
    },
    {
     "id": "section-length",
     "level": "warn",
     "ok": false,
     "msg": "Hlavné sekcie majú 200–400 slov",
     "details": [
      "Ako vyzerá sekcia, ktorú AI dokáže citovať?: 48 slov",
      "Šablóna A vs šablóna B: porovnanie: 38 slov",
      "Ako napísať článok: 3 kroky: 41 slov"
     ]
    },
    {
     "id": "first-sentence",
     "level": "warn",
     "ok": true,
     "msg": "Každá sekcia začína tučnou prvou vetou = odpoveď na nadpis",
     "details": []
    },
    {
     "id": "section-numbers",
     "level": "warn",
     "ok": false,
     "msg": "Každá hlavná sekcia má aspoň 1 číslo (ideálne so zdrojom)",
     "details": [
      "Šablóna A vs šablóna B: porovnanie"
     ]
    },
    {
     "id": "standalone",
     "level": "warn",
     "ok": true,
     "msg": "Sekcie obstoja samy (žiadne „vyššie“, „ako sme spomenuli“, odsek začínajúci „Toto/To“)",
     "details": []
    },
    {
     "id": "table",
     "level": "info",
     "ok": true,
     "msg": "Porovnávacia tabuľka (odporúčané pri „X vs Y“)",
     "details": []
    },
    {
     "id": "steps",
     "level": "info",
     "ok": true,
     "msg": "Postup krok za krokom (číslovaný zoznam)",
     "details": []
    },
    {
     "id": "own-data",
     "level": "info",
     "ok": false,
     "msg": "Vlastné dáta alebo skúsenosť (najväčší diferenciátor)",
     "details": []
    },
    {
     "id": "faq",
     "level": "warn",
     "ok": true,
     "msg": "Časté otázky: 3–6 otázok v tvare **Otázka?** odpoveď, odpoveď najviac 3 vety (má 3)",
     "details": []
    },
    {
     "id": "summary",
     "level": "warn",
     "ok": true,
     "msg": "Sekcia „Zhrnutie“ ako zoznam (hlavný záver, kedy áno/nie, ďalší krok)",
     "details": []
    },
    {
     "id": "sources",
     "level": "error",
     "ok": true,
     "msg": "Aspoň 3 zdroje s URL (má 3)",
     "details": []
    },
    {
     "id": "sources-format",
     "level": "warn",
     "ok": true,
     "msg": "Každý zdroj v tvare „Názov – vydavateľ, rok | https://…“",
     "details": []
    },
    {
     "id": "first-third",
     "level": "info",
     "ok": true,
     "msg": "Kľúčové fakty (čísla) sú v prvej tretine textu",
     "details": []
    },
    {
     "id": "atomic",
     "level": "info",
     "ok": true,
     "msg": "Atomické fakty: vety so 6–20 slovami a číslom (má 6)",
     "details": []
    },
    {
     "id": "self-promo",
     "level": "warn",
     "ok": true,
     "msg": "„Najlepšie X“ len s transparentnou metodikou a bez Granuly na prvom mieste",
     "details": []
    },
    {
     "id": "claims",
     "level": "warn",
     "ok": true,
     "msg": "Žiadne vyradené tvrdenia a superlatívy z dizajn systému",
     "details": []
    },
    {
     "id": "ty-form",
     "level": "warn",
     "ok": true,
     "msg": "Tykanie („tvoj pes“), nie vykanie",
     "details": []
    },
    {
     "id": "emoji",
     "level": "warn",
     "ok": true,
     "msg": "Bez emoji",
     "details": []
    },
    {
     "id": "length",
     "level": "info",
     "ok": true,
     "msg": "Dĺžka článku: 263 slov (dĺžka nerozhoduje, hustota áno)",
     "details": []
    }
   ],
   "sections": [
    {
     "title": "Čo je vzorový článok?",
     "kind": "definition",
     "words": 28,
     "numbers": 0,
     "question": true,
     "firstBold": true,
     "table": false,
     "steps": false
    },
    {
     "title": "Ako vyzerá sekcia, ktorú AI dokáže citovať?",
     "kind": "main",
     "words": 48,
     "numbers": 4,
     "question": true,
     "firstBold": true,
     "table": false,
     "steps": false
    },
    {
     "title": "Šablóna A vs šablóna B: porovnanie",
     "kind": "main",
     "words": 38,
     "numbers": 0,
     "question": false,
     "firstBold": true,
     "table": true,
     "steps": false
    },
    {
     "title": "Ako napísať článok: 3 kroky",
     "kind": "main",
     "words": 41,
     "numbers": 2,
     "question": false,
     "firstBold": true,
     "table": false,
     "steps": true
    },
    {
     "title": "Časté otázky",
     "kind": "faq",
     "words": 45,
     "numbers": 5,
     "question": false,
     "firstBold": true,
     "table": false,
     "steps": false
    },
    {
     "title": "Zhrnutie",
     "kind": "summary",
     "words": 19,
     "numbers": 0,
     "question": false,
     "firstBold": false,
     "table": false,
     "steps": false
    }
   ]
  }
 ]
};
