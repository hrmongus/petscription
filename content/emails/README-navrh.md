# Granula: transakčné e-maily (návrh 23. 11. 2026)

- `nahlad/`: e-maily so vzorovými dátami. Otvor v prehliadači.
- `sablony/`: rovnaké HTML s premennými `{{...}}` na napojenie v P5 (Resend). Obrázky odkazujú na `https://www.granula.sk/img/email/`.
- `img/`: logo (nálepka −4° podľa identity) a fotky vriec.
- `na-upload/`: presne tie súbory, ktoré treba nahrať na web (pozri nižšie).

## Čo nahrať na web

Všetko do `https://www.granula.sk/img/email/` (v repe `public/granula/img/email/` alebo podľa toho, kam smeruje `/img`). Názvy nemeniť, šablóny ich čakajú presne takto:

| Súbor | Kde sa používa |
|---|---|
| `logo-granula.png` | hlavička každého e-mailu |
| `vrece-morka-hus-kacica.jpg` | Morka, hus & kačica s tekvicou |
| `vrece-jahna-bataty-cucoriedky.jpg` | Jahňa s batátmi & čučoriedkami |
| `vrece-hovadzie-ryza.jpg` | Hovädzie s ryžou |
| `vrece-hovadzie-morka-jahna.jpg` | Hovädzie, morka & jahňa |
| `vrece-jelen-kralik.jpg` | Jeleň & králik |

Kontrola po nahratí: `https://www.granula.sk/img/email/logo-granula.png` sa musí otvoriť v prehliadači. V kóde treba namapovať id receptúry z `engine.js` na `product_slug` (časť názvu za `vrece-`).

- `nahlady-png/`: screenshoty (desktop aj mobil).
- `gen.py`: generátor oboch verzií (texty sa upravujú tu, potom `python3 gen.py`). `assets.py` vyrába obrázky.

## E-maily, predmety a preheadery

| # | Kedy | Predmet | Preheader |
|---|---|---|---|
| 1 | `checkout.session.completed`, predplatné | Objednávka č. {{order_number}} je potvrdená | Platbu sme prijali, granule už chystáme v sklade. |
| 2 | `invoice.paid`, `subscription_cycle` | Ďalšie vrece už chystáme · objednávka č. {{order_number}} | Platba z predplatného prebehla, balík čoskoro odíde. |
| 3 | `checkout.session.completed`, jednorazovo | Objednávka č. {{order_number}} je potvrdená | Platbu sme prijali, granule už chystáme v sklade. |
| 4 | FHB `sent` | Balík s granulami je na ceste · objednávka č. {{order_number}} | Balík odišiel zo skladu. Tu je odkaz na sledovanie. |
| 5 | `invoice.payment_failed` | Platba za granule zlyhala | Skúsime to znova, alebo zaplať hneď jedným klikom. |

## Premenné

- `first_name`: krstné meno zákazníka.
- `dog_name`, `dog_name_dat` (Bodke), `dog_name_acc` (Bodku): meno psa v 1., 3. a 4. páde, iba v tele e-mailu (predmety meno psa neobsahujú). Pády treba uložiť pri dotazníku, alebo dať fallback „tvojho psa / tvojmu psovi“.
- `order_number`, `order_date`, `product_name`, `product_slug` (názov súboru `vrece-<slug>.jpg`), `bag_kg`, `days` (D).
- `price_food`, `price_shipping`, `price_total`: formát `67,50 €`.
- `next_charge`, `retry_date`: dátum `26. 12. 2026`.
- `carrier` („DPD, výdajné miesto“), `carrier_short` („DPD“), `delivery_address`.
- `tracking_number`, `tracking_url`, `pay_url` (Stripe `hosted_invoice_url`).
- `url_home`, `url_account`, `url_vop`, `url_claims`, `url_withdraw`.
- E-mail 4: blok „Prvé vrece? Prechádzaj postupne“ zobraziť iba pri `kind = first`.

## Poznámky

- „Odstúpiť od zmluvy tu“ je odkaz v pätičke každého e-mailu k objednávke. Výrazné tlačidlo zákon (§ 20a) vyžaduje na webe/v účte, nie v e-maile.
- Sumy vo vzore sú vymyslené (67,50 + 4,90). V ostrom e-maile sa berú zo Stripe.
- Bez riadku DPH, Spark Link nie je platiteľ (SPEC P1, otvorené).
- Web font Montserrat sa zobrazí v Apple Mail / iOS. Gmail a Outlook ukážu Arial. Logo je obrázok, takže vyzerá všade rovnako.
- Chýba ešte textová verzia (brief P5) a zvyšné e-maily: pripomienka pred platbou, odstúpenie, zrušenie/pauza.
