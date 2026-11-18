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
  var BLANK = { dogname: "", sex: "", breed: "krizenec-stredny", kg: 17, years: "", months: "", weeks: "",
    activity: "", neutered: "", pregnant: "", body: "", focus: [], breedSet: false, bag: "", plan: "mesiac", ordered: false, recipe: "", recipeFor: "", bagKey: "" };
  var state = JSON.parse(JSON.stringify(BLANK));
  try { Object.assign(state, JSON.parse(sessionStorage.getItem(KEY)) || {}); } catch (e) {}
  if (!(state.plan in E.PARAMS.plans)) state.plan = "mesiac";
  if (state.breed !== BLANK.breed) state.breedSet = true; // starší uložený stav bez príznaku // napr. zrušená možnosť „na 3 mesiace“
  // dokončené odpovede si pamätáme aj po zatvorení prehliadača (len v tomto prehliadači, max. 3 psy)
  var SAVED_KEY = "granula-psy";
  var ANSWERS = ["dogname", "sex", "breed", "breedSet", "kg", "years", "months", "weeks", "activity", "neutered", "pregnant", "body", "focus", "bag", "bagKey", "plan", "recipe", "recipeFor"];
  function savedDogs() {
    try { var l = JSON.parse(localStorage.getItem(SAVED_KEY)); return Array.isArray(l) ? l : []; } catch (e) { return []; }
  }
  // jednorazovo vymažeme psov uložených prvou verziou (ukladala pri každom písmene mena: „Adol“, „Adolf“, „Adolft“)
  try { if (localStorage.getItem(SAVED_KEY + "-v") !== "2") { localStorage.removeItem(SAVED_KEY); localStorage.setItem(SAVED_KEY + "-v", "2"); } } catch (e) {}
  function storeDogs(l) { try { localStorage.setItem(SAVED_KEY, JSON.stringify(l.slice(0, 3))); } catch (e) {} }
  function save() {
    try { sessionStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {}
  }
  // psa si zapamätáme až na výsledku (nie pri každom písmene mena)
  function rememberDog() {
    if (!state.dogname || firstInvalid()) return;
    var a = {};
    ANSWERS.forEach(function (k) { a[k] = state[k]; });
    storeDogs([a].concat(savedDogs().filter(function (d) { return d.dogname.toLowerCase() !== state.dogname.toLowerCase(); })));
  }

  var quiz = document.getElementById("quiz");
  var order = document.getElementById("order");
  var $ = function (id) { return document.getElementById(id); };
  var eur = function (n) { return n == null ? "cena doplniť" : n.toFixed(2).replace(".", ",") + "\u00a0€"; };
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

  /* vyhľadávanie plemena: pole s lupou, filtrovaný zoznam, v prázdnom poli sa „píše“ príklad */
  var bq = $("breed-q"), blist = $("breed-list"), bwrap = bq.closest(".bs"), btyped = bwrap.querySelector(".bs-typed");
  var DEFAULT_BREED = "krizenec-stredny";
  var fold = function (t) { return t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase(); };
  var bOpts = [], bActive = -1;
  function paintBreed() {
    var b = breedOf(sel.value);
    bq.value = b && sel.value !== DEFAULT_BREED ? b.name : "";
    bwrap.classList.toggle("has-value", !!bq.value);
  }
  function renderList() {
    var picked = breedOf(sel.value);
    // v poli je zvolené plemeno (nie nový text): ukáž celý zoznam
    var q = picked && bq.value === picked.name ? "" : fold(bq.value.trim()), html = "", n = 0;
    bOpts = [];
    function opt(b) {
      var i = bOpts.length; bOpts.push(b);
      return '<li role="option" id="bo-' + i + '" data-i="' + i + '" aria-selected="' + (b.id === sel.value) + '">' + b.name +
        "<small>" + b.range + "&nbsp;kg</small></li>";
    }
    if (!q) {
      GROUPS.forEach(function (g, gi) {
        var list = E.BREEDS.filter(g[1]);
        html += '<li class="grp" role="presentation" id="bg-' + gi + '">' + g[0] + "</li>" + list.map(opt).join("");
      });
    } else {
      var starts = [], has = [];
      E.BREEDS.forEach(function (b) {
        var name = fold(b.name), words = name.split(/[\s(–/-]+/);
        if (name.indexOf(q) === 0 || words.some(function (w) { return w.indexOf(q) === 0; })) starts.push(b);
        else if (name.indexOf(q) !== -1) has.push(b);
      });
      var found = starts.concat(has);
      n = found.length;
      html = found.map(opt).join("");
      if (!n) html = '<li class="none" role="presentation">Toto plemeno nemáme. Vyber kríženca podľa veľkosti:</li>' + E.BREEDS.filter(function (b) { return b.mix; }).map(opt).join("");
    }
    blist.innerHTML = html;
    setActive(q && bOpts.length ? 0 : -1);
  }
  function setActive(i) {
    bActive = i;
    [].forEach.call(blist.querySelectorAll('[role="option"]'), function (li) { li.classList.toggle("on", +li.dataset.i === i); });
    var li = i >= 0 ? $("bo-" + i) : null;
    if (li) { bq.setAttribute("aria-activedescendant", li.id); li.scrollIntoView({ block: "nearest" }); }
    else bq.removeAttribute("aria-activedescendant");
  }
  function openList() {
    if (!blist.hidden) return;
    renderList(); blist.hidden = false; bq.setAttribute("aria-expanded", "true"); bwrap.classList.add("is-open");
    var cur = blist.querySelector('[aria-selected="true"]');
    if (cur && sel.value !== DEFAULT_BREED) blist.scrollTop = cur.offsetTop - blist.clientHeight / 2;
  }
  function closeList() {
    blist.hidden = true; bq.setAttribute("aria-expanded", "false"); bwrap.classList.remove("is-open"); setActive(-1);
  }
  function pickBreed(b) {
    state.breedSet = true; // plemeno vybrané (aj kríženec): os Veľkosť granule sa odomkne
    sel.value = b.id;
    sel.dispatchEvent(new Event("change", { bubbles: true }));
    closeList(); paintBreed();
  }
  bq.addEventListener("focus", function () { openList(); if (bq.value) bq.select(); });
  bq.addEventListener("click", openList);
  bq.addEventListener("input", function () { blist.hidden ? openList() : renderList(); bwrap.classList.toggle("has-value", !!bq.value); });
  bq.addEventListener("keydown", function (e) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault(); openList();
      if (!bOpts.length) return;
      setActive(e.key === "ArrowDown" ? Math.min(bOpts.length - 1, bActive + 1) : Math.max(0, bActive - 1));
    } else if (e.key === "Enter") {
      e.preventDefault(); // neodosielať formulár
      if (!blist.hidden && bActive >= 0) pickBreed(bOpts[bActive]);
    } else if (e.key === "Escape") { closeList(); paintBreed(); }
  });
  blist.addEventListener("mousedown", function (e) { e.preventDefault(); }); // fokus ostane v poli
  blist.addEventListener("click", function (e) {
    var li = e.target.closest('[role="option"]');
    if (li) pickBreed(bOpts[+li.dataset.i]);
  });
  bq.addEventListener("blur", function () { closeList(); paintBreed(); });

  // animácia: príklady sa píšu písmeno po písmene, potom sa zmažú
  (function () {
    var words = ["foxteriér", "labradorský retriever", "jazvečík", "border kólia", "zlatý retriever", "bígl"];
    var still = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (still.matches) { btyped.textContent = "napr. " + words[0]; return; }
    var w = 0, i = 0, back = false;
    (function tick() {
      var word = words[w], delay;
      if (!back) { i++; delay = i === word.length ? 1400 : 90 + Math.random() * 70; if (i === word.length) back = true; }
      else { i--; delay = i === 0 ? 450 : 35; if (i === 0) { back = false; w = (w + 1) % words.length; } }
      btyped.textContent = word.slice(0, i);
      setTimeout(tick, delay);
    })();
  })();
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
    profChange();
  }
  /* pokračovať s uloženým psom */
  var PAW = '<svg viewBox="0 0 24 24" aria-hidden="true"><ellipse cx="12" cy="16.5" rx="5.2" ry="4.3"/><ellipse cx="5.2" cy="10.6" rx="2.2" ry="2.8"/><ellipse cx="9.3" cy="6.2" rx="2.2" ry="2.9"/><ellipse cx="14.7" cy="6.2" rx="2.2" ry="2.9"/><ellipse cx="18.8" cy="10.6" rx="2.2" ry="2.8"/></svg>';
  function paintResume() {
    var list = savedDogs().filter(function (d) { return d.dogname; });
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
    Object.assign(state, d, { ordered: false, breedSet: true });
    fill(); save();
    go(firstInvalid() || "vysledok");
  });

  // stav → formulár
  function fill() {
    if (!breedOf(state.breed)) state.breed = "krizenec-stredny";
    quiz.dogname.value = state.dogname;
    sel.value = state.breed;
    paintBreed();
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
  // zameranie: zapamätať, na čo sa kliklo, skôr než sa prepočíta profil
  quiz.addEventListener("input", function (e) { if (e.target.name === "focus") noteFocus = e.target.checked ? e.target.value : ""; }, true);
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
      pct.textContent = v + "\u00a0%";
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
    // dlaždice ikon: Oranž s Noc kresbou alebo Mlieko s Kobaltovou (nikdy Limetka/Ružová)
    var BG = [["var(--o)", "#000000"], ["var(--ml)", "#0047BB"]];
    var fall = box.offsetHeight * 0.75 + "px";
    box.innerHTML = SLOTS.map(function (s, i) {
      var k = i % icons.length, r = ((i * 47) % 60) - 30;
      return '<span class="drop" style="--x:' + s[0] + "%;--y:" + s[1] + "%;--rot:" + r + "deg;--d:" + Math.round(i * (dur - 700) / SLOTS.length) + "ms;--fall:" + fall + ";background:" + BG[k % BG.length][0] + ";color:" + BG[k % BG.length][0] + '">' +
        GranulaIcons.svg(icons[k], 40, BG[k % BG.length][1]) + "</span>";
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
    $("r-kicker").textContent = "Hotovo · granule sú vybrané";
    $("r-name").textContent = p.name;
    rememberDog();
    // hlavné suroviny receptúry + denná dávka (nálepky v hlavičke)
    $("r-chips").innerHTML = p.highlights.map(function (h) {
      return '<li><span class="rh-ico" aria-hidden="true">' + I(h[0], 20, "#0047BB") + "</span><span>" + h[1] + " <b>" + h[2] + "\u00a0%</b></span></li>";
    }).join("") + '<li><span class="rh-ico g" aria-hidden="true">g</span><span>Denná dávka <b>' + r.dose.grams + "\u00a0g</b></span></li>";
    renderSwap(r);
    $("f-keep").textContent = r.dose.grams + " g";
    $("f-up").textContent = Math.round(r.dose.grams * 1.1) + " g";
    $("f-down").textContent = Math.round(r.dose.grams * 0.9) + " g";

    $("r-bags").innerHTML = r.bags.map(function (x) {
      return '<label class="ro"><input type="radio" name="bag" value="' + x.bag.id + '"' + (x.bag.id === state.bag ? " checked" : "") + ">" +
        '<span class="ro-box" aria-hidden="true"></span>' +
        '<span class="ro-txt"><span class="ro-kg">' + x.bag.label + "</span>" +
        '<span class="ro-days">vydrží ' + x.days + " " + plural(x.days, "deň", "dni", "dní") + "</span>" +
        (x.saving > 0 ? '<span class="ro-save">−' + x.saving + "\u00a0% za kg</span>" : "") + "</span>" +
        '<span class="ro-price">' + (x.price == null ? "cena —" : eur(x.price)) + "</span>" +
        (x.bag.id === r.recBag ? '<span class="ro-rec">Odporúčame</span>' : "") + "</label>";
    }).join("");

    $("f-comp").textContent = p.composition;
    $("f-anal").textContent = "Proteín " + p.protein + "\u00a0%, hrubý tuk " + p.fat + "\u00a0%" +
      (p.missing.some(function (m) { return /popol/.test(m); }) ? " (ostatné hodnoty doplníme)." :
        ", popol " + num(p.ash, p.ash % 1 ? 1 : 0) + "\u00a0%, vláknina " + num(p.fiber, 1) + "\u00a0%, vápnik " + num(p.calcium, 1) + "\u00a0%, fosfor " + num(p.phosphorus, 1) + "\u00a0%, vlhkosť " + p.moisture + " %.");
    $("f-add").textContent = p.additives || "Doplníme.";
    $("f-trace").textContent = p.trace || "Doplníme.";

    $("r-pack").src = p.img;
    $("r-pack").alt = "Vrece Granula: " + p.name;
    if (window.GranulaCompare) GranulaCompare.render($("r-compare"), p.id);
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
    $("swap-q").textContent = state.dogname + " neznáša tento proteín?";
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
      ["Bielkoviny / tuk", cur.protein + " / " + cur.fat + "\u00a0%", q.protein + " / " + q.fat + "\u00a0%"],
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
    $("r-perday").textContent = x.price == null ? "Cena sa doplní" : eur(x.price * (1 - r.params.plans.mesiac) / x.days) + " na deň";
  }
  $("r-bags").addEventListener("change", function (e) {
    state.bag = e.target.value; save(); rememberDog(); paintBag(result());
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
    $("s-disc-l").textContent = "Zľava predplatného −" + Math.round(d * 100) + "\u00a0%";
    $("s-disc").textContent = x.price == null ? "" : "−" + eur(x.price * d);
    $("s-total").textContent = x.price == null ? "—" : eur(Math.round((x.price * (1 - d) + r.params.shipping) * 100) / 100);
    // objednávky sú do štartu (20. 11.) vypnuté, tlačidlo má pevný text
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
    if ($("s-submit").disabled) return; // pred štartom sa neobjednáva
    var addr = order.ship.value === "adresa";
    var need = ["email", "fullname", "tel", "cc", "exp", "cvc"].concat(addr ? ["street", "zip", "city"] : ["point"]);
    var bad = need.filter(function (n) {
      var f = order.elements[n];
      return !f.value.trim() || (f.type === "email" && !f.checkValidity());
    });
    order.querySelectorAll(".input").forEach(function (f) { f.style.borderColor = ""; f.removeAttribute("aria-invalid"); });
    bad.forEach(function (n) { var f = order.elements[n]; f.style.borderColor = "var(--err)"; f.setAttribute("aria-invalid", "true"); });
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

  /* ---------------- profil psa (radar) ----------------
     Hodnoty len z E.profilPsa(); graf nikdy neukazuje receptúry. */
  var profCard = $("prof"), profHome = $("prof-home"), profCh = $("prof-ch") || {}; // riadok so zmenou je zatiaľ skrytý
  var radar = new GranulaRadar($("prof-radar"), { axes: E.PROFILE_AXES });
  var lastProf = null, noteFocus = "";
  var NOTE_ONLY = { kby: "kĺby", srst: "srsť a koža", imunita: "imunita", vyberavy: "vyberavý jedák", vaha: "váha" };
  var mobileQ = window.matchMedia("(max-width:900px)");
  function krokNo(id) { var i = STEPS.indexOf(id); return i !== -1 ? i + 1 : (id === "vysledok" ? 7 : 0); }
  function profNow() { return E.profilPsa(state, krokNo(current), params); }
  function placeProf() {
    var scr = screens[current], slot = null;
    if (scr && STEPS.indexOf(current) !== -1) slot = scr.querySelector(mobileQ.matches ? "[data-prof-m]" : "[data-prof-d]");
    (slot || profHome).appendChild(profCard);
  }
  // odpoveď v aktuálnom kroku: graf sa hneď pohne a riadok povie, čo sa zmenilo
  // jeden klik vyvolá „input“ aj „change“: spojiť do jednej zmeny
  var profPending = false;
  function profChange() {
    if (profPending) return;
    profPending = true;
    setTimeout(function () { profPending = false; profRun(); }, 0);
  }
  function profRun() {
    if (krokNo(current) < 1 || krokNo(current) > 6) return;
    var after = profNow();
    if (current !== "krok-1" && lastProf) {
      var msg = GranulaRadar.describe(lastProf, after);
      // kĺby, srsť, imunita…: na graf nič nepridávajú, len poznámku vo výsledku
      if (NOTE_ONLY[noteFocus]) msg = "Profil sa nezmenil · " + NOTE_ONLY[noteFocus] + (noteFocus === "kby" ? " pridajú" : " pridá") + " len poznámku";
      profCh.textContent = msg;
    }
    noteFocus = "";
    radar.update(after); lastProf = after;
  }
  // presun medzi krokmi: riadok sa nemení (okrem začiatku a výsledku)
  function profRoute() {
    placeProf();
    var k = krokNo(current);
    if (!k) return;
    var after = profNow();
    if (k === 1 && !lastProf) profCh.textContent = "Odpovedz na prvú otázku";
    else if (k === 7) profCh.textContent = "Hotovo · profil je kompletný";
    else if (!lastProf) profCh.textContent = "";
    radar.update(after); lastProf = after;
  }
  (mobileQ.addEventListener ? mobileQ.addEventListener.bind(mobileQ, "change") : mobileQ.addListener.bind(mobileQ))(placeProf);

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
    profRoute();
    window.scrollTo(0, 0);
    var h = screens[id].querySelector(".q-title, .rh-name");
    if (h) h.focus({ preventScroll: true });
    save();
  }

  // nový vstup do dotazníka (napr. z úvodnej stránky) po dokončenom psovi: čistý formulár,
  // dokončený pes je v štítku „Alebo pokračuj s“. Rozpracovaný dotazník ostáva vyplnený.
  var entry = location.hash.slice(1);
  if ((entry === "" || entry === "krok-1") && state.dogname && !firstInvalid()) {
    state = JSON.parse(JSON.stringify(BLANK));
    try { sessionStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {}
  }
  fill();
  window.addEventListener("hashchange", route);
  route();
})();
