/* Granula — recenzie (jeden zdroj pre úvodnú stránku aj výsledok konfigurátora).
   Použitie: <div class="rw-wrap" data-reviews tabindex="0" aria-label="…"></div>
   Pravidlá:
   - žiadna recenzia nie je v oboch radoch naraz;
   - každý rad je dlhší ako šírka obrazovky + najširšia karta, takže sa tá istá karta
     (a jej kópia pre nekonečné posúvanie) nikdy neukáže dvakrát naraz;
   - prednosť majú fotky (pomer ~1 písaná : 4–5 fotiek), písané sa pridávajú len vtedy,
     keď fotky na šírku obrazovky nestačia;
   - písaná recenzia od majiteľa, ktorý má aj foto recenziu, sa nezobrazí spolu s ňou. */
(function () {
  "use strict";
  var P = "img/produkty/";
  var PHOTOS = [
    { img: "img/recenzie/dievca-dalmatin.webp", alt: "Dalmatínka Zara so zlatým retrieverom na prechádzke v meste", bag: "morka-hus-kacica-s-tekvicou", dog: "Zara, dalmatín", by: "Juraj K." },
    { img: "img/recenzie/pes-v-rukach.webp", alt: "Šteňa weimarského stavača Brix zdvihnuté v rukách proti modrej oblohe", bag: "jahna-s-batatmi-cucoriedkami", dog: "Brix, weimarský stavač", by: "Peter V." },
    { img: "img/recenzie/pes-luka.webp", alt: "Austrálsky ovčiak Tobi beží cez rozkvitnutú lúku", bag: "hovadzie-s-ryzou", dog: "Tobi, austrálsky ovčiak", by: "Tomáš R." },
    { img: "img/recenzie/pes-zlta-stena.webp", alt: "Kríženka Šuška sedí pred žltou drevenou stenou", bag: "jelen-kralik-s-batatmi", dog: "Šuška, kríženec z útulku", by: "Jakub F." },
    { img: "img/recenzie/pes-banan.webp", alt: "Šteňa Bimbo hryzie banán z ruky majiteľa", bag: "morka-hus-kacica-s-tekvicou", dog: "Bimbo, kríženec", by: "Martin B." },
    { img: "img/recenzie/border-kolia.webp", alt: "Border kólia Max s vyplazeným jazykom na lúke", bag: "jahna-s-batatmi-cucoriedkami", dog: "Max, border kólia", by: "Juraj H." },
    { img: "img/recenzie/psi-nos.webp", alt: "Detail nosa a jazyka kríženca Badyho", bag: "jahna-s-batatmi-cucoriedkami", dog: "Bady, kríženec, 9 rokov", by: "Laura B." }
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

  function plan(V, m) {
    var owners = PHOTOS.map(function (r) { return r.by; });
    var items = PHOTOS.map(function (r) { return { kind: "p", r: r, w: m.p + m.gap }; });
    var texts = TEXTS.filter(function (r) { return owners.indexOf(r.by) === -1; })
      .map(function (r) { return { kind: "t", r: r, w: m[r.w] + m.gap }; });
    var widest = Math.max(m.p, m[1], m[2], m[3]);
    var target = V + widest + m.gap;
    var rows = [[], []], w = [0, 0];
    function put(it) { var i = w[0] <= w[1] ? 0 : 1; rows[i].push(it); w[i] += it.w; }
    items.forEach(put);
    // fotky nestačia na šírku obrazovky: pridávaj písané recenzie do kratšieho radu
    var t = 0;
    while (Math.min(w[0], w[1]) < target && t < texts.length) put(texts[t++]);
    // písané rozložiť medzi fotky rovnomerne
    rows = rows.map(function (row) {
      var ph = row.filter(function (x) { return x.kind === "p"; }), tx = row.filter(function (x) { return x.kind === "t"; });
      if (!tx.length) return ph;
      var out = [], step = (ph.length + tx.length) / tx.length, next = step / 2, ti = 0, pi = 0;
      for (var k = 0; k < ph.length + tx.length; k++) {
        if (ti < tx.length && (k >= Math.floor(next) || pi >= ph.length)) { out.push(tx[ti++]); next += step; }
        else out.push(ph[pi++]);
      }
      return out;
    });
    return { rows: rows, w: w, key: rows.map(function (r) { return r.length; }).join("/") + ":" + t };
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
