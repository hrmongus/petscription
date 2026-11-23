/* Granula — cookie lišta so súhlasom po kategóriách (SPEC P7):
     analytické  → PostHog (analytics.js: meranie návštevnosti a dotazníka, záznam relácie s maskovaním polí),
     marketingové → Klaviyo (formuláre, emaily na mieru, pripomenutie nedokončenej objednávky).
   Bez súhlasu sa nenačíta nič z toho. Vyskakovacie formuláre Klaviyo sa skryjú (hidePopups).
   Značka Klaviyo je v HTML ako type="text/plain" (overenie v Klaviyo ju nájde, prehliadač ju nespustí).
   Voľba sa pamätá v localStorage („granula-cookies“): "all", "necessary", "analytics" alebo "marketing"
   (staré voľby "all"/"necessary" platia ďalej). Lištu znova otvorí odkaz s atribútom data-cookie-settings.
   Pre ostatné skripty: GranulaConsent.has("analytics" | "marketing"), udalosť „granula:consent“ na window,
   GranulaAnalytics.track/identify (fronta; bez analytického súhlasu sa zahodí). */
(function () {
  var KEY = "granula-cookies", KLAVIYO_ID = "Yf7K2A";
  // stránky vedľa cookies.js (funguje aj z blogu v podpriečinku)
  var BASE = ((document.currentScript && document.currentScript.src) || "").replace(/cookies\.js[^/]*$/, "");

  function get() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }
  function set(v) { try { localStorage.setItem(KEY, v); } catch (e) {} }
  function has(cat, v) { v = v === undefined ? get() : v; return v === "all" || v === cat; }
  function valueOf(analytics, marketing) { return analytics && marketing ? "all" : analytics ? "analytics" : marketing ? "marketing" : "necessary"; }

  /* ---------- analytika (PostHog): fronta udalostí, kým sa analytics.js nenačíta ---------- */
  var queue = [].concat(window.__granulaQ || []); // udalosti zo skriptov, ktoré bežali pred cookies.js (kviz.js)
  window.__granulaQ = null;
  var A = window.GranulaAnalytics = window.GranulaAnalytics || {
    track: function (name, props) { if (A.ready) A.ready.track(name, props); else if (has("analytics")) queue.push(["track", name, props]); },
    identify: function (id, props) { if (A.ready) A.ready.identify(id, props); else if (has("analytics")) queue.push(["identify", id, props]); },
    // analytics.js si po načítaní vyberie frontu
    drain: function () { var q = queue; queue = []; return q; }
  };
  if (!has("analytics")) queue = [];
  // zdroj návštevy zo vstupnej stránky (UTM, referrer) pre dotazník: iba so súhlasom, iba v tejto záložke
  var SRC_KEY = "granula-src";
  var landing = (function () {
    var q = new URLSearchParams(location.search), utm = {};
    ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"].forEach(function (k) { if (q.get(k)) utm[k] = q.get(k).slice(0, 150); });
    ["fbclid", "gclid", "ttclid", "msclkid"].some(function (k) { if (q.has(k)) { utm.click = k; return true; } });
    var ref = document.referrer || "";
    try { if (ref && new URL(ref).hostname === location.hostname) ref = ""; } catch (e) { ref = ""; }
    return { utm: utm, referrer: ref, landing: location.pathname };
  })();
  function rememberSource() {
    try { if (!sessionStorage.getItem(SRC_KEY)) sessionStorage.setItem(SRC_KEY, JSON.stringify(landing)); } catch (e) {}
  }
  var analyticsLoaded = false;
  function loadAnalytics() {
    rememberSource();
    if (analyticsLoaded) return; analyticsLoaded = true;
    var s = document.createElement("script");
    s.async = true; s.src = BASE + "analytics.js?v=p7";
    document.head.appendChild(s);
  }
  function applyConsent(prev) {
    var v = get();
    if (has("analytics", v)) loadAnalytics();
    else { queue = []; try { sessionStorage.removeItem(SRC_KEY); } catch (e) {} }
    if (has("marketing", v)) { loadKlaviyo(); pending.splice(0).forEach(function (fn) { fn(); }); }
    else pending = [];
    paintEmbeds();
    try { window.dispatchEvent(new CustomEvent("granula:consent", { detail: { analytics: has("analytics", v), marketing: has("marketing", v) } })); } catch (e) {}
    // súhlas odvolaný po načítaní skriptu: PostHog vypnúť, stránku obnoviť, aby skripty nebežali
    var lostA = has("analytics", prev) && !has("analytics", v) && analyticsLoaded;
    var lostM = has("marketing", prev) && !has("marketing", v) && loaded;
    if (lostA && window.posthog && window.posthog.opt_out_capturing) { try { window.posthog.opt_out_capturing(); window.posthog.reset(); } catch (e) {} }
    if (lostA || lostM) location.reload();
  }

  var loaded = false;
  function loadKlaviyo() {
    if (loaded) return; loaded = true;
    // inicializácia objektu podľa kódu z Klaviyo
    !function(){if(!window.klaviyo){window._klOnsite=window._klOnsite||[];try{window.klaviyo=new Proxy({},{get:function(n,i){return"push"===i?function(){var n;(n=window._klOnsite).push.apply(n,arguments)}:function(){for(var n=arguments.length,o=new Array(n),w=0;w<n;w++)o[w]=arguments[w];var t="function"==typeof o[o.length-1]?o.pop():void 0,e=new Promise((function(n){window._klOnsite.push([i].concat(o,[function(i){t&&t(i),n(i)}]))}));return e}}})}catch(n){window.klaviyo=window.klaviyo||[],window.klaviyo.push=function(){var n;(n=window._klOnsite).push.apply(n,arguments)}}}}();
    // vypnuté značky <script type="text/plain" data-cookie-category="marketing"> zapneme; bez nich náhradná adresa
    var off = document.querySelectorAll('script[type="text/plain"][data-cookie-category="marketing"]');
    var srcs = [].map.call(off, function (t) { return t.getAttribute("src"); });
    if (!srcs.length) srcs = ["https://static.klaviyo.com/onsite/js/" + KLAVIYO_ID + "/klaviyo.js?company_id=" + KLAVIYO_ID];
    srcs.forEach(function (src) {
      var s = document.createElement("script");
      s.async = true; s.src = src;
      document.body.appendChild(s);
    });
  }

  var bar;
  function show(forForm) {
    if (bar) {
      bar.hidden = false; bar.classList.toggle("for-form", !!forForm); bar.classList.remove("open");
      bar.querySelector('[name="c-analytics"]').checked = has("analytics");
      bar.querySelector('[name="c-marketing"]').checked = has("marketing");
      bar.querySelector("button").focus(); return;
    }
    bar = document.createElement("div");
    bar.className = "cookie-bar";
    bar.setAttribute("role", "dialog");
    bar.setAttribute("aria-label", "Súhlas s cookies");
    bar.innerHTML =
      '<div class="cookie-txt"><p><span class="cookie-form-note">Na zápis potrebujeme Klaviyo, a to beží len s marketingovými cookies. </span><b>Cookies? Len s tvojím súhlasom.</b> Nevyhnutné potrebujeme, aby web fungoval. ' +
      "Analytické (PostHog) nám ukazujú, kde sa dotazník zasekáva. Marketingové (Klaviyo) nám pomáhajú posielať ti ponuky na mieru. " +
      '<a href="' + BASE + 'ochrana-sukromia.html#cookies" data-privacy>Ochrana súkromia</a></p>' +
      '<fieldset class="cookie-opts"><legend class="sr-only">Vyber cookies</legend>' +
      '<label><input type="checkbox" checked disabled> <span><b>Nevyhnutné</b> chod webu, košík a platba. Vždy zapnuté.</span></label>' +
      '<label><input type="checkbox" name="c-analytics"' + (has("analytics") ? " checked" : "") + '> <span><b>Analytické</b> PostHog: návštevnosť, priechod dotazníkom a anonymizovaný záznam relácie (vyplnené polia nevidíme).</span></label>' +
      '<label><input type="checkbox" name="c-marketing"' + (has("marketing") ? " checked" : "") + '> <span><b>Marketingové</b> Klaviyo: formuláre, emaily na mieru a pripomenutie nedokončenej objednávky.</span></label>' +
      "</fieldset></div>" +
      '<div class="cookie-btns"><button type="button" class="btn btn-o btn-sm" data-cookie="all">Prijať všetky</button>' +
      '<button type="button" class="btn btn-sm cookie-min" data-cookie="necessary">Len nevyhnutné</button>' +
      '<button type="button" class="btn btn-sm cookie-min cookie-set" data-cookie-open aria-expanded="false">Nastaviť</button>' +
      '<button type="button" class="btn btn-sm cookie-min cookie-save" data-cookie="choice">Uložiť výber</button></div>';
    bar.addEventListener("click", function (e) {
      if (e.target.closest("[data-cookie-open]")) {
        bar.classList.add("open");
        e.target.closest("[data-cookie-open]").setAttribute("aria-expanded", "true");
        bar.querySelector('[name="c-analytics"]').focus();
        return;
      }
      var b = e.target.closest("[data-cookie]");
      if (!b) return;
      var prev = get(), v = b.dataset.cookie;
      if (v === "choice") v = valueOf(bar.querySelector('[name="c-analytics"]').checked, bar.querySelector('[name="c-marketing"]').checked);
      set(v);
      bar.hidden = true;
      applyConsent(prev);
    });
    bar.classList.toggle("for-form", !!forForm);
    document.body.appendChild(bar);
  }

  // Klaviyo formuláre: bez súhlasu ukážeme lištu a formulár otvoríme hneď po súhlase s marketingovými cookies
  var pending = [];
  function withKlaviyo(fn) {
    if (has("marketing")) { loadKlaviyo(); fn(); return; }
    pending.push(fn); show(true);
  }
  function paintEmbeds() {
    var ok = has("marketing");
    [].forEach.call(document.querySelectorAll(".kl-fallback"), function (f) { f.hidden = ok; });
    if (ok) setTimeout(checkEmbeds, 8000);
  }
  // Klaviyo embed sa nemusí zobraziť (napr. formulár je v Klaviyo nastavený len pre mobil alebo je skrytý
  // pre už známeho návštevníka). Vtedy namiesto prázdneho boxu ukážeme tlačidlo na pop-up.
  function checkEmbeds() {
    [].forEach.call(document.querySelectorAll(".kl-embed"), function (w) {
      var form = w.querySelector('[class*="klaviyo-form-"]');
      if (!form || form.children.length || w.querySelector(".kl-alt")) return;
      var alt = document.createElement("div");
      alt.className = "kl-alt";
      alt.innerHTML = "<p><b>Zapíš sa vopred</b> a prvé vrecko dostaneš o 30&nbsp;% lacnejšie. Rezervácia je nezáväzná.</p>" +
        '<p>Formulár sa tu nezobrazil. Napíš nám na <a href="mailto:podpora@granula.sk">podpora@granula.sk</a> a zapíšeme ťa.</p>';
      w.appendChild(alt);
      // formulár sa vykreslil neskôr: náhradu odstránime
      if ("MutationObserver" in window) new MutationObserver(function (m, o) {
        if (form.children.length) { alt.remove(); o.disconnect(); }
      }).observe(form, { childList: true });
    });
  }

  document.addEventListener("click", function (e) {
    if (e.target.closest("[data-cookie-settings]")) { e.preventDefault(); show(); return; }
    var o = e.target.closest("[data-klaviyo-open]");
    // vyskakovacie okná Klaviyo sa nepoužívajú: tlačidlá „Chcem byť prvý“ vedú na formulár v sekcii úvodnej stránky
    if (o) {
      e.preventDefault();
      var sec = document.getElementById("zapis");
      if (sec) { sec.scrollIntoView({ behavior: "smooth", block: "start" }); if (history.replaceState) history.replaceState(null, "", "#zapis"); }
      else location.href = "/#zapis";
      return;
    }
    // „Povoliť a zobraziť formulár“: súhlas iba s marketingovými cookies, analytická voľba ostáva
    if (e.target.closest("[data-klaviyo-consent]")) { var prev = get(); set(valueOf(has("analytics"), true)); if (bar) bar.hidden = true; applyConsent(prev); }
  });

  // Klaviyo podľa svojho nastavenia sám otvára pop-up („Email Popup“, YcSYzw) a flyout formuláre. Na webe ich
  // nechceme (23. 11. 2026): keď ich Klaviyo vloží do stránky, hneď ich skryjeme. Formulár v sekcii (.kl-embed) ostáva.
  function hidePopups() {
    [].forEach.call(document.querySelectorAll('[role="dialog"][aria-label*="POPUP"], [role="dialog"][aria-label*="FLYOUT"], [role="dialog"][aria-label*="FULLSCREEN"], form[data-testid="klaviyo-form-YcSYzw"]'), function (el) {
      if (el.closest(".kl-embed")) return;
      var top = el;
      while (top.parentElement && top.parentElement !== document.body) top = top.parentElement;
      if (top === el.ownerDocument.body || top.querySelector(".kl-embed")) return;
      top.style.setProperty("display", "none", "important");
      top.setAttribute("aria-hidden", "true");
      popupHidden = true;
    });
    // Klaviyo pri pop-upe zamkne scrollovanie (trieda na body): pop-up je skrytý, tak ho odomkneme
    if (popupHidden && document.body && document.body.classList.contains("klaviyo-prevent-body-scrolling")) document.body.classList.remove("klaviyo-prevent-body-scrolling");
  }
  var popupHidden = false;
  var queued = false;
  if ("MutationObserver" in window) new MutationObserver(function () {
    if (queued) return;
    queued = true;
    (window.requestAnimationFrame || setTimeout)(function () { queued = false; hidePopups(); });
  }).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });

  var v = get();
  paintEmbeds();
  if (has("marketing", v)) loadKlaviyo();
  if (has("analytics", v)) loadAnalytics();
  if (v === null || ["all", "necessary", "analytics", "marketing"].indexOf(v) === -1) show();
  window.GranulaConsent = { has: function (cat) { return has(cat); }, show: show };
  /* ---------- Klaviyo udalosti (SPEC P7): iba so súhlasom s marketingovými cookies ----------
     startedCheckout: opustený košík (email z kroku doručenia, pes, recept, cena, odkaz späť na výsledok).
     placedOrder: na stránke Hotovo, aby flow opusteného košíka v Klaviyo skončil. */
  function klaviyoTrack(email, firstName, metric, props) {
    if (!has("marketing") || !email) return;
    loadKlaviyo();
    var k = window.klaviyo;
    if (!k || !k.identify) return;
    try {
      var who = { email: email };
      if (firstName) who.first_name = firstName;
      k.identify(who);
      k.track(metric, props);
    } catch (e) {}
  }
  window.GranulaMarketing = {
    startedCheckout: function (d) { klaviyoTrack(d.email, d.firstName, "Started Checkout", d.event); },
    placedOrder: function (d) { klaviyoTrack(d.email, d.firstName, "Placed Order", d.event); }
  };
})();
