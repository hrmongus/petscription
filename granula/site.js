/* Granula — drobné interakcie pre obsahové stránky. */
(function () {
  // objavovanie pri scrolle
  var els = document.querySelectorAll("[data-reveal]");
  if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
      });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });
    els.forEach(function (el) { io.observe(el); });
  } else {
    els.forEach(function (el) { el.classList.add("in"); });
  }

  // karusel: šípky posúvajú o jednu kartu, na konci sa vypnú
  document.querySelectorAll("[data-carousel]").forEach(function (root) {
    var row = root.querySelector("[data-carousel-row]");
    var prev = root.querySelector("[data-carousel-prev]");
    var next = root.querySelector("[data-carousel-next]");
    function step() {
      var card = row.firstElementChild;
      return card ? card.getBoundingClientRect().width + parseFloat(getComputedStyle(row).columnGap || 0) : row.clientWidth;
    }
    function sync() {
      var max = row.scrollWidth - row.clientWidth - 2;
      root.classList.toggle("is-static", max <= 0); // všetko sa zmestí: šípky ostanú, len nič nerobia
      prev.disabled = row.scrollLeft <= 2;
      next.disabled = row.scrollLeft >= max;
    }
    prev.addEventListener("click", function () { row.scrollBy({ left: -step(), behavior: "smooth" }); });
    next.addEventListener("click", function () { row.scrollBy({ left: step(), behavior: "smooth" }); });
    row.addEventListener("scroll", sync, { passive: true });
    window.addEventListener("resize", sync);
    sync();
  });

  // mäso na mobile: ikony nad kartami, karusel sa sám posúva zľava doprava
  document.querySelectorAll(".meats").forEach(function (row) {
    var cards = [].slice.call(row.querySelectorAll(".meat"));
    if (cards.length < 2 || !window.GranulaIcons) return;
    var tabs = document.createElement("div");
    tabs.className = "meat-tabs";
    tabs.setAttribute("role", "tablist");
    tabs.setAttribute("aria-label", "Druhy mäsa");
    cards.forEach(function (card, i) {
      var b = document.createElement("button");
      b.type = "button";
      b.setAttribute("role", "tab");
      b.setAttribute("aria-label", card.querySelector("h3").textContent);
      b.innerHTML = GranulaIcons.svg(card.querySelector(".ico").dataset.icon, 30, "#000000");
      b.addEventListener("click", function () { go(i); pause(); });
      tabs.appendChild(b);
    });
    row.parentNode.insertBefore(tabs, row);
    var mobile = window.matchMedia("(max-width:640px)");
    var still = window.matchMedia("(prefers-reduced-motion: reduce)");
    var cur = 0, held = 0, seen = false;
    function mark(i) {
      cur = i;
      [].forEach.call(tabs.children, function (b, j) { b.setAttribute("aria-selected", j === i ? "true" : "false"); });
    }
    function go(i) { row.scrollTo({ left: i * (cards[0].offsetWidth + 16), behavior: still.matches ? "auto" : "smooth" }); mark(i); }
    function pause() { held = Date.now() + 8000; }
    row.addEventListener("scroll", function () {
      if (!mobile.matches) return;
      mark(Math.max(0, Math.min(cards.length - 1, Math.round(row.scrollLeft / (cards[0].offsetWidth + 16)))));
    }, { passive: true });
    row.addEventListener("pointerdown", pause);
    row.addEventListener("touchstart", pause, { passive: true });
    mark(0);
    if (mobile.matches) cards.forEach(function (c) { c.classList.add("in"); });
    if ("IntersectionObserver" in window) new IntersectionObserver(function (e) { seen = e[0].isIntersecting; }, { threshold: 0.4 }).observe(row);
    setInterval(function () {
      if (!mobile.matches || still.matches || !seen || Date.now() < held || document.hidden) return;
      go((cur + 1) % cards.length);
    }, 3500);
  });
})();
