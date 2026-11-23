/* Farby sú v atribútoch (svetlý podklad); na tmavom podklade ich prepíše CSS cez triedy
   .rg (mriežka), .rs (os, .locked), .rshape (tvar), .rd (bod, .locked), .radar-lbl (.locked). */
/* Granula — radarový graf „Profil tvojho psa“ (dotazník aj admin-vypocet.html).
   Hodnoty vždy z GranulaEngine.profilPsa(); tento súbor len kreslí.
   var r = new GranulaRadar(el); r.update(profil)   // profil = { hodnoty, zamknute, osi } */
(function () {
  "use strict";
  var NS = "http://www.w3.org/2000/svg", NEUTRAL = 0.5;

  function Radar(el, opts) {
    opts = opts || {};
    this.el = el; this.duration = opts.duration || 480;
    this.axes = opts.axes || (window.GranulaEngine && GranulaEngine.PROFILE_AXES) || [];
    this.W = 680; this.H = 560; this.cx = 340; this.cy = 280; this.R = 165;
    this.shown = this.axes.map(function () { return NEUTRAL; });
    this.locked = this.axes.map(function () { return true; });
    var self = this, svg = document.createElementNS(NS, "svg");
    svg.setAttribute("viewBox", "0 0 " + this.W + " " + this.H);
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", "Profil potrieb psa");
    function mk(tag, attrs) { var n = document.createElementNS(NS, tag); for (var k in attrs) n.setAttribute(k, attrs[k]); svg.appendChild(n); return n; }
    [0.25, 0.5, 0.75, 1].forEach(function (r) { mk("path", { "class": "rg", d: self.path(self.axes.map(function () { return r; })), fill: "none", stroke: "rgba(0,0,0,.18)", "stroke-width": 1 }); });
    this.spokes = this.axes.map(function (_, i) { var p = self.pt(i, 1); return mk("line", { "class": "rs", x1: self.cx, y1: self.cy, x2: p[0], y2: p[1], "stroke-width": 1.5 }); });
    this.shape = mk("path", { "class": "rshape", fill: "rgba(255,105,0,.55)", stroke: "#000", "stroke-width": 2, "stroke-linejoin": "miter" });
    this.dots = this.axes.map(function () { return mk("rect", { "class": "rd", width: 8, height: 8 }); });
    el.classList.add("radar");
    el.appendChild(svg);
    // popisy osí ako HTML (SVG <text> sa niekde nevykreslí)
    this.labels = this.axes.map(function (ax, i) {
      var d = document.createElement("div"), p = self.pt(i, 1.1), c = Math.cos(self.ang(i)), n = self.axes.length;
      d.className = "radar-lbl"; d.innerHTML = '<span class="rl-l">' + ax.label + '</span><span class="rl-s">' + (ax.short || ax.label) + "</span>";
      d.style.left = (p[0] / self.W * 100) + "%";
      d.style.top = (p[1] / self.H * 100) + "%";
      if (i === 0) { d.style.transform = "translate(-50%,-100%)"; d.style.textAlign = "center"; }
      else if (i === n / 2) { d.style.transform = "translate(-50%,0)"; d.style.textAlign = "center"; }
      else if (c > 0) { d.style.transform = "translate(0,-50%)"; d.style.textAlign = "left"; }
      else { d.style.transform = "translate(-100%,-50%)"; d.style.textAlign = "right"; }
      el.appendChild(d);
      return d;
    });
    this.paintLocks();
    this.draw(this.shown);
  }
  Radar.prototype.ang = function (i) { return (-90 + 360 / this.axes.length * i) * Math.PI / 180; };
  Radar.prototype.pt = function (i, v) { return [this.cx + Math.cos(this.ang(i)) * this.R * v, this.cy + Math.sin(this.ang(i)) * this.R * v]; };
  Radar.prototype.path = function (vals) {
    var self = this;
    return vals.map(function (v, i) { var p = self.pt(i, v); return (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1); }).join(" ") + " Z";
  };
  Radar.prototype.draw = function (vals) {
    var self = this;
    this.shape.setAttribute("d", this.path(vals));
    vals.forEach(function (v, i) {
      var p = self.pt(i, v);
      self.dots[i].setAttribute("x", (p[0] - 4).toFixed(1));
      self.dots[i].setAttribute("y", (p[1] - 4).toFixed(1));
      self.dots[i].setAttribute("fill", self.locked[i] ? "rgba(0,0,0,.35)" : "#000");
      self.dots[i].classList.toggle("locked", self.locked[i]);
    });
  };
  Radar.prototype.paintLocks = function () {
    var self = this;
    this.locked.forEach(function (l, i) {
      self.spokes[i].setAttribute("stroke", l ? "rgba(0,0,0,.3)" : "rgba(0,0,0,.55)");
      self.spokes[i].setAttribute("stroke-dasharray", l ? "4 6" : "none");
      self.labels[i].classList.toggle("locked", l);
      self.spokes[i].classList.toggle("locked", l);
    });
  };
  Radar.prototype.update = function (profil) {
    var self = this, values = this.axes.map(function (ax) { return profil.hodnoty[ax.key]; });
    this.locked = this.axes.map(function (ax) { return !!profil.zamknute[ax.key]; });
    this.paintLocks();
    if (this.raf) cancelAnimationFrame(this.raf);
    var from = this.shown.slice(), start = performance.now();
    var reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
    function tick(now) {
      var t = reduce ? 1 : Math.min(1, (now - start) / self.duration), e = 1 - Math.pow(1 - t, 3);
      self.shown = values.map(function (v, i) { return from[i] + (v - from[i]) * e; });
      self.draw(self.shown);
      self.raf = t < 1 ? requestAnimationFrame(tick) : null;
    }
    this.raf = requestAnimationFrame(tick);
  };

  window.GranulaRadar = Radar;
})();
