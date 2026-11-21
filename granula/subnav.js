/* Granula — sticky navigácia sekcií na úvodnej stránke: výška hlavičky (--hh) a zvýraznenie aktuálnej sekcie. */
(function () {
  "use strict";
  var nav = document.querySelector(".subnav");
  if (!nav) return;
  var head = document.querySelector(".site-head"), root = document.documentElement;
  function hh() { if (head) root.style.setProperty("--hh", head.offsetHeight + "px"); }
  hh(); window.addEventListener("resize", hh);
  var links = [].slice.call(nav.querySelectorAll("a"));
  var secs = links.map(function (a) { return document.getElementById(a.getAttribute("href").slice(1)); });
  var row = nav.querySelector(".subnav-row"), last = null;
  function spy() {
    var line = (head ? head.offsetHeight : 0) + nav.offsetHeight + 40, cur = -1;
    secs.forEach(function (s, i) { if (s && s.getBoundingClientRect().top <= line) cur = i; });
    if (cur === last) return;
    last = cur;
    links.forEach(function (a, i) { if (i === cur) a.setAttribute("aria-current", "true"); else a.removeAttribute("aria-current"); });
    // na mobile posuň riadok, aby bola aktívna záložka vidieť
    if (cur >= 0) { var a = links[cur]; row.scrollTo({ left: a.offsetLeft - row.clientWidth / 2 + a.offsetWidth / 2, behavior: "smooth" }); }
  }
  window.addEventListener("scroll", spy, { passive: true });
  spy();
})();
