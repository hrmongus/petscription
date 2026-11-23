/* Granula — produktová sekcia na úvodnej stránke (#produkt).
   Plemeno / vek / váha → cena „už od“ za deň z rovnakého výpočtu ako konfigurátor (engine.js);
   tlačidlo otvorí konfigurátor s predvyplnenými odpoveďami (?plemeno=…&vek=…&kg=…, číta kviz.js). */
(function () {
  "use strict";
  var root = document.querySelector("[data-product]");
  if (!root || !window.GranulaEngine) return;
  var E = window.GranulaEngine;
  var $ = function (id) { return document.getElementById(id); };
  var breed = $("pd-breed"), age = $("pd-age"), kg = $("pd-kg");

  // galéria: klik na náhľad prepne hlavnú fotku; s jednou fotkou sa riadok náhľadov skryje
  var thumbs = root.querySelectorAll(".pd-thumbs button");
  root.querySelector(".pd-thumbs").hidden = thumbs.length < 2;
  thumbs.forEach(function (b) {
    b.addEventListener("click", function () {
      $("pd-main").src = b.dataset.src; $("pd-main").alt = b.dataset.alt || "";
      thumbs.forEach(function (x) { x.setAttribute("aria-pressed", String(x === b)); });
    });
  });

  // garancia: „Ako to funguje?“ otvorí okno s podmienkami
  var gd = $("gd"), gdBtn = root.querySelector(".pd-gar-l");
  if (gd && gd.showModal) {
    gdBtn.addEventListener("click", function () { gd.showModal(); document.documentElement.classList.add("sd-open"); });
    gd.addEventListener("close", function () { document.documentElement.classList.remove("sd-open"); gdBtn.focus(); });
    gd.addEventListener("click", function (e) { if (e.target === gd || e.target.closest("[data-gd-close]")) gd.close(); });
  }

  // počet recenzií a fotky zákazníkov z reviews.js
  var R = window.GranulaReviews;
  if (R) {
    var n = R.count, w = n === 1 ? "recenzia" : n >= 2 && n <= 4 ? "recenzie" : "recenzií";
    root.querySelector("[data-review-count]").textContent = n + " " + w;
    $("pd-strip").innerHTML = R.photos.map(function (p) {
      return '<li><img src="' + p.img + '" alt="' + p.alt + '" width="600" height="720" loading="lazy"><span>' + p.dog.split(",")[0] + "</span></li>";
    }).join("");
  }

  // možnosti výberu: plemeno cez vyhľadávanie (breed-search.js, rovnaké ako v dotazníku)
  var AGES = [["m3", "3 mesiace"], ["m6", "6 mesiacov"], ["m9", "9 mesiacov"], ["r1", "1 rok"]];
  for (var y = 2; y <= 16; y++) AGES.push(["r" + y, y + (y <= 4 ? " roky" : " rokov")]);
  age.innerHTML = AGES.map(function (a) { return '<option value="' + a[0] + '">' + a[1] + "</option>"; }).join("");
  var KG = [[2, "do 3 kg"], [4, "3–5 kg"], [6.5, "5–8 kg"], [10, "8–12 kg"], [13.5, "12–15 kg"], [17.5, "15–20 kg"], [22.5, "20–25 kg"], [27.5, "25–30 kg"], [35, "30–40 kg"], [45, "40–50 kg"], [55, "50+ kg"]];
  kg.innerHTML = KG.map(function (k) { return '<option value="' + k[0] + '">' + k[1] + "</option>"; }).join("");
  function kgFor(avg) { var best = KG[0][0]; KG.forEach(function (k) { if (Math.abs(k[0] - avg) < Math.abs(best - avg)) best = k[0]; }); return best; }
  // plemeno nie je predvybrané: pole je prázdne (píšu sa príklady), cena sa dovtedy ráta z veku a váhy
  var breedUI = GranulaBreedSearch(root.querySelector(".pd-bs"), breed, { emptyId: "" });
  breed.selectedIndex = -1; breedUI.paint();
  age.value = "r2"; kg.value = String(kgFor(17));

  function eur(x) { return x.toFixed(2).replace(".", ",") + " €"; }
  // najnižšia cena za kg (najväčšie vrece, s predplatným); ceny sú rovnaké pre všetky receptúry
  var BEST = (function () {
    var P = E.PARAMS, best = null;
    E.BAGS.forEach(function (b) {
      var v = P.bagPrices[b.id];
      if (v != null && !isNaN(v)) { var perKg = v * (1 - P.plans.mesiac) / b.kg; if (!best || perKg < best.v) best = { v: perKg, bag: b }; }
    });
    return best;
  })();
  // jediná cena: „už od X / deň“ = denná dávka zvoleného psa × najnižšia cena za kg
  function update() {
    var v = /^([rm])(\d+)$/.exec(age.value);
    var a = { dogname: "", sex: "pes", breed: breed.value || null, breedSet: !!breed.value, kg: parseFloat(kg.value),
      years: v[1] === "r" ? v[2] : "0", months: v[1] === "m" ? v[2] : "0", weeks: "",
      activity: "mesto", neutered: "nie", pregnant: "", body: "akurat", focus: [], allergies: [] };
    var r = E.compute(a), p = r.product;
    if (p) { $("pd-bag").src = p.img; $("pd-bag").alt = "Vrece Granula: " + p.name; }
    var ok = p && r.dose && BEST;
    $("pd-perday").textContent = ok ? eur(r.dose.grams / 1000 * BEST.v) : "—";
    $("pd-note").textContent = ok ? "s predplatným, pri vreci " + BEST.bag.label : "";
  }
  breed.addEventListener("change", function () {
    var b = E.BREEDS.filter(function (x) { return x.id === breed.value; })[0];
    if (b) kg.value = String(kgFor(b.avg));
    update();
  });
  age.addEventListener("change", update);
  kg.addEventListener("change", update);
  update();
})();
