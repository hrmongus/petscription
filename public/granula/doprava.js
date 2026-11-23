/* Granula — výber doručenia v kroku objednávky (SPEC P1b).
   Zapne sa iba pri otvorenom predaji (kviz.js → GranulaDelivery.enable); inak ostáva pôvodný formulár.

   Spôsoby a pravidlá podľa balenia: doprava-config.js (window.GranulaCarriers).
   - Packeta – výdajné miesto / Z-BOX: oficiálny widget v6 (s PACKETA_API_KEY); záloha = vyhľadávanie + zoznam nad FHB.
   - DPD – odberné miesta a boxy: oficiálna mapa DPD (pickup-maps.dpd.sk, bez kľúča); záloha = vyhľadávanie + zoznam nad FHB.
   - SPS – kuriér na adresu.
   Výsledok: jeden objekt `delivery` (GranulaDelivery.validate()). Server ho pred platbou overí znova (krok 4). */
(function () {
  "use strict";

  var PACKETA_JS = "https://widget.packeta.com/v6/www/js/library.js";
  var DPD_ORIGIN = "https://pickup-maps.dpd.sk";
  var DPD_URL = DPD_ORIGIN + "/widget/?lang=sk&countries=SK&enabledCountries=SK&hideCloseButton=true";
  function dpdUrl() { return DPD_URL + (C().boxes("dpd_pickup", bag) ? "" : "&disableLockers=true"); } // 18 kg: bez boxov
  var SERVICE_OF = { packeta_point: "packeta", dpd_pickup: "dpd" };
  var C = function () { return window.GranulaCarriers; };

  var form, cfg = {}, active = false, bag = "", chosen = { packeta_point: null, dpd_pickup: null }, onChange = function () {};
  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function method() { var r = form.querySelector('input[name="dmethod"]:checked'); return r ? r.value : ""; }
  function fmtZip(z) { return String(z || "").replace(/^(\d{3})(\d{2})$/, "$1 $2"); }
  function title(s) { s = String(s || ""); return s === s.toUpperCase() ? s.toLowerCase().replace(/(^|[\s\-\/.(])(\S)/g, function (_, a, b) { return a + b.toUpperCase(); }) : s; }

  /* ---------------- telefón ---------------- */
  // rovnaké pravidlo ako lib/fhb/build-order.ts normalizePhone; prijímame SK a CZ čísla
  function normalizePhone(raw) {
    var s = String(raw || "").replace(/[\s\-().\/]/g, "");
    if (s.indexOf("00") === 0) s = "+" + s.slice(2);
    else if (s.charAt(0) === "0") s = "+421" + s.slice(1);
    else if (s.charAt(0) !== "+" && /^42[01]/.test(s)) s = "+" + s;
    return /^\+42[01]\d{9}$/.test(s) ? s : null;
  }
  function fmtPhone(p) { return p.replace(/^(\+\d{3})(\d{3})(\d{3})(\d{3})$/, "$1 $2 $3 $4"); }

  /* ---------------- možnosti podľa balenia ---------------- */
  // adresné polia kuriéra: pri novom toku stoja priamo pod kartou „SPS – kuriér na adresu“ (formulár ide zhora nadol)
  var addrF = null;
  function renderOptions() {
    var box = $("ship-opts-new"), list = C().methodsFor(bag), cur = method();
    if (list.indexOf(cur) === -1) cur = C().defaultFor(bag);
    addrF = addrF || $("addr-f");
    if (addrF.parentNode === box) box.removeChild(addrF); // innerHTML by uzol zahodil (aj s vyplnenými hodnotami)
    box.innerHTML = list.map(function (m) {
      var M = C().METHODS[m], svc = SERVICE_OF[m];
      // karta: voľba + (pri výdajnom mieste, kým nie je vybrané) oranžové tlačidlo výberu priamo v karte
      return '<div class="so-wrap" data-m="' + m + '"><label class="so"><input type="radio" name="dmethod" value="' + m + '"' + (m === cur ? " checked" : "") + '><span class="so-box" aria-hidden="true"></span>' +
        '<span class="so-txt"><b>' + esc(M.label) + "</b><span>" + esc(M.eta) + '</span></span><b class="so-pr" data-ship-price data-method="' + m + '"></b></label>' +
        (svc ? '<div class="so-act" data-for="' + m + '" hidden><button type="button" class="btn btn-o so-cta" data-pick="' + svc + '" aria-haspopup="dialog">' +
          (m === "packeta_point" ? "Vybrať výdajné miesto alebo Z-BOX →" : "Vybrať odberné miesto alebo box →") + "</button>" +
          (svc === "packeta" ? '<button type="button" class="dl-alt" data-list="packeta">Vyhľadať v zozname</button>' : "") + "</div>" : "") +
        "</div>" +
        // vybrané miesto: pod kartou, s odkazom na zmenu
        (svc ? '<div class="dl-pick" data-for="' + m + '" hidden><div class="dl-chosen" hidden></div>' +
          '<button type="button" class="link-under" data-pick="' + svc + '" aria-haspopup="dialog">Zmeniť výdajné miesto</button></div>' : "");
    }).join("");
    var sw = box.querySelector('.so-wrap[data-m="sps_courier"]');
    if (sw) {
      sw.parentNode.insertBefore(addrF, sw.nextSibling);
      if (!addrF.querySelector(".addr-hint")) {
        var h = document.createElement("small");
        h.className = "pf-hint addr-hint";
        h.textContent = "Doručujeme na Slovensko. Číslo bytu alebo poschodie napíš k ulici.";
        addrF.appendChild(h);
      }
    }
    box.querySelectorAll('input[name="dmethod"]').forEach(function (r) { r.addEventListener("change", function () { paintMethod(); onChange(); }); });
    box.querySelectorAll("[data-pick]").forEach(function (b) {
      b.addEventListener("click", function () { b.getAttribute("data-pick") === "packeta" ? pickPacketa(b) : openDialog("dpd", b); });
    });
    box.querySelectorAll("[data-list]").forEach(function (b) { b.addEventListener("click", function () { openDialog(b.getAttribute("data-list"), b, true); }); });
    paintMethod();
  }
  function paintMethod() {
    var m = method();
    (addrF || $("addr-f")).hidden = m !== "sps_courier"; // adresa iba pre kuriéra (pri výdajnom mieste ju FHB doplní z miesta)
    paintChosen("packeta_point");
    paintChosen("dpd_pickup");
    // „Vyhľadať v zozname“ pri Packete iba popri oficiálnom widgete (bez kľúča je zoznam hlavné tlačidlo)
    var alt = form.querySelector('[data-list="packeta"]');
    if (alt) alt.hidden = !cfg.packetaKey;
  }
  function paintChosen(m) {
    var box = form.querySelector('.dl-pick[data-for="' + m + '"]');
    if (!box) return;
    var p = chosen[m], card = box.querySelector(".dl-chosen"), act = form.querySelector('.so-act[data-for="' + m + '"]'), sel = method() === m;
    card.hidden = !p;
    box.hidden = !(sel && p);            // vybrané miesto pod kartou
    if (act) act.hidden = !(sel && !p);  // kým nie je vybrané: oranžové tlačidlo v karte
    card.innerHTML = p ? "<b>" + esc(p.name) + "</b><span>" + esc([title(p.street), [fmtZip(p.zip), title(p.city)].filter(Boolean).join(" ")].filter(Boolean).join(", ")) + "</span>" +
      (p.kind === "box" ? '<span class="dl-tag">box</span>' : "") + (String(p.id).indexOf("TEST-") === 0 ? '<span class="dl-tag">test</span>' : "") : "";
  }
  function setPoint(m, p) {
    chosen[m] = p;
    paintChosen(m);
    onChange();
  }

  /* ---------------- načítanie skriptov ---------------- */
  var loaded = {};
  function loadScript(src) {
    if (loaded[src]) return loaded[src];
    loaded[src] = new Promise(function (ok, fail) {
      var s = document.createElement("script");
      s.src = src; s.async = true;
      s.onload = ok; s.onerror = function () { delete loaded[src]; fail(new Error("load " + src)); };
      document.head.appendChild(s);
    });
    return loaded[src];
  }

  /* ---------------- Packeta: oficiálny widget v6 alebo záloha ---------------- */
  function pickPacketa(opener) {
    if (!cfg.packetaKey) { openDialog("packeta", opener, true); return; }
    loadScript(PACKETA_JS).then(function () {
      window.Packeta.Widget.pick(cfg.packetaKey, function (point) {
        if (point) {
          setPoint("packeta_point", {
            id: String(point.id), name: point.name, street: point.street, city: point.city, zip: String(point.zip || "").replace(/\s/g, ""),
            kind: point.group === "zbox" ? "box" : "shop"
          });
        }
        if (opener) opener.focus();
      }, { country: "sk", language: "sk", appIdentity: "granula-web", vendors: [{ country: "sk" }, { country: "sk", group: "zbox" }] });
    }).catch(function () { openDialog("packeta", opener, true); }); // widget sa nenačítal → zoznam
  }

  /* ---------------- okno: mapa DPD alebo zoznam (záloha) ---------------- */
  var dlg, opener, svc, searchTimer, lastQ = "", results = [], reqId = 0;
  function buildDialog() {
    dlg = document.createElement("dialog");
    dlg.className = "dp";
    dlg.setAttribute("aria-labelledby", "dp-h");
    dlg.innerHTML =
      '<div class="dp-head"><h2 id="dp-h"></h2>' +
        '<div class="dp-tabs"><button type="button" data-view="map" aria-pressed="true">Mapa</button><button type="button" data-view="list" aria-pressed="false">Zoznam</button></div>' +
        '<button type="button" class="dp-x" aria-label="Zavrieť výber výdajného miesta"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>' +
      '<div class="dp-view dp-mapview"><iframe class="dp-frame" title="Mapa odberných miest DPD" allow="geolocation"></iframe></div>' +
      '<div class="dp-view dp-listview">' +
        '<div class="dp-search"><label class="pf"><span>Mesto alebo PSČ</span><input class="input" id="dp-q" type="search" autocomplete="off" inputmode="search" placeholder="napr. Žilina alebo 010 01"></label></div>' +
        '<p class="dp-status" id="dp-status" role="status" aria-live="polite"></p>' +
        '<ul class="dp-list" id="dp-list"></ul>' +
      "</div>";
    document.body.appendChild(dlg);
    dlg.querySelector(".dp-x").addEventListener("click", closeDialog);
    dlg.addEventListener("click", function (e) { if (e.target === dlg) closeDialog(); });
    dlg.addEventListener("close", function () { document.documentElement.classList.remove("sd-open"); if (opener) opener.focus(); });
    // focus trap (showModal robí zvyšok stránky neaktívnym; toto drží Tab v okne aj v starších prehliadačoch)
    dlg.addEventListener("keydown", function (e) {
      // Esc zavrie okno vždy (vo vyhľadávacom poli by inak iba vymazal text)
      if (e.key === "Escape") { e.preventDefault(); closeDialog(); return; }
      if (e.key !== "Tab") return;
      var f = Array.prototype.filter.call(dlg.querySelectorAll("button, input, iframe, [href], [tabindex]:not([tabindex='-1'])"), function (el) { return !el.disabled && el.offsetParent !== null; });
      if (!f.length) return;
      var first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });
    $("dp-q").addEventListener("input", function () { clearTimeout(searchTimer); searchTimer = setTimeout(search, 250); });
    $("dp-q").addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); clearTimeout(searchTimer); search(); } });
    $("dp-list").addEventListener("click", function (e) {
      var b = e.target.closest("button[data-i]");
      if (b) choose(results[+b.getAttribute("data-i")]);
    });
    dlg.querySelectorAll(".dp-tabs button").forEach(function (b) { b.addEventListener("click", function () { setView(b.getAttribute("data-view")); }); });
    // výber z mapy DPD (postMessage z iframe)
    window.addEventListener("message", function (e) {
      if (e.origin !== DPD_ORIGIN || !e.data || !e.data.dpdWidget || !dlg.open) return;
      var w = e.data.dpdWidget;
      if (w.message === "widgetClose") { closeDialog(); return; }
      if (!w.id) return;
      var a = (w.location && w.location.address) || {};
      choose({ id: String(w.id), name: w.name, street: a.street, city: a.city, zip: String(a.zip || "").replace(/\s/g, ""), kind: w.type === "locker" ? "box" : "shop" });
    });
  }
  function setView(v) {
    dlg.setAttribute("data-view", v);
    dlg.querySelectorAll(".dp-tabs button").forEach(function (b) { b.setAttribute("aria-pressed", String(b.getAttribute("data-view") === v)); });
    if (v === "map") {
      var fr = dlg.querySelector(".dp-frame");
      if (fr.getAttribute("src") !== dpdUrl()) fr.setAttribute("src", dpdUrl());
    } else {
      var q = $("dp-q");
      if (!q.value) q.value = (chosen[svc === "dpd" ? "dpd_pickup" : "packeta_point"] || {}).city || ($("city") && $("city").value) || "";
      q.value = title(q.value);
      setTimeout(function () { q.focus(); q.select(); }, 0);
      if (q.value.trim().length >= 2) { lastQ = ""; search(); } else status("Napíš mesto alebo PSČ.");
    }
  }
  function openDialog(service, btn, listOnly) {
    if (!dlg) buildDialog();
    if (svc !== service || dlg.getAttribute("data-bag") !== bag) { results = []; lastQ = ""; $("dp-list").innerHTML = ""; }
    dlg.setAttribute("data-bag", bag);
    svc = service;
    opener = btn;
    dlg.setAttribute("data-svc", service);
    $("dp-h").textContent = service === "dpd" ? "DPD – odberné miesta a boxy" : "Packeta – výdajné miesto alebo Z-BOX";
    // mapa iba pri DPD (Packeta má vlastný widget); záloha = zoznam
    dlg.querySelector(".dp-tabs").hidden = service !== "dpd";
    document.documentElement.classList.add("sd-open");
    dlg.showModal();
    setView(service === "dpd" && !listOnly ? "map" : "list");
    if (service === "dpd" && !listOnly) dlg.querySelector('.dp-tabs [data-view="map"]').focus();
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
    var m = svc === "dpd" ? "dpd_pickup" : "packeta_point";
    fetch("/api/delivery-points?service=" + svc + "&q=" + encodeURIComponent(q) + (C().boxes(m, bag) ? "" : "&boxes=0"))
      .then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.error || "chyba"); return j; }); })
      .then(function (j) {
        if (my !== reqId) return;
        results = j.points || [];
        renderList();
        status(results.length ? (results.length >= 40 ? "Zobrazujeme prvých 40 miest. Spresni hľadanie." : "Nájdené miesta: " + results.length + ".") + (j.source === "mock" ? " (testovacie dáta)" : "")
          : "Pre „" + q + "“ sme nenašli žiadne miesto. Skús iné mesto alebo PSČ.");
      })
      .catch(function (e) { if (my === reqId) { lastQ = ""; status(e.message || "Výdajné miesta sa nepodarilo načítať."); } });
  }
  function renderList() {
    var cur = chosen[svc === "dpd" ? "dpd_pickup" : "packeta_point"];
    $("dp-list").innerHTML = results.map(function (p, i) {
      var sel = cur && cur.id === p.id;
      return '<li><button type="button" class="dp-item' + (sel ? " is-sel" : "") + '" data-i="' + i + '"' + (sel ? ' aria-current="true"' : "") + ">" +
        '<span class="dp-nm">' + esc(p.name) + (p.kind === "box" ? ' <span class="dl-tag">box</span>' : "") + "</span>" +
        '<span class="dp-ad">' + esc(p.street) + ", " + esc(fmtZip(p.zip)) + " " + esc(p.city) + "</span>" +
        '<span class="dp-go" aria-hidden="true">' + (sel ? "Vybraté" : "Vybrať") + "</span></button></li>";
    }).join("");
  }
  function choose(p) {
    if (!p) return;
    setPoint(svc === "dpd" ? "dpd_pickup" : "packeta_point", { id: p.id, name: p.name, street: p.street, city: p.city, zip: p.zip, kind: p.kind });
    closeDialog();
  }

  /* ---------------- validácia ---------------- */
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
    var point = null, address = null, M = C().METHODS[m];
    if (!m || !C().allowed(m, bag)) mark(form.querySelector('#ship-new input[name="dmethod"]'), "Vyber spôsob doručenia.");
    else if (M.pickup) {
      point = chosen[m];
      if (!point) mark(form.querySelector('.so-act[data-for="' + m + '"] [data-pick]'), "Vyber výdajné miesto.");
      else if (point.kind === "box" && !C().boxes(m, bag)) mark(form.querySelector('.dl-pick[data-for="' + m + '"] [data-pick]'), "Pri balení " + bag + " kg vyber odberné miesto, nie box.");
    } else {
      var st = $("street").value.trim(), zip = $("zip").value.replace(/\s/g, ""), city = $("city").value.trim();
      if (!st) mark($("street"), "Doplň adresu doručenia.");
      if (!/^\d{5}$/.test(zip)) mark($("zip"), "PSČ má 5 číslic.");
      if (!city) mark($("city"), "Doplň adresu doručenia.");
      address = { street: st, zip: zip, city: city, country: "SK" };
    }
    if (bad.length) return { ok: false, message: msg.join(" "), focus: bad[0] };
    $("phone").value = fmtPhone(phone);
    return {
      ok: true,
      delivery: { method: m, carrier: M.carrier, firstName: fn, lastName: ln, name: fn + " " + ln, email: email, phone: phone, point: point, address: address }
    };
  }

  /* ---------------- verejné rozhranie ---------------- */
  window.GranulaDelivery = {
    init: function (f, opts) { form = f; if (opts && opts.onChange) onChange = opts.onChange; },
    /** zapne nový výber doručenia (iba pri otvorenom predaji) */
    enable: function (c) {
      if (!form || !$("ship-new") || !C()) return;
      cfg = c || {};
      active = true;
      bag = String(cfg.bag || "9");
      $("ship-legacy").hidden = true;
      $("ship-new").hidden = false;
      $("phone-f").hidden = false;
      var saved = cfg.saved;
      if (saved && C().METHODS[saved.method]) {
        if (saved.point && C().METHODS[saved.method].pickup && (saved.point.kind !== "box" || C().boxes(saved.method, bag))) chosen[saved.method] = saved.point;
        if (saved.phone && !$("phone").value) $("phone").value = fmtPhone(saved.phone);
      }
      renderOptions();
      if (saved && C().allowed(saved.method, bag)) { var r = form.querySelector('input[name="dmethod"][value="' + saved.method + '"]'); if (r) { r.checked = true; paintMethod(); } }
      $("phone").addEventListener("blur", function () { var p = normalizePhone(this.value); if (p) this.value = fmtPhone(p); });
    },
    /** balenie sa zmenilo (napr. 18 kg → Packeta sa nesmie ponúknuť) */
    setBag: function (b) {
      b = String(b);
      if (!active || b === bag) return;
      bag = b;
      // vybraný box pri balení, kde boxy nie sú povolené (18 kg do DPD), zrušiť
      Object.keys(chosen).forEach(function (m) { if (chosen[m] && chosen[m].kind === "box" && !C().boxes(m, bag)) chosen[m] = null; });
      renderOptions();
    },
    method: function () { return active ? method() : ""; },
    active: function () { return active; },
    validate: validate,
    _normalizePhone: normalizePhone
  };
})();
