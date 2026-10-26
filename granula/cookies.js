/* Granula — jednoduchá cookie lišta. Klaviyo (marketing) sa načíta až po súhlase.
   Značka Klaviyo je v HTML ako type="text/plain" (overenie v Klaviyo ju nájde, prehliadač ju nespustí).
   Voľba sa pamätá v localStorage („granula-cookies“: "all" alebo "necessary").
   Lištu znova otvorí akýkoľvek odkaz s atribútom data-cookie-settings. */
(function () {
  var KEY = "granula-cookies", KLAVIYO_ID = "Yf7K2A";

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
      '<a href="#" data-privacy>Ochrana údajov</a></p>' +
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
  }

  document.addEventListener("click", function (e) {
    if (e.target.closest("[data-cookie-settings]")) { e.preventDefault(); show(); return; }
    var o = e.target.closest("[data-klaviyo-open]");
    if (o) { var id = o.getAttribute("data-klaviyo-open"); withKlaviyo(function () { window._klOnsite = window._klOnsite || []; window._klOnsite.push(["openForm", id]); }); return; }
    if (e.target.closest("[data-klaviyo-consent]")) { set("all"); if (bar) bar.hidden = true; loadKlaviyo(); paintEmbeds(); }
  });

  var v = get();
  paintEmbeds();
  if (v === "all") loadKlaviyo();
  else if (v !== "necessary") show();
})();
