/* Granula — recenzie (jeden zdroj pre úvodnú stránku aj výsledok konfigurátora).
   Použitie: <div class="rw-wrap" data-reviews tabindex="0" aria-label="…"></div>
   Pravidlá:
   - dva rady sa samy posúvajú opačným smerom (nekonečný pás);
   - pomer ~1 písaná : 5 fotiek; fotky sa pri nedostatku opakujú, písané nie;
   - písaná recenzia od majiteľa, ktorý má aj foto recenziu, sa nezobrazí spolu s ňou. */
(function () {
  "use strict";
  var P = "img/produkty/";
  var PHOTOS = [
    // foto recenzie zákazníkov (26. 11. 2026, „Reviews pre Granulu“): fotka, pes, majiteľ, vrece na fotke
    { img: "img/recenzie/beny.webp", alt: "Maltézsky psík Beny vedľa vreca Granula Hovädzie, morka a jahňa s ryžou", bag: "hovadzie-morka-jahna-s-ryzou", dog: "Beny, maltézsky psík, 4 roky", by: "Matej K." },
    { img: "img/recenzie/lola-2.webp", alt: "Border kólia Lola sa hrá s lanom na tráve pred vrecom Granula Hovädzie, morka a jahňa", bag: "hovadzie-morka-jahna-s-ryzou", dog: "Lola, border kólia, 4 mesiace", by: "Barbora L." },
    { img: "img/recenzie/bruno-2.webp", alt: "Bernský salašnícky pes Bruno s vyplazeným jazykom sedí v kufri auta pri vreci Granula Morka, hus a kačica", bag: "morka-hus-kacica-s-tekvicou", dog: "Bruno, bernský salašnícky pes, 7 rokov", by: "Robert H." },
    { img: "img/recenzie/bady.webp", alt: "Yorkshirský teriér Bady leží na gauči, pred ním vrece Granula Jahňa s batátmi", bag: "jahna-s-batatmi-cucoriedkami", dog: "Bady, yorkshirský teriér, 12 rokov", by: "Martina F." },
    { img: "img/recenzie/riky.webp", alt: "Šteňa kokeršpaniela Riky nesie papuču, v pozadí vrece Granula Hovädzie s ryžou", bag: "hovadzie-s-ryzou", dog: "Riky, anglický kokeršpaniel, 6 mesiacov", by: "Michal S." },
    { img: "img/recenzie/sara.webp", alt: "Kríženka Sára leží v jesennom lístí s palicou, v pozadí vrece Granula", bag: "jahna-s-batatmi-cucoriedkami", dog: "Sára, veľký kríženec, 5 rokov", by: "Andrea M." },
    { img: "img/recenzie/ema.webp", alt: "Jazvečík Ema ovoniava vrece Granula Jeleň a králik pri dverách", bag: "jelen-kralik-s-batatmi", dog: "Ema, jazvečík, 4 roky", by: "Julia O." },
    { img: "img/recenzie/roko-2.webp", alt: "Francúzsky buldog Roko je z misky v kuchyni vedľa vreca Granula Jahňa s batátmi", bag: "jahna-s-batatmi-cucoriedkami", dog: "Roko, francúzsky buldog, 9 rokov", by: "Boris F." },
    { img: "img/recenzie/sunny-2.webp", alt: "Šteňa čivavy Sunny leží na chrbte na koberci a nechá sa škrabkať na brušku, vedľa vrece Granula Hovädzie, morka a jahňa", bag: "hovadzie-morka-jahna-s-ryzou", dog: "Sunny, čivava, 4 mesiace", by: "Anastazia L." },
    { img: "img/recenzie/spotty-2.webp", alt: "Dalmatín Spotty leží na schodoch pred domom vedľa vreca Granula Morka, hus a kačica", bag: "morka-hus-kacica-s-tekvicou", dog: "Spotty, dalmatín, 10 rokov", by: "Albert S." },
    { img: "img/recenzie/emil.webp", alt: "Zlatý retríver Emil sedí pri Z-BOXe Packety vedľa vreca Granula", bag: "morka-hus-kacica-s-tekvicou", dog: "Emil, zlatý retríver, 1 rok", by: "Darina J." },
    { img: "img/recenzie/lejdy.webp", alt: "Pudel Lejdy schádza po drevených schodoch k vrecu Granula Hovädzie s ryžou", bag: "hovadzie-s-ryzou", dog: "Lejdy, pudel, 4 roky", by: "Jaro A." }
  ];
  // poradie = priorita (prvé sa ukážu aj na menších obrazovkách)
  var TEXTS = [
    { w: 2, stars: 5, text: "Ako prvé sme si všimli, že Ranakin prestal smrdieť. Predtým som ho musela kúpať každé dva týždne, teraz ani nie. PS nesmrdia ani granule, čo je pri mojom nose plus.", bag: "morka-hus-kacica-s-tekvicou", by: "Júlia L.", dog: "Ranakin, zlatý retriever" },
    { w: 2, stars: 5, text: "Som typ čo číta zloženie. Mäso na prvom mieste a reálne ho cítiť, nie len na papieri. Bruno je vyberavý a toto zje bez prehrabávania.", bag: "hovadzie-morka-jahna-s-ryzou", by: "Rasťo C.", dog: "Bruno, francúzsky buldoček" },
    { w: 2, stars: 5, text: "Manžel tvrdil, že granule sú granule. Po mesiaci uznal, že Lord v obývačke už nesmrdí a hovienka na prechádzke sa dajú normálne zobrať do vrecka. Viac netreba hovoriť.", bag: "jelen-kralik-s-batatmi", by: "Ľubomíra P.", dog: "Lord, rotvajler, 6 rokov" },
    { w: 2, stars: 5, text: "Mega pohodlné. Granule prídu samé, presne keď dochádzajú. Dvakrát sa mi predtým stalo, že som v nedeľu večer zistila, že nemám čím kŕmiť… o jednu starosť menej.", bag: "jelen-kralik-s-batatmi", by: "Bibi S.", dog: "Luna a Oskar, bígle" },
    { w: 2, stars: 5, text: "naša Roxy pekne rastie a osvaľuje sa najlepšie z celého vrhu, chovateľka bola prekvapená keď sme prišli na kontrolu. fakt kvalita", bag: "morka-hus-kacica-s-tekvicou", by: "Peter O.", dog: "Roxy, šteňa nemeckého ovčiaka" },
    { w: 2, stars: 5, text: "Kvalita výborná, trávenie bez problémov. Prvé doručenie meškalo o deň, odvtedy chodí presne. Oceňujem, že sa dá posunúť termín, keď sme na dovolenke.", bag: "hovadzie-s-ryzou", by: "Janka R.", dog: "Arya, vizsla" },
    { w: 3, stars: 4, text: "trávenie super, stolica konečne normálna. prvý týždeň to bolo trochu na striedačku, miešali sme so starými granulami, ale zvládli sme to. hviezdička dole len za ten prechod, inak spokojnosť", bag: "morka-hus-kacica-s-tekvicou", by: "Michaela K.", dog: "Ella, labrador" },
    { w: 1, stars: 5, text: "pohoda", bag: "hovadzie-morka-jahna-s-ryzou", by: "Monika B.", dog: "Kika, jack russell teriér" },
    { w: 2, stars: 5, text: "Bady má 9 rokov a citlivé brucho odjakživa. Po prechode žiadne nafukovanie ani hnačky ako predtým. Veterinárka sa pýtala, čo sme zmenili.", bag: "jahna-s-batatmi-cucoriedkami", by: "Laura B.", dog: "Bady, kríženec, 9 rokov" },
    { w: 1, stars: 5, text: "dlho sme hladali nieco co mu sadne, vsetko skoncilo hnackou. tu konecne pevne hovienka a ziadne behanie von o 3 rano 😅", bag: "jahna-s-batatmi-cucoriedkami", by: "Juraj H.", dog: "Max, border kólia" }
  ];
  // pre produktovú sekciu (počet recenzií, fotky zákazníkov)
  var REAL = PHOTOS.filter(function (r) { return !r.ph; });
  window.GranulaReviews = { count: REAL.length + TEXTS.length, photos: REAL };
  var SPEED = [30, 25]; // px za sekundu (rady idú opačne a rôzne rýchlo)

  function bagImg(b) { return '<img src="' + P + b + '.webp" alt="" width="896" height="1200" loading="lazy">'; }
  function stars(n) {
    var s = "";
    for (var i = 0; i < 5; i++) s += '<span class="star' + (i < n ? "" : " off") + '"></span>';
    return '<span class="rate" role="img" aria-label="Hodnotenie ' + n + ' z 5">' + s + "</span>";
  }
  function photoCard(r, hidden) {
    return '<li class="rw-c rw-ph"' + (hidden ? ' aria-hidden="true"' : "") + '><img class="rw-img" src="' + r.img + '" alt="' + (hidden ? "" : r.alt) +
      '" width="600" height="720" loading="lazy"><div class="rw-prod">' + bagImg(r.bag) + '<span class="rw-pt"><b>' + r.dog + "</b><small>" + r.by + "</small></span></div></li>";
  }
  function textCard(r, hidden) {
    return '<li class="rw-c rw-tx rw-w' + r.w + '"' + (hidden ? ' aria-hidden="true"' : "") + ">" + stars(r.stars) + "<p>„" + r.text + "“</p>" +
      '<div class="rw-by">' + bagImg(r.bag) + "<span><b>" + r.by + "</b><br>" + r.dog + "</span></div></li>";
  }
  function card(it, hidden) { return it.kind === "p" ? photoCard(it.r, hidden) : textCard(it.r, hidden); }

  // šírky kariet sa merajú z CSS (na mobile sú menšie)
  function measure(wrap) {
    var ul = document.createElement("ul");
    ul.className = "rw-row";
    ul.style.cssText = "position:absolute;visibility:hidden;animation:none;left:0;top:0";
    ul.innerHTML = '<li class="rw-c rw-ph"></li><li class="rw-c rw-tx rw-w1"></li><li class="rw-c rw-tx rw-w2"></li><li class="rw-c rw-tx rw-w3"></li>';
    wrap.appendChild(ul);
    var li = ul.children, gap = parseFloat(getComputedStyle(ul).columnGap) || 12;
    var m = { p: li[0].offsetWidth, 1: li[1].offsetWidth, 2: li[2].offsetWidth, 3: li[3].offsetWidth, gap: gap };
    wrap.removeChild(ul);
    return m;
  }

  // dva rady, ktoré sa samy posúvajú opačným smerom (nekonečný pás).
  // Pomer ~1 písaná : 5 fotiek. Keď fotky na šírku nestačia, opakujú sa (každý rad začína inou fotkou),
  // aby rad bol dlhší ako obrazovka + najširšia karta. Písané sa neopakujú.
  function plan(V, m) {
    var owners = PHOTOS.map(function (r) { return r.by; });
    var texts = TEXTS.filter(function (r) { return owners.indexOf(r.by) === -1; });
    var widest = Math.max(m.p, m[1], m[2], m[3]), target = V + widest + m.gap;
    var rows = [], ws = [], t = 0, n = PHOTOS.length;
    for (var ri = 0; ri < 2; ri++) {
      var row = [], w = 0, k = 0, start = ri ? Math.floor(n / 2) : 0;
      while (w < target || k < Math.ceil(n / 2)) {
        row.push({ kind: "p", r: PHOTOS[(start + k) % n] }); w += m.p + m.gap; k++;
        if (k % 5 === 3 && t < texts.length) { var tx = texts[t++]; row.push({ kind: "t", r: tx }); w += m[tx.w] + m.gap; }
      }
      rows.push(row); ws.push(w);
    }
    return { rows: rows, w: ws, key: rows.map(function (r) { return r.length; }).join("/") };
  }

  function render(wrap) {
    var V = wrap.clientWidth;
    if (!V) return;
    var m = measure(wrap), pl = plan(V, m);
    if (wrap._rwKey === pl.key) return;
    wrap._rwKey = pl.key;
    wrap.innerHTML = pl.rows.map(function (row, i) {
      var html = row.map(function (it) { return card(it, false); }).join("") + row.map(function (it) { return card(it, true); }).join("");
      return '<ul class="rw-row rw-' + (i ? "b" : "a") + '" style="animation-duration:' + Math.round(pl.w[i] / SPEED[i]) + 's">' + html + "</ul>";
    }).join("");
  }

  function init() {
    var wraps = [].slice.call(document.querySelectorAll("[data-reviews]"));
    if (!wraps.length) return;
    wraps.forEach(render);
    var tm;
    window.addEventListener("resize", function () { clearTimeout(tm); tm = setTimeout(function () { wraps.forEach(render); }, 200); });
    // sekcia môže byť pri načítaní skrytá (výsledok konfigurátora): vykresliť, keď sa ukáže
    if ("ResizeObserver" in window) {
      var ro = new ResizeObserver(function (en) { en.forEach(function (e) { render(e.target); }); });
      wraps.forEach(function (w) { ro.observe(w); });
    }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
