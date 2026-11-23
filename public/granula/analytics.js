/* Granula — PostHog (SPEC P7). Načíta ho IBA cookies.js po súhlase s analytickými cookies.
   Udalosti idú cez vlastnú doménu (/ingest → PostHog US cloud, lib/analytics-routes.ts).
   Záznam relácie: všetky polia formulára maskované, texty s menom, kontaktom a adresou tiež.
   Z URL sa pred odoslaním odstráni ?test= (tajný token predaja), ?session_id= (Stripe) a ?kviz= (odkaz z emailu).
   Ostatné skripty volajú GranulaAnalytics.track / identify (fronta v cookies.js). */
(function () {
  if (window.__granulaPH) return;
  window.__granulaPH = true;

  var STRIP = ["test", "session_id", "kviz"];
  function cleanUrl(u) {
    if (!u || typeof u !== "string") return u;
    try {
      var x = new URL(u, location.origin), hit = false;
      STRIP.forEach(function (k) { if (x.searchParams.has(k)) { x.searchParams.delete(k); hit = true; } });
      return hit ? x.toString() : u;
    } catch (e) { return u; }
  }
  // texty v zázname relácie, ktoré nesú meno psa, kontakt alebo adresu
  var MASK_TEXT = "[data-name], #resume-list, #r-why, #swap-q, #d-text, #d-order, #p-contact, #p-ship, .dl-chosen, .dl-pick, #t-sex";

  function init(cfg) {
    /* oficiálny načítavač PostHogu (stub + array.js z api_host/static, u nás /ingest/static → us-assets) */
    !function(t,e){var o,n,p,r;e.__SV||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(p=t.createElement("script")).type="text/javascript",p.crossOrigin="anonymous",p.async=!0,p.src=s.api_host.replace(".i.posthog.com","-assets.i.posthog.com")+"/static/array.js",(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r);var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],u.toString=function(t){var e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e},u.people.toString=function(){return u.toString(1)+".people (stub)"},o="init capture register register_once register_for_session unregister unregister_for_session getFeatureFlag getFeatureFlagPayload isFeatureEnabled reloadFeatureFlags updateEarlyAccessFeatureEnrollment getEarlyAccessFeatures on onFeatureFlags onSessionId getSurveys getActiveMatchingSurveys renderSurvey canRenderSurvey getNextSurveyStep identify setPersonProperties group resetGroups setPersonPropertiesForFlags resetPersonPropertiesForFlags setGroupPropertiesForFlags resetGroupPropertiesForFlags reset get_distinct_id getGroups get_session_id get_session_replay_url alias set_config startSessionRecording stopSessionRecording sessionRecordingStarted captureException loadToolbar get_property getSessionProperty createPersonProfile opt_in_capturing opt_out_capturing has_opted_in_capturing has_opted_out_capturing clear_opt_in_out_capturing debug".split(" "),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);

    var ph = window.posthog;
    ph.init(cfg.key, {
      api_host: cfg.apiHost,
      ui_host: cfg.uiHost,
      person_profiles: "identified_only", // profil až po identify (zákazník v checkoute), anonymní návštevníci bez profilu
      capture_pageview: true,             // $pageview pri načítaní stránky (= page_view, SPEC §10 P7.1); obrazovky dotazníka sú udalosti
      capture_pageleave: true,
      autocapture: true,
      capture_dead_clicks: false,
      disable_session_recording: false,
      session_recording: {
        maskAllInputs: true,
        maskInputOptions: { password: true, email: true, tel: true, text: true, textarea: true, select: true, number: true, search: true },
        maskTextSelector: MASK_TEXT
      },
      // obsah sieťových požiadaviek (odpovede API) sa do záznamu neukladá
      enable_recording_console_log: false,
      before_send: function (ev) {
        if (!ev) return ev;
        var p = ev.properties || {};
        ["$current_url", "$referrer", "$initial_current_url", "$initial_referrer", "$prev_pageview_pathname"].forEach(function (k) { if (p[k]) p[k] = cleanUrl(p[k]); });
        if (ev.$set) ["$current_url", "$referrer"].forEach(function (k) { if (ev.$set[k]) ev.$set[k] = cleanUrl(ev.$set[k]); });
        if (ev.$set_once) ["$initial_current_url", "$initial_referrer"].forEach(function (k) { if (ev.$set_once[k]) ev.$set_once[k] = cleanUrl(ev.$set_once[k]); });
        // klik na uloženého psa nesie jeho meno v texte tlačidla
        if (ev.event === "$autocapture" && /resume-list|rs-go|rs-x/.test(p.$elements_chain || "")) return null;
        return ev;
      }
    });
    ph.register({ site: "granula.sk" });
    // udalosti z fronty (pred načítaním) v pôvodnom poradí; stub ich podrží, kým sa nenačíta array.js
    var q = window.GranulaAnalytics && window.GranulaAnalytics.drain ? window.GranulaAnalytics.drain() : [];
    q.forEach(function (x) { if (x[0] === "track") ph.capture(x[1], x[2] || {}); else if (x[0] === "identify" && x[1]) ph.identify(String(x[1]), x[2] || {}); });
    if (window.GranulaAnalytics) {
      window.GranulaAnalytics.ready = {
        // vždy aktuálny window.posthog: po načítaní array.js nahradí stub skutočnou inštanciou
        track: function (name, props) { window.posthog.capture(name, props || {}); },
        // identify(customer_id): email do PostHogu neposielame (SPEC P7)
        identify: function (id, props) { if (id) window.posthog.identify(String(id), props || {}); }
      };
    }
  }

  fetch("/api/analytics/config", { credentials: "omit" })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (c) { if (c && c.posthog && c.posthog.key) init(c.posthog); })
    .catch(function () {});
})();
