/* Granula — výpočtový engine: výber granúl a denná dávka.
   Jediný zdroj pravdy pre dotazník (granule-na-mieru.html) aj kontrolnú stránku
   (admin-vypocet.html). Nič tu nie je skryté: každé rozhodnutie vracia aj dôvod.

   compute(answers, params) → {
     derived    odvodené vstupy (vek, veľkosť, fáza, príznaky),
     products   vhodnosť každého produktu po kritériách,
     rules      poradie rozhodovacích pravidiel a ktoré vyhralo,
     product    vybraný produkt (alebo null),
     energy     výpočet energie krok za krokom,
     dose       gramy pre vybraný produkt,
     doses      gramy pre všetky produkty (na porovnanie),
     bags       vrecia, výdrž a ceny,
     notes      informačné poznámky k zameraniu (nemenia výber)
   } */
(function () {
  "use strict";

  /* ======================================================================
     1. PARAMETRE — všetky čísla, ktoré ovplyvňujú výsledok. Na kontrolnej
        stránke sa dajú meniť naživo; tu sú predvolené hodnoty.
     ====================================================================== */
  var PARAMS = {
    // záloha, keď plemeno nie je v zozname: kategória z aktuálnej hmotnosti (kg, „menej než“)
    sizeMax: { trpaslicie: 5, male: 10, stredne: 25, velke: 45 },
    // šteňa do tohto veku (mesiace), podľa veľkostnej kategórie plemena
    puppyUntilMonths: { trpaslicie: 10, male: 10, stredne: 12, velke: 18, obrie: 24 },
    // senior od tohto veku (roky), podľa veľkostnej kategórie
    seniorFromYears: { trpaslicie: 9, male: 9, stredne: 8, velke: 7, obrie: 6 },
    // „štartér pre šteňatá všetkých plemien – cca do 9. týždňa“
    starterWeeks: 9,

    // násobky pokojovej potreby energie RER (WSAVA / AAHA)
    factor: {
      puppyUnder4m: 3.0,      // šteňa 0–4 mesiace
      puppyOver4m: 2.0,       // šteňa 4 mesiace až dospelosť
      adultNeutered: 1.6,     // dospelý kastrovaný
      adultIntact: 1.8,       // dospelý nekastrovaný
      inactive: 1.4,          // „prevažne doma“ a seniori bez športu
      lightWork: 2.0,         // „beh, túry, šport“
      moderateWork: 3.0,      // „pracovný pes“
      weightLoss: 1.0,        // nadváha: 1,0 × RER ideálnej hmotnosti
      gestationEarly: 1.8,    // gravidita, prvých 6 týždňov
      gestationLate: 3.0      // gravidita, posledné 3 týždne
    },
    overweightFraction: 0.10, // „kilo navyše“ ≈ o 10 % nad ideálom → ideál = hmotnosť / 1,10
    underweightBonus: 0.10,   // „chudší“ → +10 % energie
    calibration: 1.00,        // globálny korekčný násobok (1,00 = bez korekcie)
    roundTo: 5,               // zaokrúhlenie dávky (g)

    vat: 0.23,                // DPH
    shipping: 4.90,           // doprava za doručenie s DPH (€)
    minBagDays: 28,           // odporúčané vrece má vydržať aspoň toľko dní
    reorderLeadDays: 4,       // ďalšie vrece posielame o toľko dní skôr
    plans: { mesiac: 0.10, kvartal: 0.20, raz: 0 } // zľavy predplatného
  };

  /* ======================================================================
     2. PLEMENÁ — kategória, rozpätie a priemerná hmotnosť dospelého psa (pes aj suka).
        Kategóriu berieme priamo z tabuľky; „trpasličie“ sa pri výbere granúl ráta ako malé.
        Priemer predvyplní hmotnosť v dotazníku. Psy bývajú o 10–25 % ťažšie ako suky.
     ====================================================================== */
  var BREEDS = [
    { id: "krizenec-maly", name: "Kríženec – malý", size: "male", mix: true, range: "do 10", avg: 7 },
    { id: "krizenec-stredny", name: "Kríženec – stredný", size: "stredne", mix: true, range: "10–25", avg: 17 },
    { id: "krizenec-velky", name: "Kríženec – veľký", size: "velke", mix: true, range: "25+", avg: 32 },
    { id: "civava", name: "Čivava", size: "trpaslicie", mix: false, range: "1,5–3", avg: 2.3 },
    { id: "prazsky-krysarik", name: "Pražský krysárik", size: "trpaslicie", mix: false, range: "1,5–3,5", avg: 2.5 },
    { id: "nemecky-spic-trpaslici-pomeranian", name: "Nemecký špic trpasličí (pomeranian)", size: "trpaslicie", mix: false, range: "1,8–3,5", avg: 2.5 },
    { id: "yorkshirsky-terier", name: "Yorkshirský teriér", size: "trpaslicie", mix: false, range: "2–3,2", avg: 2.8 },
    { id: "papillon", name: "Papillon", size: "trpaslicie", mix: false, range: "1,5–5", avg: 3 },
    { id: "bolonsky-psik", name: "Bolonský psík", size: "trpaslicie", mix: false, range: "2,5–4", avg: 3.2 },
    { id: "maltezsky-psik", name: "Maltézsky psík", size: "trpaslicie", mix: false, range: "3–4", avg: 3.5 },
    { id: "pekinez", name: "Pekinéz", size: "trpaslicie", mix: false, range: "3–5,5", avg: 4.5 },
    { id: "coton-de-tulear", name: "Coton de Tuléar", size: "trpaslicie", mix: false, range: "3,5–6", avg: 4.5 },
    { id: "bisonik", name: "Bišonik", size: "trpaslicie", mix: false, range: "3–6", avg: 5 },
    { id: "havansky-psik", name: "Havanský psík", size: "trpaslicie", mix: false, range: "4,5–6", avg: 5 },
    { id: "trpaslici-pinc", name: "Trpasličí pinč", size: "trpaslicie", mix: false, range: "4–6", avg: 5 },
    { id: "pudel-maly-trpaslici", name: "Pudel (malý / trpasličí)", size: "trpaslicie", mix: false, range: "3–8", avg: 5.5 },
    { id: "shih-tzu", name: "Shih-tzu", size: "male", mix: false, range: "4,5–8", avg: 6 },
    { id: "jack-russell-terier", name: "Jack Russell teriér", size: "male", mix: false, range: "5–6", avg: 6 },
    { id: "maly-snaucer", name: "Malý šnaucer", size: "male", mix: false, range: "4,5–7", avg: 6 },
    { id: "lhasa-apso", name: "Lhasa apso", size: "male", mix: false, range: "5–8", avg: 6.5 },
    { id: "cavalier-king-charles-spaniel", name: "Cavalier King Charles španiel", size: "male", mix: false, range: "5,5–8", avg: 7 },
    { id: "cairn-terier", name: "Cairn teriér", size: "male", mix: false, range: "6–7,5", avg: 7 },
    { id: "mops", name: "Mops", size: "male", mix: false, range: "6–8", avg: 7.5 },
    { id: "west-highland-white-terier", name: "West highland white teriér", size: "male", mix: false, range: "6–10", avg: 8 },
    { id: "bostonsky-terier", name: "Bostonský teriér", size: "male", mix: false, range: "5–11", avg: 8 },
    { id: "foxterier", name: "Foxteriér", size: "male", mix: false, range: "7–8,5", avg: 8 },
    { id: "setlandsky-ovciak-sheltie", name: "Šetlandský ovčiak (sheltie)", size: "male", mix: false, range: "6–12", avg: 8 },
    { id: "jazvecik", name: "Jazvečík", size: "male", mix: false, range: "7–12", avg: 9 },
    { id: "nemecky-polovny-terier-jagdterier", name: "Nemecký poľovný teriér (jagdteriér)", size: "male", mix: false, range: "7,5–10", avg: 9 },
    { id: "skotsky-terier", name: "Škótsky teriér", size: "male", mix: false, range: "8,5–10,5", avg: 9.5 },
    { id: "shiba-inu", name: "Shiba inu", size: "male", mix: false, range: "8–11", avg: 9.5 },
    { id: "basenji", name: "Basenji", size: "male", mix: false, range: "9,5–11", avg: 10 },
    { id: "francuzsky-buldog", name: "Francúzsky buldog", size: "male", mix: false, range: "8–14", avg: 11 },
    { id: "mudi", name: "Mudi", size: "male", mix: false, range: "8–13", avg: 11 },
    { id: "welsh-corgi-pembroke", name: "Welsh corgi pembroke", size: "male", mix: false, range: "10–12", avg: 11 },
    { id: "bigl", name: "Bígl", size: "stredne", mix: false, range: "9–14", avg: 12 },
    { id: "whippet", name: "Whippet", size: "stredne", mix: false, range: "10–15", avg: 13 },
    { id: "anglicky-kokerspaniel", name: "Anglický kokeršpaniel", size: "stredne", mix: false, range: "12–15", avg: 13.5 },
    { id: "stafordsirsky-bulterier", name: "Stafordšírsky bulteriér", size: "stredne", mix: false, range: "11–17", avg: 14 },
    { id: "border-kolia", name: "Border kólia", size: "stredne", mix: false, range: "14–20", avg: 17 },
    { id: "stredny-snaucer", name: "Stredný šnaucer", size: "stredne", mix: false, range: "14–20", avg: 17 },
    { id: "slovensky-kopov", name: "Slovenský kopov", size: "stredne", mix: false, range: "15–20", avg: 18 },
    { id: "sarpej", name: "Šarpej", size: "stredne", mix: false, range: "18–25", avg: 21 },
    { id: "sibirsky-husky", name: "Sibírsky husky", size: "stredne", mix: false, range: "16–28", avg: 22 },
    { id: "anglicky-springerspaniel", name: "Anglický špringeršpaniel", size: "stredne", mix: false, range: "18–25", avg: 22 },
    { id: "americky-pitbulterier", name: "Americký pitbulteriér", size: "stredne", mix: false, range: "14–30", avg: 22 },
    { id: "samojed", name: "Samojed", size: "stredne", mix: false, range: "17–30", avg: 23 },
    { id: "australsky-ovciak", name: "Austrálsky ovčiak", size: "stredne", mix: false, range: "16–32", avg: 24 },
    { id: "anglicky-buldog", name: "Anglický buldog", size: "stredne", mix: false, range: "22–25", avg: 24 },
    { id: "madarsky-stavac-vizla", name: "Maďarský stavač (vižla)", size: "stredne", mix: false, range: "20–30", avg: 25 },
    { id: "basset-hound", name: "Basset hound", size: "stredne", mix: false, range: "20–30", avg: 25 },
    { id: "bulterier", name: "Bulteriér", size: "stredne", mix: false, range: "20–30", avg: 25 },
    { id: "cau-cau", name: "Čau-čau", size: "stredne", mix: false, range: "20–32", avg: 25 },
    { id: "belgicky-ovciak-malinois", name: "Belgický ovčiak (malinois)", size: "velke", mix: false, range: "20–30", avg: 26 },
    { id: "ceskoslovensky-vlciak", name: "Československý vlčiak", size: "velke", mix: false, range: "20–32", avg: 26 },
    { id: "americky-stafordsirsky-terier", name: "Americký stafordšírsky teriér", size: "velke", mix: false, range: "18–32", avg: 27 },
    { id: "bavorsky-barvar", name: "Bavorský barvár", size: "velke", mix: false, range: "20–35", avg: 27 },
    { id: "nemecky-kratkosrsty-stavac", name: "Nemecký krátkosrstý stavač", size: "velke", mix: false, range: "25–32", avg: 28 },
    { id: "dalmatin", name: "Dalmatín", size: "velke", mix: false, range: "24–32", avg: 28 },
    { id: "irsky-seter", name: "Írsky seter", size: "velke", mix: false, range: "25–32", avg: 29 },
    { id: "slovensky-hrubosrsty-stavac", name: "Slovenský hrubosrstý stavač", size: "velke", mix: false, range: "22–35", avg: 29 },
    { id: "labradorsky-retriever", name: "Labradorský retriever", size: "velke", mix: false, range: "25–36", avg: 30 },
    { id: "boxer", name: "Boxer", size: "velke", mix: false, range: "25–32", avg: 30 },
    { id: "nemecky-drotosrsty-stavac", name: "Nemecký drôtosrstý stavač", size: "velke", mix: false, range: "27–32", avg: 30 },
    { id: "zlaty-retriever", name: "Zlatý retriever", size: "velke", mix: false, range: "27–36", avg: 31 },
    { id: "weimarsky-stavac", name: "Weimarský stavač", size: "velke", mix: false, range: "25–40", avg: 32 },
    { id: "biely-svajciarsky-ovciak", name: "Biely švajčiarsky ovčiak", size: "velke", mix: false, range: "25–40", avg: 32 },
    { id: "hovawart", name: "Hovawart", size: "velke", mix: false, range: "25–40", avg: 33 },
    { id: "nemecky-ovciak", name: "Nemecký ovčiak", size: "velke", mix: false, range: "30–40", avg: 34 },
    { id: "rodezsky-ridgeback", name: "Rodézsky ridgeback", size: "velke", mix: false, range: "32–37", avg: 34 },
    { id: "aljassky-malamut", name: "Aljašský malamut", size: "velke", mix: false, range: "34–38", avg: 36 },
    { id: "slovensky-cuvac", name: "Slovenský čuvač", size: "velke", mix: false, range: "31–44", avg: 38 },
    { id: "dobrman", name: "Dobrman", size: "velke", mix: false, range: "32–45", avg: 38 },
    { id: "akita-inu", name: "Akita inu", size: "velke", mix: false, range: "32–45", avg: 38 },
    { id: "rotvajler", name: "Rotvajler", size: "obrie", mix: false, range: "35–50", avg: 45 },
    { id: "bernsky-salasnicky-pes", name: "Bernský salašnícky pes", size: "obrie", mix: false, range: "38–50", avg: 45 },
    { id: "cane-corso", name: "Cane corso", size: "obrie", mix: false, range: "40–50", avg: 45 },
    { id: "kuvasz", name: "Kuvasz", size: "obrie", mix: false, range: "37–62", avg: 48 },
    { id: "bullmastif", name: "Bullmastif", size: "obrie", mix: false, range: "41–59", avg: 50 },
    { id: "bordeauxska-doga", name: "Bordeauxská doga", size: "obrie", mix: false, range: "45–65", avg: 55 },
    { id: "stredoazijsky-pastiersky-pes", name: "Stredoázijský pastiersky pes", size: "obrie", mix: false, range: "40–80", avg: 55 },
    { id: "kaukazsky-pastiersky-pes", name: "Kaukazský pastiersky pes", size: "obrie", mix: false, range: "45–70", avg: 55 },
    { id: "leonberger", name: "Leonberger", size: "obrie", mix: false, range: "45–77", avg: 59 },
    { id: "novofundlandsky-pes", name: "Novofundlandský pes", size: "obrie", mix: false, range: "54–68", avg: 61 },
    { id: "nemecka-doga", name: "Nemecká doga", size: "obrie", mix: false, range: "45–90", avg: 65 },
    { id: "bernardin", name: "Bernardín", size: "obrie", mix: false, range: "64–120", avg: 75 }
  ];

  /* ======================================================================
     3. PRODUKTY — názvy presne podľa obalu. Texty z podkladov výrobcu.
     ====================================================================== */
  var PRODUCTS = [
    {
      id: "hovadzie-morka-jahna",
      name: "Hovädzie, morka & jahňa s ryžou",
      img: "img/produkty/hovadzie-morka-jahna-s-ryzou.webp",
      bg: "#FFB3C7",
      protein: 30, fat: 20, ash: 7.5, fiber: 3.5, moisture: 8, calcium: 2, phosphorus: 1.2,
      kibbleMm: 6, monoprotein: false, glucosamine: 600, chondroitin: 800,
      pricePerKgExVat: 2.60,
      highlights: [["krava", "Hovädzie", 33], ["morka", "Morka", 15], ["jahna", "Jahňa", 5], ["ryza", "Ryža", 15]],
      suitability: "Multiproteín (hovädzie, morčacie a jahňacie), superprémiová, malá granula cca 6 mm, zvýšený chondroitín a glukozamín. Vhodné aj ako štartér pre šteňatá všetkých plemien – cca do 9. týždňa, následne vhodné pre šteňatá malých a stredných plemien. Pre malé plemená vhodné aj v dospelosti a seniornom veku (pokiaľ nemá pes problémy s pankreasom a obezitu).",
      composition: "33 % hovädzie mäso (20 % sušené hovädzie mäso, 13 % čerstvo spracované hovädzie mäso), hovädzí a bravčový tuk (prírodné tokoferoly a zdroj vitamínu E), 15 % morčacie mäso, 15 % ryža, 13 % zelenina (zemiakové vločky, mrkva, petržlen, zelený špenát), 5 % jahňacie mäso, sušené jablká, repná vláknina, pivovarské kvasnice, kolagén, lososový olej, ľanové semienka, humínové látky, hliva ustricová, tanín (výťažok z jedlého gaštana).",
      additives: "Vit. A (3a672a) 11 200 m. j., vit. D3 (3a671) 1 100 m. j., vit. E (alfa-tokoferol) (3a700) 500 m. j., niacínamid (3a315) 50 mg, pantotenan vápenatý (3a841) 15 mg, vit. B1 (3a821) 4 mg, vit. B2 (3a825i) 8 mg, cholínchlorid (3a890) 500 mg, biotín (3a880) 1 mg, kyselina listová (3a316) 1 mg.",
      trace: "Meď – Cu (síran meďnatý pentahydrát) (3b405) 10 mg, mangán – Mn (oxid manganatý) (3b502) 64 mg, železo – Fe (síran železnatý monohydrát) (3b103) 210 mg, zinok – Zn (oxid zinočnatý) (3b603) 180 mg, jód – I (jodid draselný) (3b201) 3 mg, selén – Se (seleničitan sodný) (3b801) 0,25 mg, glukozamín 600 mg/kg, chondroitín 800 mg/kg.",
      missing: []
    },
    {
      id: "morka-hus-kacica",
      name: "Morka, hus & kačica s tekvicou",
      img: "img/produkty/morka-hus-kacica-s-tekvicou.webp",
      bg: "#FF6900",
      protein: 26, fat: 16, ash: 6.5, fiber: 2.3, moisture: 8, calcium: 1.6, phosphorus: 1.2,
      kibbleMm: 10, monoprotein: false, glucosamine: 600, chondroitin: 800,
      pricePerKgExVat: 2.70,
      highlights: [["morka", "Morka", 25], ["hus", "Hus", 15], ["kacka", "Kačica", 8], ["tekvica", "Tekvica", 15]],
      suitability: "Superprémiová, multiproteín, granula cca 10 mm, zvýšený chondroitín a glukozamín. Morčacie, husacie a kačacie s tekvicou. Vhodné pre dospelé psy všetkých plemien, pre šteňatá veľkých a obrích plemien, pre zdravých seniorov. Nevhodné pre obézne psy a psy s problémami s pankreasom.",
      composition: "Čerstvo spracované morčacie mäso v sušenom stave 25 %, sušené husacie mäso 15 %, sušená tekvica 15 %, ryža 13 %, kačací a bravčový tuk (prírodné tokoferoly, zdroj vitamínu E), sušené kačacie mäso 8 %, kuracia pečeň 3 %, lososový olej 3 %, konopná múka 2 %, sušené celé vajcia 2 %, sušené jablká, maliny, ľanové výlisky, bovinný kolagén, pestrec mariánsky, hliva ustricová, humínové látky, pivovarnícke kvasnice, yucca schidigera, petržlenová vňať, rozmarín, chondroitín 800 mg/kg, glukozamín 600 mg/kg, omega-3 a omega-6 mastné kyseliny.",
      additives: "Vit. A (3a672a) 11 200 m. j., vit. D3 (3a671) 1 100 m. j., vit. E (alfa-tokoferol) (3a700) 500 m. j., niacínamid (3a315) 50 mg, pantotenan vápenatý (3a841) 15 mg, vit. B1 (3a821) 4 mg, vit. B2 (3a825i) 8 mg, cholínchlorid (3a890) 500 mg, biotín (3a880) 1 mg, kyselina listová (3a316) 1 mg.",
      trace: "Meď – Cu (síran meďnatý pentahydrát) (3b405) 10 mg, mangán – Mn (oxid manganatý) (3b502) 64 mg, železo – Fe (síran železnatý monohydrát) (3b103) 210 mg, zinok – Zn (oxid zinočnatý) (3b603) 180 mg, jód – I (jodid draselný) (3b201) 3 mg, selén – Se (seleničitan sodný) (3b801) 0,25 mg.",
      missing: []
    },
    {
      id: "hovadzie",
      name: "Hovädzie s ryžou",
      img: "img/produkty/hovadzie-s-ryzou.webp",
      bg: "#F4EBE2",
      protein: 32, fat: 14, ash: 7.5, fiber: 3.5, moisture: 8, calcium: 2, phosphorus: 1.2,
      kibbleMm: 8, monoprotein: true, glucosamine: 350, chondroitin: null,
      pricePerKgExVat: 2.30,
      highlights: [["krava", "Hovädzie", 60], ["ryza", "Ryža", 13], ["mrkva", "Zelenina", 10], ["repa", "Repná vláknina", 3]],
      suitability: "Monoproteín, vhodná pre dospelé psy so zvýšenou aktivitou, pre psy, ktoré potrebujú nasvaliť, psy v športe, kde je nutná výdrž, ďalej pre šteňatá malých a stredných plemien, pre dospelé psy malých plemien, vhodná aj pre gravidné feny. Menšia granula 8 mm.",
      composition: "60 % hovädzie mäso (40 % sušené hovädzie mäso, 20 % čerstvo spracované hovädzie mäso), ryža 13 %, hovädzí a bravčový tuk (prírodné tokoferoly a zdroj vitamínu E), zelenina 10 % (zemiakové vločky, mrkva, petržlen, zelený špenát), repná vláknina 3 %, pivovarské kvasnice, kolagén, ľanový olej, humac natur (humínové látky), pestrec mariánsky, hliva ustricová, tanín (výťažok z jedlého gaštana).",
      additives: "Vit. A (3a672a) 11 200 m. j., vit. D3 (3a671) 1 100 m. j., vit. E (alfa-tokoferol) (3a700) 250 m. j., vit. B1 (3a821) 4 mg, vit. B2 (3a825i) 8 mg, cholínchlorid (3a890) 500 mg, niacínamid (3a315) 50 mg, pantotenan vápenatý (3a841) 15 mg, kyselina listová (3a316) 1 mg.",
      trace: "Železo – Fe (síran železnatý monohydrát) (3b103) 210 mg, zinok – Zn (oxid zinočnatý) (3b603) 180 mg, mangán – Mn (oxid manganatý) (3b502) 64 mg, meď – Cu (síran meďnatý pentahydrát) (3b405) 10 mg, jód – I (jodid draselný) (3b201) 3 mg, selén – Se (seleničitan sodný) (3b801) 0,12 mg, glukozamín 350 mg.",
      // dávkovacia tabuľka výrobcu: hmotnosť psa (kg) → g/deň
      makerTable: [[5, 70], [10, 130], [15, 185], [20, 220], [30, 290], [40, 360]],
      missing: []
    },
    {
      id: "jahna",
      name: "Jahňa s batátmi & čučoriedkami",
      img: "img/produkty/jahna-s-batatmi-cucoriedkami.webp",
      bg: "#0047BB",
      protein: 26, fat: 16, ash: 6.5, fiber: 2.8, moisture: 8, calcium: 1.7, phosphorus: 0.9,
      kibbleMm: null, monoprotein: true, glucosamine: 350, chondroitin: null,
      pricePerKgExVat: 2.80,
      highlights: [["jahna", "Jahňa", 51], ["bataty", "Batáty", 19], ["cucoriedky", "Čučoriedky", 4], ["jablko", "Jablká", 3]],
      suitability: "Monoproteín, vhodné pre dospelé psy všetkých plemien, pre šteňatá veľkých a obrích plemien. Pre psy s potravinovými intoleranciami.",
      composition: "Čerstvo spracované jahňacie mäso v sušenom stave 51 %, batáty 19 %, jahňací tuk a bravčový tuk (prírodné tokoferoly, zdroj vit. E), sušená zelenina 10 % (mrkva, repa, špenát), čučoriedky 4 %, jablká 3 %, konopná múka 2 %, pivovarnícke kvasnice, bovinný kolagén, humínové látky, tanín (výťažok z jedlého gaštana), pestrec mariánsky, petržlenová vňať, yucca schidigera.",
      additives: "Vit. A (3a672a) 11 200 m. j., vit. D3 (3a671) 1 100 m. j., vit. E (alfa-tokoferol) (3a700) 250 m. j., vit. B1 (3a821) 4 mg, vit. B2 (3a825i) 8 mg, cholínchlorid (3a890) 500 mg, niacínamid (3a315) 50 mg, pantotenan vápenatý (3a841) 15 mg, kyselina listová (3a316) 1 mg.",
      trace: "Železo – Fe (síran železnatý monohydrát) (3b103) 210 mg, zinok – Zn (oxid zinočnatý) (3b603) 190 mg, mangán – Mn (oxid manganatý) (3b502) 64 mg, meď – Cu (síran meďnatý pentahydrát) (3b405) 10 mg, jód – I (jodid draselný) (3b201) 3 mg, selén – Se (seleničitan sodný) (3b801) 0,12 mg, glukozamín 350 mg.",
      missing: ["veľkosť granuly"]
    },
    {
      id: "jelen-kralik",
      name: "Jeleň & králik s batátmi",
      img: "img/produkty/jelen-kralik-s-batatmi.webp",
      bg: "#000000",
      // popol, vláknina a vlhkosť NIE SÚ v podkladoch — dočasne prevzaté z podobných receptúr
      protein: 24, fat: 12, ash: 7, fiber: 3, moisture: 8, calcium: null, phosphorus: null,
      kibbleMm: null, monoprotein: false, glucosamine: null, chondroitin: null,
      pricePerKgExVat: null,
      highlights: [["jelen", "Jeleň", 35], ["kralik", "Králik", 15], ["bataty", "Batáty", 23], ["cucoriedky", "Čučoriedky", 3]],
      suitability: "",
      composition: "Čerstvo spracované jelenie mäso v sušenom stave 35 %, batáty 23 %, čerstvo spracované králičie mäso v sušenom stave 15 %, jelení loj a bravčový tuk (prírodné tokoferoly, zdroj vit. E), sušená zelenina 7 % (mrkva, petržlen, zelený špenát), čučoriedky 3 %, repná vláknina 2 %, pivovarnícke kvasnice, bovinný kolagén, konopná múka, humac natur (humínové látky), tanín (výťažok z jedlého gaštana), pestrec mariánsky, fenikel, sušený plod šípky, harmanček.",
      additives: "",
      trace: "",
      missing: ["cena", "popis vhodnosti", "popol, vláknina, vlhkosť (pre výpočet energie použité 7 / 3 / 8 %)", "vápnik a fosfor", "nutričné doplnkové látky", "stopové prvky", "veľkosť granuly"]
    }
  ];

  var BAGS = [
    { id: "9", kg: 9, label: "9 kg" },
    { id: "18", kg: 18, label: "2 × 9 kg" }
  ];

  var ACTIVITY_TEXT = {
    doma: "pokojný domáci režim", mesto: "bežný mestský režim",
    sport: "veľa behu a športu", praca: "pracovný režim"
  };
  var SIZE_TEXT = { trpaslicie: "trpasličie", male: "malé", stredne: "stredné", velke: "veľké", obrie: "obrie" };
  var STAGE_TEXT = { starter: "šteňa do 9. týždňa", puppy: "šteňa", adult: "dospelý", senior: "senior" };

  /* ======================================================================
     4. ENERGIA KRMIVA — rovnica NRC 2006, ktorú odporúča FEDIAF
        (bezdusíkaté látky dopočítané do 100 %).
     ====================================================================== */
  function metabolizable(p) {
    var nfe = 100 - p.protein - p.fat - p.ash - p.fiber - p.moisture;
    var ge = 5.7 * p.protein + 9.4 * p.fat + 4.1 * (nfe + p.fiber);   // kcal / 100 g
    var fiberDM = p.fiber / (100 - p.moisture) * 100;                 // vláknina v sušine, %
    var dig = 91.2 - 1.43 * fiberDM;                                  // stráviteľnosť energie, %
    var de = ge * dig / 100;
    var me = de - 1.04 * p.protein;
    return { nfe: nfe, ge: ge, fiberDM: fiberDM, dig: dig, de: de, me: me, kcalPerG: me / 100 };
  }

  /* ======================================================================
     5. ODVODENÉ VSTUPY
     ====================================================================== */
  function has(a, f) { return (a.focus || []).indexOf(f) !== -1; }
  function int(v) { var n = parseInt(v, 10); return isNaN(n) ? 0 : n; }

  function sizeFromKg(kg, P) {
    return kg < P.sizeMax.trpaslicie ? "trpaslicie" : kg < P.sizeMax.male ? "male" : kg < P.sizeMax.stredne ? "stredne" : kg < P.sizeMax.velke ? "velke" : "obrie";
  }

  function derive(a, P) {
    var years = int(a.years), months = int(a.months), weeks = int(a.weeks);
    var useWeeks = years === 0 && months <= 2 && a.weeks !== "" && a.weeks != null && weeks > 0;
    var ageWeeks = useWeeks ? weeks : Math.round((years * 12 + months) * 52.18 / 12);
    var ageMonths = useWeeks ? weeks * 12 / 52.18 : years * 12 + months;
    var kg = +a.kg || 0;

    var breed = BREEDS.filter(function (b) { return b.id === a.breed; })[0] || null;
    var adultKg, size, sizeSource;
    if (breed) {
      adultKg = breed.avg; size = breed.size;
      sizeSource = (breed.mix ? "" : "plemeno ") + breed.name + " — " + SIZE_TEXT[size] + ", " + breed.range + " kg, priemer " + fmt(breed.avg, 1).replace(",0", "") + " kg";
    } else {
      adultKg = kg; size = sizeFromKg(kg, P);
      sizeSource = "plemeno nie je v zozname — kategória z aktuálnej hmotnosti " + fmt(kg, 1) + " kg";
    }

    var puppyMonths = P.puppyUntilMonths[size], seniorYears = P.seniorFromYears[size];
    var stage = ageWeeks < P.starterWeeks ? "starter"
      : ageMonths < puppyMonths ? "puppy"
      : ageMonths >= seniorYears * 12 ? "senior" : "adult";

    var pregnant = a.sex === "fenka" && a.neutered === "nie" && ageMonths >= 6 && (a.pregnant === "early" || a.pregnant === "late") ? a.pregnant : "";
    return {
      ageWeeks: ageWeeks, ageMonths: ageMonths, useWeeks: useWeeks, kg: kg,
      breed: breed, adultKg: adultKg, size: size, sizeSource: sizeSource,
      puppyMonths: puppyMonths, seniorYears: seniorYears, stage: stage,
      isPuppy: stage === "starter" || stage === "puppy",
      small: size === "trpaslicie" || size === "male", smallMid: size === "trpaslicie" || size === "male" || size === "stredne", largeGiant: size === "velke" || size === "obrie",
      obese: a.body === "navyse",
      pancreas: has(a, "pankreas"),
      intolerance: has(a, "alergia") || has(a, "travenie"),
      active: a.activity === "sport" || a.activity === "praca" || has(a, "svaly") || has(a, "energia"),
      pregnant: pregnant
    };
  }

  /* ======================================================================
     6. VHODNOSŤ — tvrdé kritériá podľa popisu výrobcu.
        Každý produkt: kritériá „vhodné pre“ (stačí jedno) a „nevhodné pre“ (vylučuje).
     ====================================================================== */
  function c(label, ok) { return { label: label, ok: !!ok }; }

  var ELIGIBILITY = {
    "hovadzie-morka-jahna": function (d) {
      return {
        fitFor: [
          c("štartér pre šteňatá všetkých plemien do 9. týždňa", d.stage === "starter"),
          c("šteňa malého alebo stredného plemena", d.stage === "puppy" && d.smallMid),
          c("dospelý alebo senior malého plemena", (d.stage === "adult" || d.stage === "senior") && d.small)
        ],
        unfitFor: [
          c("dospelý/senior s problémami s pankreasom", !d.isPuppy && d.pancreas),
          c("dospelý/senior s nadváhou", !d.isPuppy && d.obese)
        ]
      };
    },
    "morka-hus-kacica": function (d) {
      return {
        fitFor: [
          c("dospelý pes (všetky plemená)", d.stage === "adult"),
          c("šteňa veľkého alebo obrieho plemena", d.isPuppy && d.largeGiant),
          c("zdravý senior (bez pankreasu, intolerancie a nadváhy)", d.stage === "senior" && !d.pancreas && !d.intolerance && !d.obese)
        ],
        unfitFor: [
          c("nadváha", d.obese),
          c("problémy s pankreasom", d.pancreas)
        ]
      };
    },
    "hovadzie": function (d) {
      return {
        fitFor: [
          c("dospelý so zvýšenou aktivitou / na nasvalenie / šport", (d.stage === "adult" || d.stage === "senior") && d.active),
          c("šteňa malého alebo stredného plemena", d.stage === "puppy" && d.smallMid),
          c("dospelý malého plemena", d.stage === "adult" && d.small),
          c("gravidná fena", !!d.pregnant)
        ],
        unfitFor: []
      };
    },
    "jahna": function (d) {
      return {
        fitFor: [
          c("dospelý pes (všetky plemená; senior sa ráta ako dospelý)", d.stage === "adult" || d.stage === "senior"),
          c("šteňa veľkého alebo obrieho plemena", d.isPuppy && d.largeGiant)
        ],
        unfitFor: []
      };
    },
    // PREDPOKLAD: výrobca neposlal popis vhodnosti. Najnižší tuk (12 %) → dospelí a seniori, aj s nadváhou či pankreasom.
    "jelen-kralik": function (d) {
      return {
        fitFor: [
          c("dospelý alebo senior (PREDPOKLAD — výrobca neuviedol)", d.stage === "adult" || d.stage === "senior")
        ],
        unfitFor: [
          c("šteňa (PREDPOKLAD — výrobca neuviedol)", d.isPuppy)
        ]
      };
    }
  };

  function eligibility(d) {
    return PRODUCTS.map(function (p) {
      var e = ELIGIBILITY[p.id](d);
      var fits = e.fitFor.some(function (x) { return x.ok; });
      var blocked = e.unfitFor.filter(function (x) { return x.ok; });
      return { product: p, fitFor: e.fitFor, unfitFor: e.unfitFor, eligible: fits && !blocked.length,
        reason: !fits ? "nespĺňa ani jedno „vhodné pre“" : blocked.length ? "vylúčené: " + blocked.map(function (x) { return x.label; }).join(", ") : "vhodné" };
    });
  }

  /* ======================================================================
     7. ROZHODOVACIE PRAVIDLÁ — v poradí. Prvé pravidlo, ktorého podmienka platí
        a ktoré má aspoň jedného vhodného kandidáta, určí produkt.
     ====================================================================== */
  var RULES = [
    { id: "R1", strict: true, label: "Šteňa do 9. týždňa → štartér", when: function (d) { return d.stage === "starter"; },
      prefer: function () { return ["hovadzie-morka-jahna"]; },
      why: "je to šteňa do 9. týždňa a tieto granule sú štartér pre šteňatá všetkých plemien" },
    { id: "R2", strict: true, label: "Gravidná fena", when: function (d) { return !!d.pregnant; },
      prefer: function () { return ["hovadzie"]; },
      why: "výrobca ich odporúča pre gravidné feny" },
    { id: "R3", strict: true, label: "Nadváha alebo pankreas → najnižší tuk spomedzi vhodných", when: function (d) { return d.obese || d.pancreas; },
      prefer: function () { return PRODUCTS.slice().sort(function (x, y) { return x.fat - y.fat; }).map(function (p) { return p.id; }); },
      why: "pri nadváhe a citlivom pankrease vyberáme vhodné granule s najnižším obsahom tuku" },
    { id: "R4", strict: true, label: "Potravinová intolerancia / citlivé trávenie → monoproteín", when: function (d) { return d.intolerance; },
      prefer: function () { return ["jahna", "hovadzie"]; },
      why: "majú jediný zdroj mäsa (monoproteín), vhodné pri potravinových intoleranciách" },
    { id: "R5", label: "Šteňa malého alebo stredného plemena", when: function (d) { return d.stage === "puppy" && d.smallMid; },
      prefer: function () { return ["hovadzie-morka-jahna", "hovadzie"]; },
      why: "sú určené pre šteňatá malých a stredných plemien" },
    { id: "R6", label: "Šteňa veľkého alebo obrieho plemena", when: function (d) { return d.isPuppy && d.largeGiant; },
      prefer: function () { return ["morka-hus-kacica", "jahna"]; },
      why: "sú určené pre šteňatá veľkých a obrích plemien" },
    { id: "R7", label: "Aktívny dospelý / šport / nasvalenie / energia", when: function (d) { return (d.stage === "adult" || d.stage === "senior") && d.active; },
      prefer: function () { return ["hovadzie"]; },
      why: "majú najviac bielkovín (32 %) pre psy so zvýšenou aktivitou a na nasvalenie" },
    { id: "R8", label: "Senior", when: function (d) { return d.stage === "senior"; },
      prefer: function (d) { return d.small ? ["hovadzie-morka-jahna", "morka-hus-kacica"] : ["morka-hus-kacica", "jahna", "jelen-kralik"]; },
      why: "sú vhodné pre seniorov a majú zvýšený obsah chondroitínu a glukozamínu" },
    { id: "R9", label: "Dospelý malého plemena → malá granula", when: function (d) { return d.stage === "adult" && d.small; },
      prefer: function () { return ["hovadzie-morka-jahna", "hovadzie", "morka-hus-kacica"]; },
      why: "majú malú granulu (6 mm) vhodnú pre malé plemená" },
    { id: "R10", label: "Dospelý (predvolené)", when: function (d) { return d.stage === "adult"; },
      prefer: function () { return ["morka-hus-kacica", "jahna", "jelen-kralik"]; },
      why: "sú určené pre dospelé psy všetkých plemien" }
  ];

  function decide(d, elig) {
    var byId = {}; elig.forEach(function (e) { byId[e.product.id] = e; });
    var winner = null, trace = [];
    RULES.forEach(function (r) {
      var applies = r.when(d), pref = r.prefer(d), pick = null;
      if (applies && !winner) pick = pref.filter(function (id) { return byId[id].eligible; })[0] || null;
      var status = winner ? "skipped" : !applies ? "off" : pick ? "won" : "noCandidate";
      trace.push({ rule: r, applies: applies, prefer: pref, pick: pick, status: status });
      if (status === "won") winner = { rule: r, id: pick };
    });
    if (!winner) {
      var any = elig.filter(function (e) { return e.eligible; })[0];
      trace.push({ rule: { id: "R0", label: "Záloha: prvý vhodný produkt v katalógu", why: "zodpovedajú veku a veľkosti psa" },
        applies: true, prefer: PRODUCTS.map(function (p) { return p.id; }), pick: any ? any.product.id : null, status: any ? "won" : "noCandidate" });
      if (any) winner = { rule: trace[trace.length - 1].rule, id: any.product.id };
    }
    return { winner: winner, trace: trace, second: runnerUp(winner, trace, byId) };
  }

  /* 2. možnosť: najprv ďalší vhodný kandidát vo víťaznom pravidle, potom prvý vhodný
     kandidát z nasledujúcich pravidiel, ktorých podmienka tiež platí. Pravidlá so
     špeciálnou potrebou (strict: R1–R4) dávajú druhú možnosť len zo svojho zoznamu,
     aby napr. pes s intoleranciou nedostal granule s viacerými druhmi mäsa.
     Ak taký kandidát nie je, druhá možnosť nie je (záloha R0 ju nedáva). */
  function runnerUp(winner, trace, byId) {
    if (!winner) return null;
    var start = -1;
    trace.forEach(function (t, i) { if (t.status === "won") start = i; });
    for (var i = start; i < trace.length; i++) {
      var t = trace[i];
      if (!t.applies || t.rule.id === "R0") continue;
      if (i > start && trace[start].rule.strict) break;
      var id = t.prefer.filter(function (x) { return x !== winner.id && byId[x].eligible; })[0];
      if (id) {
        t.second = id;
        return { rule: t.rule, id: id, how: i === start ? "ďalší vhodný kandidát v tom istom pravidle" : "prvý vhodný kandidát ďalšieho platného pravidla" };
      }
    }
    return null;
  }

  /* ======================================================================
     8. DENNÁ POTREBA ENERGIE — RER × násobok (WSAVA / AAHA).
     ====================================================================== */
  function energy(a, d, P) {
    var F = P.factor, steps = [];
    var weight = d.kg, factor, basis;
    if (d.obese && !d.isPuppy && !d.pregnant) {
      weight = d.kg / (1 + P.overweightFraction);
      steps.push("Nadváha: počítame z ideálnej hmotnosti " + fmt(d.kg, 1) + " / " + fmt(1 + P.overweightFraction, 2) + " = " + fmt(weight, 2) + " kg");
    }
    var rer = 70 * Math.pow(weight, 0.75);
    steps.push("RER = 70 × " + fmt(weight, 2) + "^0,75 = " + fmt(rer, 1) + " kcal");

    if (d.pregnant) {
      factor = d.pregnant === "late" ? F.gestationLate : F.gestationEarly;
      basis = d.pregnant === "late" ? "gravidita – posledné 3 týždne" : "gravidita – prvých 6 týždňov";
    } else if (d.isPuppy) {
      factor = d.ageMonths < 4 ? F.puppyUnder4m : F.puppyOver4m;
      basis = d.ageMonths < 4 ? "šteňa do 4 mesiacov" : "šteňa od 4 mesiacov do dospelosti";
    } else if (d.obese) {
      factor = F.weightLoss; basis = "redukcia hmotnosti (1,0 × RER ideálnej hmotnosti)";
    } else if (a.activity === "praca") {
      factor = F.moderateWork; basis = "pracovný pes (stredná záťaž)";
    } else if (a.activity === "sport") {
      factor = F.lightWork; basis = "beh, túry, šport (ľahká práca)";
    } else if (a.activity === "doma" || d.stage === "senior") {
      factor = F.inactive; basis = d.stage === "senior" && a.activity !== "doma" ? "senior bez športu" : "prevažne doma (nízka aktivita)";
    } else {
      factor = a.neutered === "ano" ? F.adultNeutered : F.adultIntact;
      basis = a.neutered === "ano" ? "dospelý kastrovaný" : "dospelý nekastrovaný";
    }
    steps.push("Násobok: " + fmt(factor, 2) + " (" + basis + ")");

    var mult = 1;
    if (a.body === "chudsi" && !d.pregnant) {
      mult = 1 + P.underweightBonus;
      steps.push("Postava „chudší“: × " + fmt(mult, 2));
    }
    if (P.calibration !== 1) steps.push("Kalibrácia: × " + fmt(P.calibration, 2));
    var kcal = rer * factor * mult * P.calibration;
    steps.push("Energia = " + fmt(rer, 1) + " × " + fmt(factor, 2) + (mult !== 1 ? " × " + fmt(mult, 2) : "") +
      (P.calibration !== 1 ? " × " + fmt(P.calibration, 2) : "") + " = " + fmt(kcal, 0) + " kcal/deň");
    return { weight: weight, rer: rer, factor: factor, basis: basis, mult: mult, kcal: kcal, steps: steps };
  }

  function grams(kcal, product, P) {
    var me = metabolizable(product);
    var raw = kcal / me.kcalPerG;
    return { me: me, raw: raw, grams: Math.max(P.roundTo, Math.round(raw / P.roundTo) * P.roundTo) };
  }

  function bagPrice(product, bag, P) {
    if (product.pricePerKgExVat == null) return null;
    return Math.round(product.pricePerKgExVat * bag.kg * (1 + P.vat) * 100) / 100;
  }

  /* ======================================================================
     9. HLAVNÁ FUNKCIA
     ====================================================================== */
  function compute(a, params) {
    var P = merge(PARAMS, params || {});
    var d = derive(a, P);
    var elig = eligibility(d);
    var dec = decide(d, elig);
    var product = dec.winner ? PRODUCTS.filter(function (p) { return p.id === dec.winner.id; })[0] : null;
    var en = energy(a, d, P);
    var doses = PRODUCTS.map(function (p) { var g = grams(en.kcal, p, P); return { product: p, me: g.me, raw: g.raw, grams: g.grams }; });
    var dose = product ? doses.filter(function (x) { return x.product === product; })[0] : null;

    var bags = [], recBag = null;
    if (dose) {
      bags = BAGS.map(function (b) {
        var days = Math.floor(b.kg * 1000 / dose.grams);
        return { bag: b, days: days, price: bagPrice(product, b, P), nextDay: Math.max(1, days - P.reorderLeadDays) };
      });
      recBag = (bags.filter(function (x) { return x.days >= P.minBagDays; })[0] || bags[bags.length - 1]).bag.id;
    }

    var notes = [];
    if (has(a, "kby")) notes.push("Kĺby: zvýšený chondroitín (800 mg/kg) a glukozamín (600 mg/kg) majú „Hovädzie, morka & jahňa s ryžou“ a „Morka, hus & kačica s tekvicou“; „Hovädzie s ryžou“ a „Jahňa s batátmi & čučoriedkami“ majú glukozamín 350 mg.");
    if (has(a, "srst")) notes.push("Srsť a koža: lososový olej obsahujú „Hovädzie, morka & jahňa“ a „Morka, hus & kačica“; ostatné majú ľanový olej alebo konopnú múku.");
    if (has(a, "imunita")) notes.push("Imunita: hlivu ustricovú obsahujú „Hovädzie, morka & jahňa“, „Morka, hus & kačica“ a „Hovädzie s ryžou“.");
    if (has(a, "vyberavy")) notes.push("Vyberavý jedák: výber granúl nemení, dáta o chutnosti nemáme.");
    if (has(a, "vaha") && !d.obese) notes.push("Zameranie „váha“ samo nemení výber ani dávku; mení ich až postava „kilo navyše“.");
    if (d.pregnant) notes.push("Gravidná fena: dávku priebežne upravuj podľa veterinára.");

    var second = dec.second ? PRODUCTS.filter(function (p) { return p.id === dec.second.id; })[0] : null;
    return { params: P, derived: d, products: elig, rules: dec.trace, winner: dec.winner, product: product,
      second: dec.second, secondProduct: second, secondDose: second ? doses.filter(function (x) { return x.product === second; })[0] : null,
      energy: en, dose: dose, doses: doses, bags: bags, recBag: recBag, notes: notes };
  }

  /* pomocné */
  function merge(base, over) {
    var out = {};
    Object.keys(base).forEach(function (k) {
      var b = base[k], o = over[k];
      out[k] = b && typeof b === "object" && !Array.isArray(b) ? merge(b, o || {}) : (o === undefined || o === null || o === "" || (typeof b === "number" && isNaN(+o)) ? b : (typeof b === "number" ? +o : o));
    });
    return out;
  }
  function fmt(n, d) { return n == null || isNaN(n) ? "—" : n.toFixed(d).replace(".", ","); }

  window.GranulaEngine = {
    PARAMS: PARAMS, BREEDS: BREEDS, PRODUCTS: PRODUCTS, BAGS: BAGS, RULES: RULES,
    ACTIVITY_TEXT: ACTIVITY_TEXT, SIZE_TEXT: SIZE_TEXT, STAGE_TEXT: STAGE_TEXT,
    compute: compute, metabolizable: metabolizable, bagPrice: bagPrice, merge: merge, fmt: fmt,
    OVERRIDE_KEY: "granula-engine-params"
  };
})();
