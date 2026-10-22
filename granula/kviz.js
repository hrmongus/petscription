/* Granula — dotazník „Granule na mieru“: obrazovky, stav a vykreslenie.
   Všetky výpočty robí engine.js (GranulaEngine.compute), tu sa nič nepočíta. */
(function () {
  var E = window.GranulaEngine;

  // testovacie parametre z kontrolnej stránky (len v tomto prehliadači)
  var params = null;
  try { params = JSON.parse(localStorage.getItem(E.OVERRIDE_KEY)); } catch (e) {}
  if (params) {
    var banner = document.createElement("div");
    banner.className = "test-banner";
    banner.innerHTML = 'Dotazník počíta s testovacími parametrami z <a href="admin-vypocet.html">kontrolnej stránky</a>.';
    document.body.appendChild(banner);
  }

  /* ---------------- stav ---------------- */
  var KEY = "granula-quiz";
  var state = { dogname: "", sex: "", breed: "krizenec-stredny", kg: 17, years: "", months: "", weeks: "",
    activity: "", neutered: "", pregnant: "", body: "", focus: [], bag: "", plan: "mesiac", ordered: false };
  try { Object.assign(state, JSON.parse(sessionStorage.getItem(KEY)) || {}); } catch (e) {}
  function save() {
    try { sessionStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {}
  }

  var quiz = document.getElementById("quiz");
  var order = document.getElementById("order");
  var $ = function (id) { return document.getElementById(id); };
  var eur = function (n) { return n == null ? "cena doplniť" : n.toFixed(2).replace(".", ",") + " €"; };
  var num = function (n, d) { return (d ? n.toFixed(d) : String(Math.round(n))).replace(".", ","); };
  function plural(n, one, few, many) { return n === 1 ? one : (n >= 2 && n <= 4 ? few : many); }
  function result() { return E.compute(state, params); }


  /* ---------------- plemeno, váha, vek ---------------- */
  var sel = $("breed");
  // plemená v skupinách: kríženci, potom od najmenších
  var GROUPS = [["Kríženec", function (b) { return b.mix; }]].concat(["trpaslicie", "male", "stredne", "velke", "obrie"].map(function (s) {
    return [E.SIZE_TEXT[s].charAt(0).toUpperCase() + E.SIZE_TEXT[s].slice(1) + " plemená", function (b) { return !b.mix && b.size === s; }];
  }));
  GROUPS.forEach(function (g) {
    var og = document.createElement("optgroup"); og.label = g[0];
    E.BREEDS.filter(g[1]).forEach(function (b) { og.appendChild(new Option(b.name, b.id)); });
    sel.appendChild(og);
  });
  function breedOf(id) { return E.BREEDS.filter(function (x) { return x.id === id; })[0]; }
  var kg = $("kg"), kgOut = $("kg-out");
  function paintKg() {
    kgOut.textContent = String(kg.value).replace(".", ",") + " kg";
    kg.style.setProperty("--p", ((kg.value - kg.min) / (kg.max - kg.min) * 100) + "%");
  }
  sel.addEventListener("change", function () {
    var b = breedOf(sel.value);
    if (b) { state.kg = b.avg; kg.value = b.avg; paintKg(); }
  });
  kg.addEventListener("input", paintKg);

  // podmienené otázky: týždne pri veľmi mladom šteniatku, gravidita pri nekastrovanej fenke
  function needWeeks() { return (parseInt(state.years, 10) || 0) === 0 && state.months !== "" && (parseInt(state.months, 10) || 0) <= 2; }
  // gravidita sa pýta len pri nekastrovanej fenke od 6 mesiacov
  function needPreg() {
    var months = (parseInt(state.years, 10) || 0) * 12 + (parseInt(state.months, 10) || 0);
    return state.sex === "fenka" && state.neutered === "nie" && months >= 6;
  }
  function paintConditional() {
    $("weeks-field").hidden = !needWeeks();
    $("preg-field").hidden = !needPreg();
  }

  /* ---------------- krok 6: exkluzívne „Nič konkrétne“ ---------------- */
  quiz.addEventListener("change", function (e) {
    var t = e.target;
    if (t.name === "focus") {
      var boxes = quiz.querySelectorAll('input[name="focus"]');
      if (t.value === "nic" && t.checked) boxes.forEach(function (b) { if (b !== t) b.checked = false; });
      if (t.value !== "nic" && t.checked) quiz.querySelector('input[value="nic"]').checked = false;
    }
    read();
  });

  // formulár → stav
  function read() {
    var fd = new FormData(quiz);
    state.dogname = (fd.get("dogname") || "").trim();
    state.sex = fd.get("sex") || "";
    state.breed = fd.get("breed");
    state.kg = +fd.get("kg");
    state.years = fd.get("years");
    state.months = fd.get("months");
    state.weeks = fd.get("weeks") || "";
    state.activity = fd.get("activity") || "";
    state.neutered = fd.get("neutered") || "";
    state.pregnant = fd.get("pregnant") || "";
    state.body = fd.get("body") || "";
    state.focus = fd.getAll("focus");
    paintName();
    paintConditional();
    save();
    var err = quiz.querySelector('[data-err="' + current + '"]');
    if (err && valid(current)) err.hidden = true;
  }
  // stav → formulár
  function fill() {
    if (!breedOf(state.breed)) state.breed = "krizenec-stredny";
    quiz.dogname.value = state.dogname;
    sel.value = state.breed;
    kg.value = state.kg; paintKg();
    quiz.years.value = state.years; quiz.months.value = state.months; quiz.weeks.value = state.weeks;
    ["sex", "activity", "neutered", "pregnant", "body"].forEach(function (n) {
      quiz.querySelectorAll('input[name="' + n + '"]').forEach(function (r) { r.checked = r.value === state[n]; });
    });
    quiz.querySelectorAll('input[name="focus"]').forEach(function (c) { c.checked = state.focus.indexOf(c.value) !== -1; });
    order.querySelectorAll('input[name="plan"]').forEach(function (r) { r.checked = r.value === state.plan; });
    paintName();
    paintConditional();
  }
  quiz.addEventListener("input", read);

  // meno v nominatíve sa dá vložiť bez skloňovania („Kto je Bruno?“)
  function paintName() {
    document.querySelectorAll("[data-name]").forEach(function (el) { el.textContent = state.dogname || el.dataset.name; });
    var f = state.sex === "fenka";
    $("neut-q").textContent = f ? "Je kastrovaná?" : "Je kastrovaný?";
    $("neut-h").textContent = f ? "Sterilizácia sa počíta tiež." : "";
  }
  function valid(step) {
    switch (step) {
      case "krok-1": return !!state.dogname && !!state.sex;
      case "krok-3":
        var y = state.years === "" ? 0 : +state.years, m = state.months === "" ? 0 : +state.months;
        var w = state.weeks === "" ? 0 : +state.weeks;
        var age = (state.years !== "" || state.months !== "") && y >= 0 && y <= 25 && m >= 0 && m <= 11 && (y * 12 + m > 0 || (needWeeks() && w > 0));
        return age && state.kg > 0;
      case "krok-4": return !!state.activity;
      case "krok-5": return !!state.neutered && !!state.body && (!needPreg() || !!state.pregnant);
      case "krok-6": return state.focus.length > 0;
      default: return true;
    }
  }
  var STEPS = ["krok-1", "krok-2", "krok-3", "krok-4", "krok-5", "krok-6"];
  function firstInvalid() {
    for (var i = 0; i < STEPS.length; i++) if (!valid(STEPS[i])) return STEPS[i];
    return null;
  }

  quiz.addEventListener("click", function (e) {
    var btn = e.target.closest("[data-next],[data-prev]");
    if (!btn) return;
    var cur = current, i = STEPS.indexOf(cur);
    if (btn.hasAttribute("data-prev")) { go(STEPS[i - 1]); return; }
    read();
    var err = quiz.querySelector('[data-err="' + cur + '"]');
    if (!valid(cur)) { if (err) err.hidden = false; return; }
    if (err) err.hidden = true;
    go(i < STEPS.length - 1 ? STEPS[i + 1] : "miesame");
  });

  /* ---------------- miešanie ---------------- */
  var mixRaf = 0;
  function runMix() {
    var items = $("mix-list").children, pct = $("mix-pct");
    var dur = matchMedia("(prefers-reduced-motion: reduce)").matches ? 600 : 3200, t0 = performance.now();
    cancelAnimationFrame(mixRaf);
    (function tick(t) {
      var p = Math.min(1, (t - t0) / dur), v = Math.round(p * 100);
      pct.textContent = v + " %";
      for (var i = 0; i < items.length; i++) {
        var done = v >= (i + 1) * 25, now = !done && v >= i * 25;
        items[i].className = done ? "done" : now ? "now" : "";
      }
      if (p < 1) mixRaf = requestAnimationFrame(tick);
      else setTimeout(function () { if (current === "miesame") location.hash = "vysledok"; }, 450);
    })(t0);
  }

  /* ---------------- výsledok ---------------- */
  function bagOf(r) {
    return r.bags.filter(function (x) { return x.bag.id === state.bag; })[0] ||
      r.bags.filter(function (x) { return x.bag.id === r.recBag; })[0];
  }
  function renderResult() {
    var r = result(), d = r.derived, p = r.product;
    // vysvetľujúci text sa ukazuje len vtedy, keď pre psa nemáme vhodné granule
    $("r-why").hidden = !!p;
    if (!p) { $("r-name").textContent = "Pre tohto psa nemáme vhodné granule"; $("r-why").textContent = "Napíš nám, poradíme osobne."; return; }
    if (!r.bags.some(function (x) { return x.bag.id === state.bag; })) state.bag = r.recBag;
    var I = GranulaIcons.svg;
    $("r-kicker").textContent = "Tvoje granule na mieru · " + state.dogname;
    $("r-name").textContent = p.name;
    var ICON_BG = ["var(--o)", "var(--l)", "var(--r)", "var(--m)"];
    // hlavné suroviny: nálepky okolo vreca (desktop aj mobil) a textový zoznam pre čítačky
    var chips = p.highlights.map(function (h, i) {
      return '<span class="it"><span style="background:' + ICON_BG[i % 4] + ";color:" + ICON_BG[i % 4] + '">' + I(h[0], 30, "#000000") + "</span>" + h[1] + " " + h[2] + " %</span>";
    }).join("");
    $("r-chips").innerHTML = $("r-chips-m").innerHTML = chips;
    $("r-recipe").innerHTML = p.highlights.map(function (h) { return "<li>" + h[1] + " " + h[2] + " %</li>"; }).join("");
    $("r-dose").textContent = r.dose.grams + " g";
    $("r-macro").textContent = p.protein + " / " + p.fat + " %";
    var month = r.dose.grams * 30 / 1000;
    $("r-month").textContent = "~" + (month >= 3 ? num(month) : num(month, 1)) + " kg";

    $("r-bags").innerHTML = r.bags.map(function (x) {
      return '<label class="opt bagopt"><input type="radio" name="bag" value="' + x.bag.id + '"' + (x.bag.id === state.bag ? " checked" : "") + ">" +
        "<span><b>" + x.bag.label + "</b><small>vydrží " + x.days + " " + plural(x.days, "deň", "dni", "dní") + "</small></span>" +
        '<span class="price">' + (x.price == null ? "cena —" : eur(x.price)) + "</span>" + (x.bag.id === r.recBag ? '<span class="rec">Odporúčame</span>' : "") + "</label>";
    }).join("");

    $("f-comp").textContent = p.composition;
    $("f-anal").textContent = "Proteín " + p.protein + " %, hrubý tuk " + p.fat + " %" +
      (p.missing.some(function (m) { return /popol/.test(m); }) ? " (ostatné hodnoty doplníme)." :
        ", popol " + num(p.ash, p.ash % 1 ? 1 : 0) + " %, vláknina " + num(p.fiber, 1) + " %, vápnik " + num(p.calcium, 1) + " %, fosfor " + num(p.phosphorus, 1) + " %, vlhkosť " + p.moisture + " %.");
    $("f-add").textContent = p.additives || "Doplníme.";
    $("f-trace").textContent = p.trace || "Doplníme.";

    $("r-pack").src = p.img;
    $("r-pack").alt = "Vrece Granula: " + p.name + ", 9 kg";
    $("r-pack-m").src = p.img;
    $("r-stage").textContent = $("r-stage-m").textContent = d.isPuppy ? "Pre šteňa" : d.stage === "senior" ? "Pre seniora" : "Na mieru";
    paintBag(r);
  }
  function paintBag(r) {
    var x = bagOf(r);
    $("r-perday").textContent = x.price == null ? "Cena sa doplní" : eur(x.price * (1 - r.params.plans.mesiac) / x.days) + " na deň";
  }
  $("r-bags").addEventListener("change", function (e) {
    state.bag = e.target.value; save(); paintBag(result());
  });

  /* ---------------- objednávka ---------------- */
  function renderOrder() {
    var r = result(), p = r.product, x = bagOf(r), plans = r.params.plans, d = plans[state.plan];
    Object.keys(plans).forEach(function (k) {
      order.querySelector('[data-plan-price="' + k + '"]').textContent =
        x.price == null ? "cena doplniť" : eur(x.price * (1 - plans[k])) + (k === "raz" ? "" : " / vrece");
    });
    $("s-pack").src = p.img;
    $("s-name").textContent = p.name;
    $("s-meta").textContent = x.bag.label + " · " + r.dose.grams + " g denne · vydrží " + x.days + " " + plural(x.days, "deň", "dni", "dní");
    $("s-bag-l").textContent = "Vrece " + x.bag.label;
    $("s-bag").textContent = eur(x.price);
    $("s-disc-row").hidden = !d || x.price == null;
    $("s-disc-l").textContent = "Zľava predplatného −" + Math.round(d * 100) + " %";
    $("s-disc").textContent = x.price == null ? "" : "−" + eur(x.price * d);
    $("s-total").textContent = x.price == null ? "—" : eur(Math.round((x.price * (1 - d) + r.params.shipping) * 100) / 100);
    $("s-submit").textContent = d ? "Objednať predplatné" : "Objednať";
    $("s-note").textContent = d
      ? "Platíš pri každom doručení. Ďalšie vrece pošleme okolo " + x.nextDay + ". dňa, skôr než sa to staré minie."
      : "Platíš raz. Ďalšie vrece si objednáš, keď budeš chcieť.";
  }
  function shipUI() {
    var v = order.ship.value;
    $("ship-point").hidden = v === "adresa";
    $("ship-addr").hidden = v !== "adresa";
  }
  $("pick-btn").addEventListener("click", function () {
    // sem príde widget dopravcu (SPS / Packeta); dovtedy textové pole
    var f = $("point"); f.hidden = false; this.setAttribute("aria-expanded", "true"); f.focus();
  });
  order.addEventListener("change", function (e) {
    if (e.target.name === "plan") { state.plan = e.target.value; save(); renderOrder(); }
    if (e.target.name === "ship") shipUI();
  });
  order.addEventListener("submit", function (e) {
    e.preventDefault();
    var addr = order.ship.value === "adresa";
    var need = ["email", "fullname", "tel", "cc", "exp", "cvc"].concat(addr ? ["street", "zip", "city"] : ["point"]);
    var bad = need.filter(function (n) {
      var f = order.elements[n];
      return !f.value.trim() || (f.type === "email" && !f.checkValidity());
    });
    order.querySelectorAll(".input").forEach(function (f) { f.style.borderColor = ""; f.removeAttribute("aria-invalid"); });
    bad.forEach(function (n) { var f = order.elements[n]; f.style.borderColor = "#B3261E"; f.setAttribute("aria-invalid", "true"); });
    if (bad.length && bad.indexOf("point") !== -1) { $("point").hidden = false; }
    order.querySelector('[data-err="objednavka"]').hidden = !bad.length;
    if (bad.length) { order.elements[bad[0]].focus(); return; }
    // Žiadne dáta sa nikam neposielajú: platba sa napojí cez platobnú bránu (pozri README).
    order.querySelectorAll("#cc,#exp,#cvc").forEach(function (f) { f.value = ""; });
    state.ordered = true; save();
    location.hash = "hotovo";
  });

  /* ---------------- hotovo ---------------- */
  function renderDone() {
    var r = result(), x = bagOf(r), sub = r.params.plans[state.plan] > 0;
    $("d-text").textContent = state.dogname + " má večeru vybavenú: " + r.product.name + ". Prvé vrece sa chystá na cestu. Keď odíde, pošleme ti e-mail. " +
      (sub ? "Ďalšie príde samo okolo " + x.nextDay + ". dňa, skôr než miska zostane prázdna." : "Ďalšie si objednáš, keď budeš chcieť.");
    $("d-dose").textContent = r.dose.grams + " g";
    $("d-bag").textContent = x.bag.label;
    $("d-next").textContent = sub ? "~" + x.nextDay + ". deň" : "podľa teba";
  }

  /* ---------------- smerovanie cez #hash ---------------- */
  var current = null;
  var screens = {};
  document.querySelectorAll("[data-screen]").forEach(function (s) { screens[s.dataset.screen] = s; });
  function go(id) { location.hash = id; }
  function route() {
    var id = location.hash.slice(1);
    if (!screens[id]) id = "krok-1";
    var bad = firstInvalid();
    var after = ["miesame", "vysledok", "objednavka", "hotovo"];
    if (STEPS.indexOf(id) > STEPS.indexOf(bad) && bad && STEPS.indexOf(id) !== -1) id = bad;
    if (after.indexOf(id) !== -1 && bad) id = bad;
    if (after.indexOf(id) !== -1 && id !== "miesame" && !result().product) id = "vysledok";
    if (id === "hotovo" && !state.ordered) id = "objednavka";
    if (id !== location.hash.slice(1)) { history.replaceState(null, "", "#" + id); }
    if (current === id) return;
    if (id !== "hotovo") state.ordered = false;
    current = id;
    Object.keys(screens).forEach(function (k) { screens[k].classList.toggle("on", k === id); });
    document.title = screens[id].dataset.title;
    if (id === "miesame") runMix(); else cancelAnimationFrame(mixRaf);
    if (id === "vysledok") renderResult();
    if (id === "objednavka") { renderOrder(); shipUI(); }
    if (id === "hotovo") renderDone();
    window.scrollTo(0, 0);
    var h = screens[id].querySelector(".q-title");
    if (h) h.focus({ preventScroll: true });
    save();
  }

  fill();
  window.addEventListener("hashchange", route);
  route();
})();
