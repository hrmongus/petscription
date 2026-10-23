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
    activity: "", neutered: "", pregnant: "", body: "", focus: [], bag: "", plan: "mesiac", ordered: false, recipe: "", recipeFor: "", bagKey: "" };
  try { Object.assign(state, JSON.parse(sessionStorage.getItem(KEY)) || {}); } catch (e) {}
  if (!(state.plan in E.PARAMS.plans)) state.plan = "mesiac"; // napr. zrušená možnosť „na 3 mesiace“
  // dokončené odpovede si pamätáme aj po zatvorení prehliadača (len v tomto prehliadači, max. 3 psy)
  var SAVED_KEY = "granula-psy";
  var ANSWERS = ["dogname", "sex", "breed", "kg", "years", "months", "weeks", "activity", "neutered", "pregnant", "body", "focus", "bag", "bagKey", "plan", "recipe", "recipeFor"];
  function savedDogs() {
    try { var l = JSON.parse(localStorage.getItem(SAVED_KEY)); return Array.isArray(l) ? l : []; } catch (e) { return []; }
  }
  function storeDogs(l) { try { localStorage.setItem(SAVED_KEY, JSON.stringify(l.slice(0, 3))); } catch (e) {} }
  function save() {
    try { sessionStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {}
    if (!state.dogname || firstInvalid()) return;
    var a = {};
    ANSWERS.forEach(function (k) { a[k] = state[k]; });
    storeDogs([a].concat(savedDogs().filter(function (d) { return d.dogname.toLowerCase() !== state.dogname.toLowerCase(); })));
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
  /* pokračovať s uloženým psom */
  var PAW = '<svg viewBox="0 0 24 24" aria-hidden="true"><ellipse cx="12" cy="16.5" rx="5.2" ry="4.3"/><ellipse cx="5.2" cy="10.6" rx="2.2" ry="2.8"/><ellipse cx="9.3" cy="6.2" rx="2.2" ry="2.9"/><ellipse cx="14.7" cy="6.2" rx="2.2" ry="2.9"/><ellipse cx="18.8" cy="10.6" rx="2.2" ry="2.8"/></svg>';
  function paintResume() {
    var list = savedDogs().filter(function (d) { return d.dogname && d.dogname.toLowerCase() !== state.dogname.toLowerCase(); });
    $("resume").hidden = !list.length;
    $("resume-list").innerHTML = list.map(function (d) {
      var b = breedOf(d.breed), esc = d.dogname.replace(/[&<>"]/g, function (c) { return "&#" + c.charCodeAt(0) + ";"; });
      return '<div class="rs"><button type="button" class="rs-go" data-resume="' + esc + '"><span class="rs-ico">' + PAW + "</span><span><b>" + esc + "</b><small>" +
        (b ? b.name : "") + " · " + String(d.kg).replace(".", ",") + ' kg</small></span><span class="rs-arr" aria-hidden="true">→</span></button>' +
        '<button type="button" class="rs-x" data-forget="' + esc + '" aria-label="Zabudnúť ' + esc + '">×</button></div>';
    }).join("");
  }
  $("resume-list").addEventListener("click", function (e) {
    var t = e.target.closest("button"); if (!t) return;
    var name = t.dataset.resume || t.dataset.forget, all = savedDogs();
    var d = all.filter(function (x) { return x.dogname === name; })[0];
    if (t.dataset.forget) { storeDogs(all.filter(function (x) { return x !== d; })); paintResume(); return; }
    if (!d) return;
    Object.assign(state, d, { ordered: false });
    fill(); save();
    go(firstInvalid() || "vysledok");
  });

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
    paintResume();
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
    dropIngredients(dur);
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

  // suroviny receptúry padajú do misky: od spodného radu ku kôpke navrchu
  var SLOTS = [[20, 60], [35, 61], [50, 62], [65, 61], [80, 60], [28, 52], [42, 52], [57, 53], [72, 52], [35, 44], [50, 44], [64, 45], [43, 36], [57, 37]];
  function dropIngredients(dur) {
    var box = $("mix-drops"), p = result().product;
    var icons = p ? p.highlights.map(function (h) { return h[0]; }) : ["krava", "morka", "jahna", "ryza"];
    var BG = ["var(--o)", "var(--l)", "var(--r)", "var(--white)"];
    var fall = box.offsetHeight * 0.75 + "px";
    box.innerHTML = SLOTS.map(function (s, i) {
      var k = i % icons.length, r = ((i * 47) % 60) - 30;
      return '<span class="drop" style="--x:' + s[0] + "%;--y:" + s[1] + "%;--rot:" + r + "deg;--d:" + Math.round(i * (dur - 700) / SLOTS.length) + "ms;--fall:" + fall + ";background:" + BG[k % BG.length] + '">' +
        GranulaIcons.svg(icons[k], 40, "#000000") + "</span>";
    }).join("");
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
    if (!p) { $("r-swap").hidden = true; $("r-name").textContent = "Pre tohto psa nemáme vhodné granule"; $("r-why").textContent = "Napíš nám, poradíme osobne."; return; }
    // odporúčané vrece je predvolené; vlastný výber platí, kým sa nezmení receptúra alebo dávka
    var bagKey = p.id + "|" + r.dose.grams;
    if (state.bagKey !== bagKey || !r.bags.some(function (x) { return x.bag.id === state.bag; })) { state.bag = r.recBag; state.bagKey = bagKey; save(); }
    var I = GranulaIcons.svg;
    $("r-kicker").textContent = "Tvoje granule na mieru · " + state.dogname;
    $("r-name").textContent = p.name;
    var ICON_BG = ["var(--o)", "var(--l)", "var(--r)", "var(--m)"];
    // hlavné suroviny: nálepky pod názvom receptúry a textový zoznam pre čítačky
    var chips = p.highlights.map(function (h, i) {
      return '<span class="it"><span style="background:' + ICON_BG[i % 4] + ";color:" + ICON_BG[i % 4] + '">' + I(h[0], 30, "#000000") + "</span>" + h[1] + " " + h[2] + " %</span>";
    }).join("");
    $("r-chips").innerHTML = chips;
    renderSwap(r);
    $("r-recipe").innerHTML = p.highlights.map(function (h) { return "<li>" + h[1] + " " + h[2] + " %</li>"; }).join("");
    $("r-dose").textContent = r.dose.grams + " g";
    $("f-keep").textContent = r.dose.grams + " g";
    $("f-up").textContent = Math.round(r.dose.grams * 1.1) + " g";
    $("f-down").textContent = Math.round(r.dose.grams * 0.9) + " g";
    $("r-macro").textContent = p.protein + " / " + p.fat + " %";
    var month = r.dose.grams * 30 / 1000;
    $("r-month").textContent = "~" + (month >= 3 ? num(month) : num(month, 1)) + " kg";

    $("r-bags").innerHTML = r.bags.map(function (x) {
      return '<label class="opt bagopt"><input type="radio" name="bag" value="' + x.bag.id + '"' + (x.bag.id === state.bag ? " checked" : "") + ">" +
        "<b>" + x.bag.label + "</b>" +
        '<span class="price">' + (x.price == null ? "cena —" : eur(x.price)) + "</span>" +
        "<small>vydrží " + x.days + " " + plural(x.days, "deň", "dni", "dní") + "</small>" +
        (x.saving > 0 ? '<span class="save">−' + x.saving + " % za kg</span>" : "") +
        (x.bag.id === r.recBag ? '<span class="rec">Odporúčame</span>' : "") + "</label>";
    }).join("");

    $("f-comp").textContent = p.composition;
    $("f-anal").textContent = "Proteín " + p.protein + " %, hrubý tuk " + p.fat + " %" +
      (p.missing.some(function (m) { return /popol/.test(m); }) ? " (ostatné hodnoty doplníme)." :
        ", popol " + num(p.ash, p.ash % 1 ? 1 : 0) + " %, vláknina " + num(p.fiber, 1) + " %, vápnik " + num(p.calcium, 1) + " %, fosfor " + num(p.phosphorus, 1) + " %, vlhkosť " + p.moisture + " %.");
    $("f-add").textContent = p.additives || "Doplníme.";
    $("f-trace").textContent = p.trace || "Doplníme.";

    $("r-pack").src = p.img;
    $("r-pack").alt = "Vrece Granula: " + p.name;
    $("r-pack-m").src = p.img;
    // fakty v bočnom paneli (len tie, ktoré o produkte vieme)
    $("r-facts-side").innerHTML = [
      ["Mäso", p.monoprotein ? "Monoproteín" : "Viac druhov"],
      ["Bielkoviny / tuk", p.protein + " / " + p.fat + " %"],
      ["Granula", p.kibbleMm ? p.kibbleMm + " mm" : null],
      ["Glukozamín", p.glucosamine ? p.glucosamine + " mg/kg" : null],
      ["Chondroitín", p.chondroitin ? p.chondroitin + " mg/kg" : null]
    ].filter(function (f) { return f[1]; }).slice(0, 4).map(function (f) {
      return "<div><dt>" + f[0] + "</dt><dd>" + f[1] + "</dd></div>";
    }).join("");
    $("r-stage").textContent = $("r-stage-m").textContent = d.isPuppy ? "Pre šteňa" : d.stage === "senior" ? "Pre seniora" : "Na mieru";
    paintBag(r);
  }
  /* „Netoleruje tento proteín?“ — receptúry bez mäsa súčasnej, porovnanie a zmena */
  var swapPick = null;
  function meatName(p) {
    var m = p.proteins.map(function (x, i) { return i ? x.toLowerCase() : x; });
    return m.length > 1 ? m.slice(0, -1).join(", ") + " & " + m[m.length - 1] : m[0];
  }
  function shared(x, p) { return x.proteins.filter(function (m) { return p.proteins.indexOf(m) !== -1; }); }
  function lower(s) { return s.charAt(0).toLowerCase() + s.slice(1); }
  function swapWhy(e) {
    var blocked = e.unfitFor.filter(function (x) { return x.ok; });
    if (blocked.length) return "Výrobca ju neodporúča pri: " + blocked.map(function (x) { return lower(x.label); }).join(", ") + ".";
    return "Výrobca ju určuje pre: " + e.fitFor.map(function (x) { return lower(x.label); }).join("; ") + ".";
  }
  function renderSwap(r) {
    var p = r.product, rec = r.recommended;
    var note = $("swap-note");
    note.hidden = !r.swapped;
    if (r.swapped) note.innerHTML = "Zmenené z odporúčanej receptúry „" + rec.name + "“. <button type=\"button\" id=\"swap-back\">Vrátiť</button>";
    $("swap-q").textContent = "Netoleruje " + state.dogname + " tento typ proteínu?";
    // všetky ostatné receptúry; spoločné mäso so súčasnou je pri nich vyznačené
    var alts = E.PRODUCTS.filter(function (x) { return x !== p; });
    $("r-swap").hidden = !alts.length;
    if (alts.every(function (x) { return x.id !== swapPick; })) swapPick = null;
    $("swap-list").innerHTML = alts.map(function (x) {
      var ok = r.products.filter(function (e) { return e.product === x; })[0].eligible;
      return '<button type="button" data-recipe="' + x.id + '" aria-pressed="' + (x.id === swapPick) + '">' + meatName(x) + (x.monoprotein ? " <small>mono</small>" : "") + (shared(x, p).length ? " <small>rovnaké: " + shared(x, p).map(lower).join(", ") + "</small>" : "") + (ok ? "" : " <small>menej vhodné</small>") + "</button>";
    }).join("");
    renderCmp(r);
  }
  function renderCmp(r) {
    var box = $("swap-cmp");
    box.hidden = !swapPick;
    if (!swapPick) return;
    var cur = r.product;
    var alt = E.compute(Object.assign({}, state, { recipe: swapPick, recipeFor: r.recommended.id }), params);
    var q = alt.product, el = alt.products.filter(function (e) { return e.product === q; })[0];
    var bag = function (x) { return x.bags.filter(function (b) { return b.bag.id === state.bag; })[0] || x.bags.filter(function (b) { return b.bag.id === x.recBag; })[0]; };
    var perDay = function (x) { var b = bag(x); return b.price == null ? "cena doplniť" : eur(b.price * (1 - x.params.plans.mesiac) / b.days); };
    var mg = function (v) { return v ? v + " mg/kg" : "—"; };
    var rows = [
      ["Mäso", meatName(cur), meatName(q)],
      ["Druhov mäsa", cur.monoprotein ? "1 (mono)" : cur.proteins.length, q.monoprotein ? "1 (mono)" : q.proteins.length],
      ["Bielkoviny / tuk", cur.protein + " / " + cur.fat + " %", q.protein + " / " + q.fat + " %"],
      ["Denná dávka", r.dose.grams + " g", alt.dose.grams + " g"],
      ["Vrece " + bag(alt).bag.label, eur(bag(r).price), eur(bag(alt).price)],
      ["Na deň s predplatným", perDay(r), perDay(alt)],
      ["Glukozamín", mg(cur.glucosamine), mg(q.glucosamine)],
      ["Chondroitín", mg(cur.chondroitin), mg(q.chondroitin)]
    ];
    box.innerHTML = '<table><thead><tr><th scope="col"><span class="sr-only">Údaj</span></th>' +
      '<th scope="col"><img src="' + cur.img + '" alt=""><small>' + (r.swapped ? "Teraz" : "Odporúčaná") + "</small>" + cur.name + "</th>" +
      '<th scope="col"><img src="' + q.img + '" alt=""><small>Porovnanie</small>' + q.name + "</th></tr></thead><tbody>" +
      rows.map(function (x) {
        return '<tr><th scope="row">' + x[0] + "</th><td>" + x[1] + '</td><td' + (String(x[1]) !== String(x[2]) ? ' class="chg"' : "") + ">" + x[2] + "</td></tr>";
      }).join("") + "</tbody></table>" +
      (shared(q, cur).length ? '<p class="swap-warn">Rovnaké mäso ako v súčasnej receptúre: ' + shared(q, cur).map(lower).join(", ") + ". Ak ho pes netoleruje, vyber inú.</p>" : "") +
      (el.eligible ? "" : '<p class="swap-warn">Pre tohto psa ju neodporúčame. ' + swapWhy(el) + "</p>") +
      '<div class="swap-act">' + (el.eligible ? '<button type="button" class="btn btn-k" data-swap-to="' + q.id + '">Zmeniť na ' + q.name + "</button>" : "") +
      '<button type="button" class="later" data-swap-close>Zavrieť porovnanie</button></div>';
  }
  $("swap-q").addEventListener("click", function () {
    var open = this.getAttribute("aria-expanded") !== "true";
    this.setAttribute("aria-expanded", open);
    $("swap-panel").hidden = !open;
    if (!open) { swapPick = null; renderCmp(result()); }
  });
  $("r-swap").addEventListener("click", function (e) {
    var t = e.target.closest("button");
    if (!t) return;
    if (t.dataset.recipe) {
      swapPick = swapPick === t.dataset.recipe ? null : t.dataset.recipe;
      renderSwap(result());
      if (swapPick) $("swap-cmp").scrollIntoView({ block: "nearest", behavior: "smooth" });
    } else if (t.hasAttribute("data-swap-close")) {
      swapPick = null; renderSwap(result());
    } else if (t.dataset.swapTo || t.id === "swap-back") {
      var r = result();
      state.recipe = t.dataset.swapTo || ""; state.recipeFor = state.recipe ? r.recommended.id : "";
      swapPick = null; save();
      $("swap-q").setAttribute("aria-expanded", "false"); $("swap-panel").hidden = true;
      renderResult();
      $("r-name").scrollIntoView({ block: "center", behavior: "smooth" });
    }
  });
  function paintBag(r) {
    var x = bagOf(r);
    var kg = x.bag.id === "18" ? "2×9" : String(x.bag.kg);
    $("r-badge-kg").textContent = kg;
    $("r-badge-kg").classList.toggle("long", kg.length > 2);
    $("r-perday").textContent = $("r-perday-side").textContent = x.price == null ? "Cena sa doplní" : eur(x.price * (1 - r.params.plans.mesiac) / x.days) + " na deň";
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
    // predplatné: interval podľa veľkosti balenia
    $("plan-every").textContent = "Každých " + x.days + " " + plural(x.days, "deň", "dni", "dní");
    $("plan-note").textContent = "Ďalšie " + x.bag.label + " balenie pošleme " + r.params.reorderLeadDays + " " + plural(r.params.reorderLeadDays, "deň", "dni", "dní") + " predtým, ako sa minie.";
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
      ? "Platíš pri každom doručení. Vrece " + x.bag.label + " posielame každých " + x.days + " " + plural(x.days, "deň", "dni", "dní") + ", vždy " + r.params.reorderLeadDays + " " + plural(r.params.reorderLeadDays, "deň", "dni", "dní") + " predtým, ako sa minie."
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
