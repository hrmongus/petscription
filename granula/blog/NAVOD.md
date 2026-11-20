# Ako dokončiť článok na blogu Granula (návod pre redakciu)

Články píše a upravuje Claude Code. Ty mu v chate povieš, čo zmeniť, a pošleš fotky. On upraví text, osadí fotky, skontroluje článok a nahrá zmeny na web.

## 1. Pozri si článok

- Redakcia: **https://www.granula.sk/admin-blog/**
- Vľavo vyber článok. Hneď uvidíš náhľad. Tlačidlo **Stiahnuť PDF** dá PDF, do ktorého si môžeš písať poznámky (napr. na iPade perom).
- Kontrola, sekcie a ručný checklist sú dole zbalené. Netreba ich otvárať, ak nechceš.

## 2. Otvor Claude Code

- Na claude.ai/code otvor novú session s repozitárom **hrmongus/petscription**.
- Prvá správa (stačí raz za session):

  > Pracuješ na blogu Granula. Prečítaj si granula/blog/CLAUDE.md, granula/blog/STYL.md a granula/blog/NAVOD.md. Zmeny pushuj priamo na main.

## 3. Napíš, čo zmeniť

Vždy uveď **názov článku**. Príklady:

- „Článok *Pes sa škriabe a olizuje si labky: môže za to krmivo?* — skráť sekciu o testoch, druhý odsek znie neprirodzene, prepíš ho.“
- „V článku o hnačke zmeň titulok na …“
- Môžeš priložiť aj **PDF s ručnými poznámkami** alebo snímku obrazovky. Claude ich prečíta.

Keď je pripomienka všeobecná (platí pre všetky články, napr. „nepoužívaj slovo X“), povedz to. Claude ju zapíše do pravidiel a opraví všetky koncepty.

## 4. Pošli fotky

Fotky jednoducho vlož do chatu a napíš, kam patria:

- „Toto je hlavná fotka k článku o svrbení.“
- „Toto je fotka do sekcie o testoch zo srsti (namiesto zástupného obrázka).“
- „Toto je fotka autorky MVDr. Jana Nováková, do článkov X a Y.“

Formát je jedno (JPG, PNG, HEIC). Claude ich oreže, zmenší a uloží. Čo má byť na ktorej fotke, vidíš v náhľade v pruhovaných rámikoch „Zástupný obrázok“.

Ideálne rozmery: hlavná fotka na šírku (16:9), fotky v texte na šírku (3:2), fotka autora štvorec. Najmenej 1600 px na šírku, aby neboli rozmazané. Hlavnú vec (psa, detail) maj v strede.

## 5. Autor

Autori sú v redakcii v časti **Autori** (vľavo). Autora článku nastavíš vetou: „V článku *…* nastav autorku MVDr. Marcelu Glezgovú.“

Nového autora pridáš tak, že Claude napíšeš meno, jednu vetu, prečo mu veriť, prípadne odkaz na web, a pošleš štvorcovú fotku. Bez autora s fotkou sa článok nedá publikovať.

## 6. Publikovanie

Keď je článok hotový, napíš: „Článok *…* schvaľujem na publikovanie.“ Claude ho zverejní a pošle adresu. Článok s chybou (chýba autor, fotka a pod.) sa nezverejní, Claude povie, čo chýba.

Zmeny sa na webe ukážu približne do minúty po tom, čo ich Claude nahrá.
