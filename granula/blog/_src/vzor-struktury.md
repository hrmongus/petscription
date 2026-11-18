---
# VZOROVÝ KONCEPT na otestovanie redakcie a šablóny. Obsah sú zástupné texty, nie fakty.
# Po napísaní prvého skutočného článku tento súbor zmaž.
title: "Vzor štruktúry článku – ako vyzerá článok pre AI citácie"
slug: vzor-struktury
status: draft
example: true
description: "Vzorový koncept, ktorý ukazuje rozloženie článku: krátka odpoveď, definícia, sekcie s otázkami, tabuľka, postup, časté otázky a zdroje."
author: "[Meno autora]"
author_bio: "[1 veta, prečo mu veriť]"
author_photo: placeholder
hero: img/hero-jack-russell.jpg
hero_alt: "Jack russell teriér na lúke"
hero_caption: "Vzor: hero obrázok z existujúcej fotky webu."
cta_title: "Vzor: záverečná ponuka k téme článku"
cta_text: "Text záverečnej ponuky sa píše ku každému článku zvlášť cez polia cta_title, cta_text a cta_button."
cta_button: "Nájdi granule pre svojho psa"
published: 2026-11-18
updated: 2026-11-18
tldr: >
  Vzorový článok ukazuje rozloženie, ktoré AI vyhľadávače citujú najčastejšie: priamu odpoveď v prvých 60 slovách,
  3 až 6 sekcií s nadpisom v tvare otázky, aspoň 1 číslo v každej sekcii, porovnávaciu tabuľku a zdroje.
  Text je zástupný, slúži len na kontrolu šablóny a redakcie.
key_points:
  - "Krátka odpoveď má 40–60 slov a začína priamou odpoveďou"
  - "Každá sekcia má 200–400 slov a aspoň 1 číslo so zdrojom"
  - "Aspoň 3 zdroje s odkazom na primárny zdroj"
  - "Najčastejšia chyba: dlhý úvod namiesto odpovede"
changelog:
  - "2026-11-18: Vzorový koncept"
sources:
  - "GEO: Generative Engine Optimization – Aggarwal a kol., KDD 2024 | https://arxiv.org/abs/2311.09735"
  - "[Zástupný zdroj – vydavateľ, rok] | https://example.com/zdroj-2"
  - "[Zástupný zdroj – vydavateľ, rok] | https://example.com/zdroj-3"
---

## Čo je vzorový článok?

**Vzorový článok je zástupný koncept, ktorý ukazuje rozloženie článku pre AI citácie.** Nemá skutočný obsah. Slúži na kontrolu, ako šablóna vyzerá na webe a ako ju hodnotí redakcia.

![Majiteľ odváži dennú dávku granúl na kuchynskej váhe, vedľa sedí pes strednej veľkosti](placeholder "Vzor: zástupný obrázok. Alt text hovorí, čo má byť na fotke.")

## Ako vyzerá sekcia, ktorú AI dokáže citovať?

**Sekcia, ktorú AI dokáže citovať, začína tučnou vetou s odpoveďou na nadpis.** Za ňou nasleduje vysvetlenie, dôkaz a príklad. Zástupný text: podľa [zdroj, rok] tvorí 44 % citácií text z prvých 30 % článku. Sekcia má mať 200 až 400 slov, preto tu redakcia ukáže upozornenie na dĺžku.

::: graf
nazov: Vzor grafu (zástupné čísla, nie fakty)
jednotka: %
os: Časť článku
zdroj: zástupný zdroj
zvyraznit: Prvých 30 %
Prvých 30 % | 44
Stred článku | 31
Záver článku | 25
:::

::: ponuka
nadpis: Vzor: ponuka, ktorá nadväzuje na sekciu
text: V skutočnom článku tu bude 1–2 vety o tom, ako Granula rieši práve túto tému, napríklad dávku na gramy.
tlacidlo: Spočítaj dávku pre svojho psa
obrazok: img/produkty/hovadzie-s-ryzou.webp
:::

## Šablóna A vs šablóna B: porovnanie

**Šablóna A je vhodnejšia pre články s jednou hlavnou otázkou.**

| Kritérium | Šablóna A | Šablóna B |
| --- | --- | --- |
| Pre koho | jedna otázka | viac otázok |
| Hlavná výhoda | rýchla odpoveď | širší záber |
| Verdikt | odporúčaná | len výnimočne |

Šablóna A vyhráva pri úzko zameranej téme.

## Ako napísať článok: 3 kroky

**Článok vznikne v 3 krokoch: výskum, koncept a kontrola v redakcii.**

1. **Skopíruj šablónu.** Súbor _template.md premenuj na slug článku.
2. **Vyplň polia.** Krátka odpoveď, kľúčové body, zdroje a sekcie.
3. **Spusti build.** Príkaz python3 granula/blog/build.py ukáže chyby a upozornenia.

## Časté otázky

**Môže byť článok kratší ako 1 000 slov?** Áno. Podľa analýzy citácií má 53 % citovaných stránok menej ako 1 000 slov.

**Treba schema markup?** Nie ako GEO páku. Build ho pridáva len ako SEO hygienu.

**Kde vidím náhľad?** V redakcii na adrese /granula/admin-blog/.

## Zhrnutie

- Vzor ukazuje rozloženie, nie obsah.
- Skutočný článok musí prejsť kontrolou bez chýb.
- Po prvom skutočnom článku tento vzor zmaž.
