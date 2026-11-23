/* Granula — jednoduchá cookie lišta. Klaviyo (marketing) sa načíta až po súhlase. Vyskakovacie formuláre Klaviyo sa skryjú (hidePopups).
   Značka Klaviyo je v HTML ako type="text/plain" (overenie v Klaviyo ju nájde, prehliadač ju nespustí).
   Voľba sa pamätá v localStorage („granula-cookies“: "all" alebo "necessary").
   Lištu znova otvorí akýkoľvek odkaz s atribútom data-cookie-settings. */
(function () {
  var KEY = "granula-cookies", KLAVIYO_ID = "Yf7K2A";
  // stránky vedľa cookies.js (funguje aj z blogu v podpriečinku)
  var BASE = ((document.currentScript && document.currentScript.src) || "").replace(/cookies\.js[^/]*$/, "");

  function get() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }
  function set(v) { try { localStorage.setItem(KEY, v); } catch (e) {} }

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
    if (bar) { bar.hidden = false; bar.classList.toggle("for-form", !!forForm); bar.querySelector("button").focus(); return; }
    bar = document.createElement("div");
    bar.className = "cookie-bar";
    bar.setAttribute("role", "dialog");
    bar.setAttribute("aria-label", "Súhlas s cookies");
    bar.innerHTML =
      '<p><span class="cookie-form-note">Na zápis potrebujeme Klaviyo, a to beží len s marketingovými cookies. </span><b>Cookies? Len s tvojím súhlasom.</b> Nevyhnutné potrebujeme, aby web fungoval. ' +
      "Marketingové (Klaviyo) nám pomáhajú posielať ti ponuky na mieru. " +
      '<a href="' + BASE + 'ochrana-sukromia.html" data-privacy>Ochrana súkromia</a></p>' +
      '<div class="cookie-btns"><button type="button" class="btn btn-o btn-sm" data-cookie="all">Prijať všetky</button>' +
      '<button type="button" class="btn btn-sm cookie-min" data-cookie="necessary">Len nevyhnutné</button></div>';
    bar.addEventListener("click", function (e) {
      var b = e.target.closest("[data-cookie]");
      if (!b) return;
      var prev = get();
      set(b.dataset.cookie);
      bar.hidden = true;
      if (b.dataset.cookie === "all") { loadKlaviyo(); paintEmbeds(); pending.splice(0).forEach(function (fn) { fn(); }); }
      else {
        pending = []; paintEmbeds();
        // súhlas odvolaný po načítaní Klaviyo: obnoviť stránku, aby skript nebežal
        if (prev === "all" && loaded) location.reload();
      }
    });
    bar.classList.toggle("for-form", !!forForm);
    document.body.appendChild(bar);
  }

  // Klaviyo formuláre: bez súhlasu ukážeme lištu a formulár otvoríme hneď po „Prijať všetky“
  var pending = [];
  function withKlaviyo(fn) {
    if (get() === "all") { loadKlaviyo(); fn(); return; }
    pending.push(fn); show(true);
  }
  function paintEmbeds() {
    var ok = get() === "all";
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
    if (e.target.closest("[data-klaviyo-consent]")) { set("all"); if (bar) bar.hidden = true; loadKlaviyo(); paintEmbeds(); }
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
  if (v === "all") loadKlaviyo();
  else if (v !== "necessary") show();
})();
