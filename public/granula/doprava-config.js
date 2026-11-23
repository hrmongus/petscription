/* Granula — DOPRAVCOVIA: jediné miesto na zmenu pravidiel doručenia (SPEC P1b).
   Používa ho dotazník v prehliadači (window.GranulaCarriers) aj server (lib/carriers.ts → overenie a cena
   v /api/checkout a kód služby pre FHB). Po zmene stačí nasadiť web.

   Ako upraviť:
   - BY_BAG: ktoré spôsoby doručenia ponúknuť pri balení (poradie = poradie v dotazníku) a ktorý je predvolený.
   - BOXES:  či pri výdajnom mieste povoliť aj boxy (Z-BOX, AlzaBox, DPD Pickup Box…); false = iba výdajné miesta.
   - PRICE:  cena dopravy pre zákazníka v € (konečná cena) podľa plánu: raz = jednorazovo, mesiac = predplatné;
             0 = zadarmo; null = predvolená cena z engine.js (PARAMS.shipping, 4,90 €).
   - COST:   cena FHB bez DPH v € (iba na prehľad a porovnanie, zákazník ju nevidí).
   - METHODS.logo: logo dopravcu v karte (public/granula/img/dopravcovia/, oficiálne SVG z webu dopravcu).
   - METHODS.etaEmail: doba doručenia v emaile „Balík je na ceste“ (pracovné dni od odoslania; zámerne dlhšia ako eta v dotazníku).
   - METHODS.fhbService: kód služby vo FHB (parcel_service). Dá sa prepísať aj env FHB_SERVICE_<PACKETA|DPD|SPS_COURIER>. */
(function () {
  "use strict";

  var METHODS = {
    packeta_point: {
      label: "Packeta – výdajné miesto alebo Z-BOX", eta: "2–3 pracovné dni", etaEmail: "2–4",
      carrier: "packeta", logo: "img/dopravcovia/packeta.svg", pickup: true, maxKg: 15,
      fhbService: "zasielkovna_sk"   // overené v sandboxe FHB (21. 11. 2026): 3 857 miest SK, kód miesta = ID Packety
    },
    dpd_pickup: {
      label: "DPD – odberné miesta a boxy", eta: "2–3 pracovné dni", etaEmail: "2–4",
      carrier: "dpd", logo: "img/dopravcovia/dpd.svg", pickup: true, maxKg: null,
      fhbService: "dpd_sk"           // overené v sandboxe FHB: 3 961 miest SK, kód miesta = ID z mapy DPD (napr. SK21286)
    },
    sps_courier: {
      label: "SPS – kuriér na adresu", eta: "1–2 pracovné dni", etaEmail: "1–3",
      carrier: "sps", logo: "img/dopravcovia/sps.svg", pickup: false, maxKg: null,
      fhbService: ""                 // ⚠️ kód zatiaľ nepoznáme (od FHB); prázdne = predvolená služba účtu vo FHB
    }
  };

  // Packeta má limit 15 kg → pri 18 kg (2 × 9 kg) sa neponúka.
  var BY_BAG = {
    "4":  { methods: ["packeta_point", "dpd_pickup", "sps_courier"], default: "packeta_point" },
    "9":  { methods: ["dpd_pickup", "sps_courier"], default: "dpd_pickup" },   // Packeta pri 9 kg nie (FHB 4,23 € vs. DPD 2,71 €, cenník 23. 11.)
    "18": { methods: ["dpd_pickup", "sps_courier"], default: "dpd_pickup" }
  };

  // Boxy pri výdajných miestach podľa balenia. 18 kg (2 × 9 kg) do DPD boxu nie: iba odberné miesta.
  var BOXES = {
    "4":  { packeta_point: true, dpd_pickup: true },
    "9":  { packeta_point: true, dpd_pickup: true },
    "18": { dpd_pickup: false }
  };

  // Cena pre zákazníka, konečná (€), podľa plánu (raz = jednorazovo, mesiac = predplatné). 0 = zadarmo,
  // null = PARAMS.shipping. Cenník od 23. 11. 2026 (zadanie používateľa).
  var PRICE = {
    "4":  { packeta_point: { raz: 3.90, mesiac: 0 }, dpd_pickup: { raz: 3.90, mesiac: 0 }, sps_courier: { raz: 4.90, mesiac: 1.90 } },
    "9":  { dpd_pickup: { raz: 3.90, mesiac: 0 }, sps_courier: { raz: 5.90, mesiac: 1.90 } },
    "18": { dpd_pickup: { raz: 4.90, mesiac: 0 }, sps_courier: { raz: 9.90, mesiac: 3.90 } }
  };

  // Cenník FHB bez DPH (€), na prehľad.
  var COST = {
    "4":  { packeta_point: 1.95, dpd_pickup: 2.64, sps_courier: 3.29 },
    "9":  { packeta_point: 4.23, dpd_pickup: 2.71, sps_courier: 4.65 },
    "18": { dpd_pickup: 3.15, sps_courier: 7.63 }
  };

  /* ---------------- pomocné funkcie (nemeniť) ---------------- */
  function methodsFor(bagId) {
    var b = BY_BAG[String(bagId)];
    return b ? b.methods.filter(function (m) { return !!METHODS[m]; }) : [];
  }
  function defaultFor(bagId) {
    var b = BY_BAG[String(bagId)], list = methodsFor(bagId);
    return b && list.indexOf(b.default) !== -1 ? b.default : (list[0] || "");
  }
  function allowed(method, bagId) { return methodsFor(bagId).indexOf(method) !== -1; }
  /** povolené boxy pri výdajnom mieste (predvolene áno) */
  function boxes(method, bagId) {
    var row = BOXES[String(bagId)] || {};
    return row[method] !== false;
  }
  /** cena dopravy pre zákazníka (€, konečná) pre plán (raz | mesiac; iné = mesiac); fallback = PARAMS.shipping */
  function price(method, bagId, fallback, plan) {
    var row = PRICE[String(bagId)] || {}, v = row[method];
    if (v != null && typeof v === "object") v = v[plan === "raz" ? "raz" : "mesiac"];
    return v == null || isNaN(v) ? fallback : +v;
  }

  var api = { METHODS: METHODS, BY_BAG: BY_BAG, BOXES: BOXES, PRICE: PRICE, COST: COST, methodsFor: methodsFor, defaultFor: defaultFor, allowed: allowed, boxes: boxes, price: price };
  if (typeof module === "object" && module.exports) module.exports = api;
  if (typeof window !== "undefined") window.GranulaCarriers = api;
})();
