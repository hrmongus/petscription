/* Granula — vyhľadávanie plemena (dotazník krok 2 aj produktová sekcia na úvodnej stránke).
   Pole s lupou, zoznam v skupinách (krížence, potom od najmenších), filtrovanie bez diakritiky,
   v prázdnom poli sa „píšu“ príklady. Hodnotu drží <select> (sel).
   GranulaBreedSearch(wrap, sel, { onPick: function (breed) {}, emptyId: "krizenec-stredny" }) → { paint } */
(function () {
  "use strict";
  var uid = 0;
  window.GranulaBreedSearch = function (wrap, sel, opts) {
    opts = opts || {};
    var E = window.GranulaEngine, n = ++uid;
    var bq = wrap.querySelector(".bs-input"), blist = wrap.querySelector(".bs-list"), btyped = wrap.querySelector(".bs-typed");
    var EMPTY = opts.emptyId || "krizenec-stredny"; // predvolené plemeno sa v poli neukazuje (pole je prázdne)
    var GROUPS = [["Kríženec", function (b) { return b.mix; }]].concat(["trpaslicie", "male", "stredne", "velke", "obrie"].map(function (s) {
      return [E.SIZE_TEXT[s].charAt(0).toUpperCase() + E.SIZE_TEXT[s].slice(1) + " plemená", function (b) { return !b.mix && b.size === s; }];
    }));
    if (!sel.options.length) GROUPS.forEach(function (g) {
      var og = document.createElement("optgroup"); og.label = g[0];
      E.BREEDS.filter(g[1]).forEach(function (b) { og.appendChild(new Option(b.name, b.id)); });
      sel.appendChild(og);
    });
    var fold = function (t) { return t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase(); };
    var breedOf = function (id) { return E.BREEDS.filter(function (x) { return x.id === id; })[0]; };
    var bOpts = [], bActive = -1;
    function paint() {
      var b = breedOf(sel.value);
      bq.value = b && sel.value !== EMPTY ? b.name : "";
      wrap.classList.toggle("has-value", !!bq.value);
    }
    function render() {
      var picked = breedOf(sel.value);
      // v poli je zvolené plemeno (nie nový text): ukáž celý zoznam
      var q = picked && bq.value === picked.name ? "" : fold(bq.value.trim()), html = "";
      bOpts = [];
      function opt(b) {
        var i = bOpts.length; bOpts.push(b);
        return '<li role="option" id="bo' + n + "-" + i + '" data-i="' + i + '" aria-selected="' + (b.id === sel.value) + '">' + b.name +
          "<small>" + b.range + "&nbsp;kg</small></li>";
      }
      if (!q) {
        GROUPS.forEach(function (g) { html += '<li class="grp" role="presentation">' + g[0] + "</li>" + E.BREEDS.filter(g[1]).map(opt).join(""); });
      } else {
        var starts = [], has = [];
        E.BREEDS.forEach(function (b) {
          var name = fold(b.name), words = name.split(/[\s(–/-]+/);
          if (name.indexOf(q) === 0 || words.some(function (w) { return w.indexOf(q) === 0; })) starts.push(b);
          else if (name.indexOf(q) !== -1) has.push(b);
        });
        var found = starts.concat(has);
        html = found.map(opt).join("");
        if (!found.length) html = '<li class="none" role="presentation">Toto plemeno nemáme. Vyber kríženca podľa veľkosti:</li>' + E.BREEDS.filter(function (b) { return b.mix; }).map(opt).join("");
      }
      blist.innerHTML = html;
      setActive(q && bOpts.length ? 0 : -1);
    }
    function setActive(i) {
      bActive = i;
      [].forEach.call(blist.querySelectorAll('[role="option"]'), function (li) { li.classList.toggle("on", +li.dataset.i === i); });
      var li = i >= 0 ? document.getElementById("bo" + n + "-" + i) : null;
      if (li) { bq.setAttribute("aria-activedescendant", li.id); li.scrollIntoView({ block: "nearest" }); }
      else bq.removeAttribute("aria-activedescendant");
    }
    function open() {
      if (!blist.hidden) return;
      render(); blist.hidden = false; bq.setAttribute("aria-expanded", "true"); wrap.classList.add("is-open");
      var cur = blist.querySelector('[aria-selected="true"]');
      if (cur && sel.value !== EMPTY) blist.scrollTop = cur.offsetTop - blist.clientHeight / 2;
    }
    function close() { blist.hidden = true; bq.setAttribute("aria-expanded", "false"); wrap.classList.remove("is-open"); setActive(-1); }
    function pick(b) {
      sel.value = b.id;
      if (opts.onPick) opts.onPick(b);
      sel.dispatchEvent(new Event("change", { bubbles: true }));
      close(); paint();
    }
    bq.addEventListener("focus", function () { open(); if (bq.value) bq.select(); });
    bq.addEventListener("click", open);
    bq.addEventListener("input", function () { blist.hidden ? open() : render(); wrap.classList.toggle("has-value", !!bq.value); });
    bq.addEventListener("keydown", function (e) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault(); open();
        if (!bOpts.length) return;
        setActive(e.key === "ArrowDown" ? Math.min(bOpts.length - 1, bActive + 1) : Math.max(0, bActive - 1));
      } else if (e.key === "Enter") {
        e.preventDefault(); // neodosielať formulár
        if (!blist.hidden && bActive >= 0) pick(bOpts[bActive]);
      } else if (e.key === "Escape") { close(); paint(); }
    });
    blist.addEventListener("mousedown", function (e) { e.preventDefault(); }); // fokus ostane v poli
    blist.addEventListener("click", function (e) { var li = e.target.closest('[role="option"]'); if (li) pick(bOpts[+li.dataset.i]); });
    bq.addEventListener("blur", function () { close(); paint(); });

    // animácia: príklady sa píšu písmeno po písmene, potom sa zmažú
    (function () {
      if (!btyped) return;
      var words = ["foxteriér", "labradorský retriever", "jazvečík", "border kólia", "zlatý retriever", "bígl"];
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { btyped.textContent = "napr. " + words[0]; return; }
      var w = 0, i = 0, back = false;
      (function tick() {
        var word = words[w], delay;
        if (!back) { i++; delay = i === word.length ? 1400 : 90 + Math.random() * 70; if (i === word.length) back = true; }
        else { i--; delay = i === 0 ? 450 : 35; if (i === 0) { back = false; w = (w + 1) % words.length; } }
        btyped.textContent = word.slice(0, i);
        setTimeout(tick, delay);
      })();
    })();
    paint();
    return { paint: paint, open: open };
  };
})();
