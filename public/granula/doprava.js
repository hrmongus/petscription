/* Granula — výber doručenia v kroku objednávky (SPEC P1b).
   Zapne sa iba pri otvorenom predaji (kviz.js → GranulaDelivery.enable); inak ostáva pôvodný formulár.

   Spôsoby: Packeta výdajné miesto / Z-BOX (oficiálny widget v6), SPS ParcelShop (vlastný pop-up: hľadanie podľa
   mesta alebo PSČ, zoznam a mapa Leaflet + OSM nad /api/delivery-points), SPS kuriér na adresu.
   Výsledok: jeden objekt `delivery` (GranulaDelivery.validate()). Server ho pred platbou overí znova (krok 4);
   cena dopravy sa tu nepočíta. */
(function () {
  "use strict";

  var LEAFLET = {
    css: "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css", cssSri: "sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=",
    js: "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js", jsSri: "sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo="
  };
  var PACKETA_JS = "https://widget.packeta.com/v6/www/js/library.js";
  var METHODS = {
    packeta_point: { carrier: "packeta", pickup: true },
    sps_parcelshop: { carrier: "sps", pickup: true },
    sps_courier: { carrier: "sps", pickup: false }
  };

  var form, cfg = {}, active = false, chosen = { packeta_point: null, sps_parcelshop: null }, onChange = function () {};
  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function method() { var r = form.querySelector('input[name="dmethod"]:checked'); return r ? r.value : ""; }

  /* ---------------- telefón a email ---------------- */
  // rovnaké pravidlo ako lib/fhb/build-order.ts normalizePhone; prijímame SK a CZ čísla
  function normalizePhone(raw) {
    var s = String(raw || "").replace(/[\s\-().\/]/g, "");
    if (s.indexOf("00") === 0) s = "+" + s.slice(2);
    else if (s.charAt(0) === "0") s = "+421" + s.slice(1);
    else if (s.charAt(0) !== "+" && /^42[01]/.test(s)) s = "+" + s;
    return /^\+42[01]\d{9}$/.test(s) ? s : null;
  }
  function fmtPhone(p) { return p.replace(/^(\+\d{3})(\d{3})(\d{3})(\d{3})$/, "$1 $2 $3 $4"); }

  /* ---------------- zobrazenie ---------------- */
  function paintMethod() {
    var m = method();
    form.querySelectorAll(".dl-pick").forEach(function (el) { el.hidden = el.getAttribute("data-for") !== m; });
    // adresa: iba pre kuriéra (pri výdajnom mieste ju FHB doplní z miesta)
    $("addr-f").hidden = m !== "sps_courier";
    paintChosen("packeta_point");
    paintChosen("sps_parcelshop");
  }
  function paintChosen(m) {
    var box = form.querySelector('.dl-pick[data-for="' + m + '"]');
    if (!box) return;
    var p = chosen[m], card = box.querySelector(".dl-chosen"), btn = box.querySelector("[data-pick]");
    card.hidden = !p;
    btn.textContent = p ? "Zmeniť výdajné miesto" : (m === "packeta_point" ? "Vybrať výdajné miesto alebo Z-BOX →" : "Vybrať výdajné miesto SPS →");
    card.innerHTML = p ? '<b>' + esc(p.name) + '</b><span>' + esc([p.street, [p.zip, p.city].filter(Boolean).join(" ")].filter(Boolean).join(", ")) + "</span>" +
      (p.kind === "box" ? '<span class="dl-tag">box</span>' : "") + (String(p.id).indexOf("TEST-") === 0 ? '<span class="dl-tag">test</span>' : "") : "";
  }
  function setPoint(m, p) {
    chosen[m] = p;
    paintChosen(m);
    var box = form.querySelector('.dl-pick[data-for="' + m + '"]');
    if (box) box.removeAttribute("aria-invalid");
    onChange();
  }

  /* ---------------- načítanie skriptov ---------------- */
  var loaded = {};
  function loadScript(src, sri) {
    if (loaded[src]) return loaded[src];
    loaded[src] = new Promise(function (ok, fail) {
      var s = document.createElement("script");
      s.src = src; s.async = true;
      if (sri) { s.integrity = sri; s.crossOrigin = "anonymous"; }
      s.onload = ok; s.onerror = function () { delete loaded[src]; fail(new Error("load " + src)); };
      document.head.appendChild(s);
    });
    return loaded[src];
  }
  function loadCss(href, sri) {
    if (document.querySelector('link[href="' + href + '"]')) return;
    var l = document.createElement("link");
    l.rel = "stylesheet"; l.href = href;
    if (sri) { l.integrity = sri; l.crossOrigin = "anonymous"; }
    document.head.appendChild(l);
  }

  /* ---------------- Packeta (oficiálny widget v6, modálne okno) ---------------- */
  function pickPacketa(opener) {
    if (!cfg.packetaKey) {
      // bez API kľúča: v testovacom režime testovacie miesto, inak hláška
      if (cfg.mode === "test") {
        setPoint("packeta_point", { id: "TEST-PK01", name: "TEST Packeta výdajné miesto (chýba PACKETA_API_KEY)", street: "Testovacia 1", city: "Bratislava", zip: "81101", kind: "parcelshop" });
      } else showErr("Výber miesta Packeta je momentálne nedostupný. Vyber prosím SPS.");
      return;
    }
    loadScript(PACKETA_JS).then(function () {
      window.Packeta.Widget.pick(cfg.packetaKey, function (point) {
        if (point) {
          setPoint("packeta_point", {
            id: String(point.id), name: point.name, street: point.street, city: point.city, zip: String(point.zip || "").replace(/\s/g, ""),
            kind: point.group === "zbox" ? "box" : "parcelshop"
          });
        }
        if (opener) opener.focus();
      }, { country: "sk", language: "sk", appIdentity: "granula-web", vendors: [{ country: "sk" }, { country: "sk", group: "zbox" }] });
    }).catch(function () { showErr("Mapu Packeta sa nepodarilo načítať. Skús to znova."); });
  }

  /* ---------------- SPS pop-up ---------------- */
  var dlg, opener, searchTimer, lastQ = "", map, markers = [], results = [], reqId = 0;
  function buildDialog() {
    dlg = document.createElement("dialog");
    dlg.className = "dp";
    dlg.setAttribute("aria-labelledby", "dp-h");
    dlg.innerHTML =
      '<div class="dp-head"><h2 id="dp-h">Výdajné miesto SPS</h2>' +
        '<button type="button" class="dp-x" aria-label="Zavrieť výber výdajného miesta"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>' +
      '<div class="dp-search"><label class="pf"><span>Mesto alebo PSČ</span><input class="input" id="dp-q" type="search" autocomplete="off" inputmode="search" placeholder="napr. Žilina alebo 010 01"></label></div>' +
      '<p class="dp-status" id="dp-status" role="status" aria-live="polite"></p>' +
      '<div class="dp-tabs" hidden><button type="button" data-view="list" aria-pressed="true">Zoznam</button><button type="button" data-view="map" aria-pressed="false">Mapa</button></div>' +
      '<div class="dp-body" data-view="list"><ul class="dp-list" id="dp-list"></ul><div class="dp-map" id="dp-map" hidden></div></div>';
    document.body.appendChild(dlg);
    dlg.querySelector(".dp-x").addEventListener("click", closeDialog);
    dlg.addEventListener("click", function (e) { if (e.target === dlg) closeDialog(); });
    dlg.addEventListener("close", function () { document.documentElement.classList.remove("sd-open"); if (opener) opener.focus(); });
    // focus trap (showModal robí zvyšok stránky neaktívnym; toto drží Tab v okne aj v starších prehliadačoch)
    dlg.addEventListener("keydown", function (e) {
      if (e.key !== "Tab") return;
      var f = Array.prototype.filter.call(dlg.querySelectorAll('button, input, [href], [tabindex]:not([tabindex="-1"])'), function (el) { return !el.disabled && el.offsetParent !== null; });
      if (!f.length) return;
      var first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });
    $("dp-q").addEventListener("input", function () {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(search, 250);
    });
    $("dp-q").addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); clearTimeout(searchTimer); search(); } });
    $("dp-list").addEventListener("click", function (e) {
      var b = e.target.closest("button[data-i]");
      if (b) choose(results[+b.getAttribute("data-i")]);
    });
    dlg.querySelectorAll(".dp-tabs button").forEach(function (b) {
      b.addEventListener("click", function () { setView(b.getAttribute("data-view")); });
    });
  }
  function setView(v) {
    dlg.querySelector(".dp-body").setAttribute("data-view", v);
    dlg.querySelectorAll(".dp-tabs button").forEach(function (b) { b.setAttribute("aria-pressed", String(b.getAttribute("data-view") === v)); });
    if (v === "map" && map) setTimeout(function () { map.invalidateSize(); fitMap(); }, 0);
  }
  function openDialog(btn) {
    if (!dlg) buildDialog();
    opener = btn;
    document.documentElement.classList.add("sd-open");
    dlg.showModal();
    var q = $("dp-q");
    if (!q.value) {
      var cur = chosen.sps_parcelshop, city = $("city") && $("city").value;
      q.value = cur ? cur.city : (city || "");
    }
    q.focus();
    q.select();
    if (q.value.trim().length >= 2) search(); else status("Napíš mesto alebo PSČ.");
  }
  function closeDialog() { if (dlg && dlg.open) dlg.close(); }
  function status(t) { $("dp-status").textContent = t; }
  function search() {
    var q = $("dp-q").value.trim();
    if (q.length < 2) { results = []; renderList(); status("Napíš aspoň 2 znaky mesta alebo PSČ."); return; }
    if (q === lastQ && results.length) return;
    lastQ = q;
    var my = ++reqId;
    status("Hľadám…");
    fetch("/api/delivery-points?service=sps&q=" + encodeURIComponent(q))
      .then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.error || "chyba"); return j; }); })
      .then(function (j) {
        if (my !== reqId) return;
        results = j.points || [];
        renderList();
        renderMap(j.hasCoords);
        status(results.length ? (results.length >= 40 ? "Zobrazujeme prvých 40 miest. Spresni hľadanie." : "Nájdené miesta: " + results.length + ".") + (j.source === "mock" ? " (testovacie dáta)" : "")
          : "Pre „" + q + "“ sme nenašli žiadne miesto. Skús iné mesto alebo PSČ.");
      })
      .catch(function (e) { if (my === reqId) { lastQ = ""; status(e.message || "Výdajné miesta sa nepodarilo načítať."); } });
  }
  function renderList() {
    var cur = chosen.sps_parcelshop;
    $("dp-list").innerHTML = results.map(function (p, i) {
      var sel = cur && cur.id === p.id;
      return '<li><button type="button" class="dp-item' + (sel ? " is-sel" : "") + '" data-i="' + i + '"' + (sel ? ' aria-current="true"' : "") + ">" +
        '<span class="dp-nm">' + esc(p.name) + (p.kind === "box" ? ' <span class="dl-tag">box</span>' : "") + "</span>" +
        '<span class="dp-ad">' + esc(p.street) + ", " + esc(p.zip.replace(/^(\d{3})(\d{2})$/, "$1 $2")) + " " + esc(p.city) + "</span>" +
        '<span class="dp-go" aria-hidden="true">' + (sel ? "Vybraté" : "Vybrať") + "</span></button></li>";
    }).join("");
  }
  function renderMap(hasCoords) {
    var tabs = dlg.querySelector(".dp-tabs"), el = $("dp-map");
    var geo = results.filter(function (p) { return p.lat != null && p.lng != null; });
    // bez súradníc (FHB ich zatiaľ neposiela) mapu nezobrazujeme
    tabs.hidden = !hasCoords || !geo.length;
    el.hidden = !hasCoords || !geo.length;
    dlg.querySelector(".dp-body").classList.toggle("has-map", !el.hidden);
    if (el.hidden) { setView("list"); return; }
    loadCss(LEAFLET.css, LEAFLET.cssSri);
    loadScript(LEAFLET.js, LEAFLET.jsSri).then(function () {
      var L = window.L;
      if (!map) {
        map = L.map(el, { scrollWheelZoom: false });
        L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' }).addTo(map);
      }
      markers.forEach(function (m) { m.remove(); });
      markers = geo.map(function (p) {
        var m = L.circleMarker([p.lat, p.lng], { radius: 9, color: "#000", weight: 2, fillColor: p.kind === "box" ? "#FF6900" : "#0047BB", fillOpacity: 1 }).addTo(map);
        m.bindPopup('<b>' + esc(p.name) + "</b><br>" + esc(p.street) + ", " + esc(p.city) + '<br><button type="button" class="dp-map-pick">Vybrať</button>');
        m.on("popupopen", function (ev) {
          var b = ev.popup.getElement().querySelector(".dp-map-pick");
          if (b) b.addEventListener("click", function () { choose(p); });
        });
        return m;
      });
      setTimeout(function () { map.invalidateSize(); fitMap(); }, 0);
    }).catch(function () { el.hidden = true; dlg.querySelector(".dp-tabs").hidden = true; });
  }
  function fitMap() {
    if (!map || !markers.length) return;
    map.fitBounds(window.L.featureGroup(markers).getBounds(), { padding: [24, 24], maxZoom: 15 });
  }
  function choose(p) {
    if (!p) return;
    setPoint("sps_parcelshop", { id: p.id, name: p.name, street: p.street, city: p.city, zip: p.zip, kind: p.kind });
    closeDialog();
  }

  /* ---------------- chyby a validácia ---------------- */
  function errEl() { return form.querySelector('[data-err="objednavka"]'); }
  function showErr(t) { var e = errEl(); e.textContent = t; e.hidden = false; }

  function validate() {
    var m = method(), bad = [], msg = [];
    function mark(el, text) { if (el) { el.setAttribute("aria-invalid", "true"); bad.push(el); } if (text && msg.indexOf(text) === -1) msg.push(text); }
    form.querySelectorAll("#ship-new [aria-invalid], #order .input[aria-invalid]").forEach(function (el) { el.removeAttribute("aria-invalid"); });

    var email = $("email").value.trim();
    if (!email || !$("email").checkValidity()) mark($("email"), "Zadaj platný e-mail.");
    else if (email.length > 50) mark($("email"), "E-mail môže mať najviac 50 znakov (požiadavka dopravcu).");
    var phone = normalizePhone($("phone").value);
    if (!phone) mark($("phone"), "Zadaj telefón v tvare +421 9XX XXX XXX. Dopravca ti dá vedieť, kedy balík príde.");
    var fn = $("fname").value.trim(), ln = $("lname").value.trim();
    if (!fn) mark($("fname"), "Doplň meno a priezvisko.");
    if (!ln) mark($("lname"), "Doplň meno a priezvisko.");
    var point = null, address = null;
    if (!m) mark(form.querySelector('#ship-new input[name="dmethod"]'), "Vyber spôsob doručenia.");
    else if (METHODS[m].pickup) {
      point = chosen[m];
      if (!point) mark(form.querySelector('.dl-pick[data-for="' + m + '"] [data-pick]'), "Vyber výdajné miesto.");
    } else {
      var st = $("street").value.trim(), zip = $("zip").value.replace(/\s/g, ""), city = $("city").value.trim();
      if (!st) mark($("street"), "Doplň adresu doručenia.");
      if (!/^\d{5}$/.test(zip)) mark($("zip"), "PSČ má 5 číslic.");
      if (!city) mark($("city"), "Doplň adresu doručenia.");
      address = { street: st, zip: zip, city: city, country: "SK" };
    }
    if (bad.length) return { ok: false, message: msg.join(" "), focus: bad[0] };
    if (phone) $("phone").value = fmtPhone(phone);
    return {
      ok: true,
      delivery: {
        method: m, carrier: METHODS[m].carrier,
        firstName: fn, lastName: ln, name: fn + " " + ln,
        email: email, phone: phone,
        point: point, address: address
      }
    };
  }

  /* ---------------- verejné rozhranie ---------------- */
  window.GranulaDelivery = {
    init: function (f, opts) {
      form = f;
      if (opts && opts.onChange) onChange = opts.onChange;
    },
    /** zapne nový výber doručenia (iba pri otvorenom predaji) */
    enable: function (c) {
      if (!form || !$("ship-new")) return;
      cfg = c || {};
      active = true;
      $("ship-legacy").hidden = true;
      $("ship-new").hidden = false;
      $("phone-f").hidden = false;
      var saved = cfg.saved;
      if (saved && METHODS[saved.method]) {
        var r = form.querySelector('input[name="dmethod"][value="' + saved.method + '"]');
        if (r) r.checked = true;
        if (saved.point && METHODS[saved.method].pickup) chosen[saved.method] = saved.point;
        if (saved.phone && !$("phone").value) $("phone").value = fmtPhone(saved.phone);
      }
      form.querySelectorAll('input[name="dmethod"]').forEach(function (r) { r.addEventListener("change", function () { paintMethod(); onChange(); }); });
      form.querySelectorAll("[data-pick]").forEach(function (b) {
        b.addEventListener("click", function () { if (b.getAttribute("data-pick") === "packeta") pickPacketa(b); else openDialog(b); });
      });
      $("phone").addEventListener("blur", function () { var p = normalizePhone(this.value); if (p) this.value = fmtPhone(p); });
      paintMethod();
    },
    active: function () { return active; },
    validate: validate,
    _normalizePhone: normalizePhone
  };
})();
