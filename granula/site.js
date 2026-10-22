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
})();
