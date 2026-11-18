/* Granula — porovnanie „Rozrež vrecko. Uvidíš rozdiel.“ (jeden zdroj pre úvodnú stránku aj výsledok konfigurátora).
   <div data-compare></div>                     → úvodná stránka (receptúra DEFAULT)
   GranulaCompare.render(el, productId)         → výsledok konfigurátora (receptúra podľa výberu)
   Receptúra bez vlastných podkladov zatiaľ použije DEFAULT (Jeleň & králik); keď prídu fotky prierezu
   a zloženie, stačí doplniť položku do RECIPES. */
(function () {
  "use strict";
  var D = "img/porovnanie/";
  var DEFAULT = "jelen-kralik";
  // bežné granule: ilustrácia typického zloženia lacných granúl z regálu
  var BAD = [
    ["b-obilniny", "Obilniny", null, "pšenica, kukurica", 45],
    ["b-masove-produkty", "Mäsové vedľajšie produkty", "Mäsokostná múčka", "mäsokostná múčka", 15],
    ["b-soja", "Rastlinné bielkovinové extrakty", "Sójové extrakty", "sója", 12],
    ["b-oleje", "Rastlinné oleje", "Oleje bez pôvodu", "neurčený zdroj", 9],
    ["b-repne-rezky", "Produkty rastlinného pôvodu", "Repné rezky", "repné rezky", 8],
    ["b-mineraly", "Minerálne látky", null, null, 5],
    ["b-cukry", "Cukry a melasa", null, null, 3],
    ["b-farbiva", "Farbivá, arómy, konzervanty", "Farbivá a arómy", null, 2],
    ["b-zelenina", "Zelenina", "Sušená zelenina", "sušená", 1]
  ];
  // [obrázok, názov, krátky názov na mobil, podnadpis, %]
  var RECIPES = {
    "jelen-kralik": {
      name: "Jeleň & králik",
      full: "Jeleň a králik s batátmi",
      bag: { src: D + "vrece-granula.webp", w: 640, h: 947, alt: "Rozrezané vrecko Granula Jeleň a králik s batátmi: mäso, batáty, zelenina, bylinky a čučoriedky" },
      items: [
        ["g-jelen", "Jelenie mäso", null, null, 35],
        ["g-bataty", "Batáty", null, null, 23],
        ["g-kralik", "Králičie mäso", null, null, 15],
        ["g-loj-tuk", "Jelení loj a bravčový tuk", "Loj a tuk", null, 10],
        ["g-zelenina", "Zelenina", null, "mrkva, petržlen, špenát", 7],
        ["g-bylinky", "Bylinky a funkčné zložky", "Bylinky", "pestrec, fenikel, šípky, harmanček, kolagén, konope, kvasnice", 5],
        ["g-cucoriedky", "Čučoriedky", null, null, 3],
        ["g-repna-vlaknina", "Repná vláknina", null, null, 2]
      ]
    }
  };

  function row(it) {
    var nm = it[2] ? '<span class="lg">' + it[1] + '</span><span class="sh">' + it[2] + "</span>" : it[1];
    var size = it[4] >= 15 ? " l" : it[4] >= 8 ? " m" : "";
    return '<li><img src="' + D + it[0] + '.webp" alt="" width="44" height="44" loading="lazy"><span class="cp-nm"><b>' + nm + "</b>" +
      (it[3] ? "<small>" + it[3] + "</small>" : "") + '</span><span class="cp-v' + size + '">' + it[4] + " %</span></li>";
  }
  function html(id) {
    var r = RECIPES[id] || RECIPES[DEFAULT];
    return '<div class="cp-wrap">' +
      '<div class="cp-bag cp-bag-b"><img src="' + D + 'vrece-bezne.webp" alt="Rozrezané vrecko bežných granúl: obilniny, sója, múčka, oleje, cukor a farbivá" width="660" height="1060" loading="lazy">' +
      '<div class="cp-cap"><span class="plain">Bežné granule</span></div></div>' +
      '<div class="cp-vs display" aria-hidden="true">vs</div>' +
      '<div class="cp-bag cp-bag-g"><img src="' + r.bag.src + '" alt="' + r.bag.alt + '" width="' + r.bag.w + '" height="' + r.bag.h + '" loading="lazy">' +
      '<div class="cp-cap"><span class="logo">Granula!</span><span class="display cp-rec">' + r.name.replace("&", "&amp;") + "</span></div></div>" +
      '<ul class="cp-list cp-bad" aria-label="Zloženie bežných granúl">' + BAD.map(row).join("") + "</ul>" +
      '<ul class="cp-list cp-good" aria-label="Zloženie Granula ' + r.full + '">' + r.items.map(row).join("") + "</ul>" +
      "</div>";
  }
  function render(el, id) { if (el) el.innerHTML = html(id); }
  window.GranulaCompare = { render: render, RECIPES: RECIPES, DEFAULT: DEFAULT };
  function init() {
    document.querySelectorAll("[data-compare]").forEach(function (el) { if (!el.innerHTML.trim()) render(el, el.getAttribute("data-compare") || DEFAULT); });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
