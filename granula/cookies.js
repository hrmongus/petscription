/* Granula — jednoduchá cookie lišta. Klaviyo (marketing) sa načíta až po súhlase.
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
    var s = document.createElement("script");
    s.async = true;
    s.src = "https://static.klaviyo.com/onsite/js/" + KLAVIYO_ID + "/klaviyo.js?company_id=" + KLAVIYO_ID;
    document.body.appendChild(s);
  }

  var bar;
  function show() {
    if (bar) { bar.hidden = false; bar.querySelector("button").focus(); return; }
    bar = document.createElement("div");
    bar.className = "cookie-bar";
    bar.setAttribute("role", "dialog");
    bar.setAttribute("aria-label", "Súhlas s cookies");
    bar.innerHTML =
      '<p><b>Cookies? Len s tvojím súhlasom.</b> Nevyhnutné potrebujeme, aby web fungoval. ' +
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
      if (b.dataset.cookie === "all") loadKlaviyo();
      // súhlas odvolaný po načítaní Klaviyo: obnoviť stránku, aby skript nebežal
      else if (prev === "all" && loaded) location.reload();
    });
    document.body.appendChild(bar);
  }

  document.addEventListener("click", function (e) {
    if (e.target.closest("[data-cookie-settings]")) { e.preventDefault(); show(); }
  });

  var v = get();
  if (v === "all") loadKlaviyo();
  else if (v !== "necessary") show();
})();
