// 3D-kaart met Mapbox GL JS. Zonder token blijft de SVG-placeholder staan.
//
// De kleuren van de kaart komen uit de CSS-tokens (css/tokens.css), dus Day en Night
// werken vanzelf. Wil je de kaart anders laten uitzien? Pas dan applyTheme() hieronder aan,
// of zet in STYLE de URL van een eigen stijl uit Mapbox Studio.

(() => {
  const TOKEN = (window.HMI_CONFIG && window.HMI_CONFIG.mapboxToken) || "";
  const STYLE = "mapbox://styles/mapbox/light-v11";

  // Vaste punten van de voorbeeldlijn (bij benadering). Via de Directions API volgt de route de echte wegen.
  const WAYPOINTS = [
    [3.2646, 50.8243], // Kortrijk Station
    [3.2240, 50.8160],
    [3.1792, 50.8085], // Wevelgem
    [3.1186, 50.7970]  // Menen
  ];

  const CAMERA = { zoom: 15.4, pitch: 62 };
  const SPEED = 40;            // meter per seconde in de demo
  const START_FRACTION = 0.3;  // waar de bus staat zonder animatie

  const el = document.getElementById("map-gl");
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)");

  let map = null;
  let styleReady = false;
  let marker = null;
  let hostCard = null;   // het kaartblok waar de kaart nu in zit
  let route = null;      // { coords, cumulative, length }
  let distance = 0;
  let bearing = 0;
  let lastFrame = 0;
  let active = false;    // is er een kaartblok zichtbaar?
  let rafId = 0;

  const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

  /* ------------------------------------------------------------
     Route
  ------------------------------------------------------------ */
  function haversine([lng1, lat1], [lng2, lat2]) {
    const rad = Math.PI / 180;
    const dLat = (lat2 - lat1) * rad;
    const dLng = (lng2 - lng1) * rad;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) ** 2;
    return 2 * 6371000 * Math.asin(Math.sqrt(a));
  }

  function bearingBetween([lng1, lat1], [lng2, lat2]) {
    const rad = Math.PI / 180;
    const y = Math.sin((lng2 - lng1) * rad) * Math.cos(lat2 * rad);
    const x = Math.cos(lat1 * rad) * Math.sin(lat2 * rad) - Math.sin(lat1 * rad) * Math.cos(lat2 * rad) * Math.cos((lng2 - lng1) * rad);
    return (Math.atan2(y, x) / rad + 360) % 360;
  }

  function buildRoute(coords) {
    const cumulative = [0];
    for (let i = 1; i < coords.length; i++) cumulative.push(cumulative[i - 1] + haversine(coords[i - 1], coords[i]));
    return { coords, cumulative, length: cumulative[cumulative.length - 1] };
  }

  function pointAt(d) {
    const { coords, cumulative } = route;
    let i = 1;
    while (i < cumulative.length - 1 && cumulative[i] < d) i++;
    const span = cumulative[i] - cumulative[i - 1] || 1;
    const t = Math.min(1, Math.max(0, (d - cumulative[i - 1]) / span));
    const a = coords[i - 1];
    const b = coords[i];
    return { lngLat: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], heading: bearingBetween(a, b) };
  }

  async function loadRoute() {
    const path = WAYPOINTS.map((p) => p.join(",")).join(";");
    const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${path}?geometries=geojson&overview=full&access_token=${TOKEN}`;
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(response.status);
      const data = await response.json();
      return data.routes[0].geometry.coordinates;
    } catch {
      return WAYPOINTS; // geen netwerk of geen rechten: rechte stukken tussen de punten
    }
  }

  /* ------------------------------------------------------------
     Lagen en kleuren
  ------------------------------------------------------------ */
  function addLayers() {
    if (!map.getSource("route")) {
      map.addSource("route", { type: "geojson", data: { type: "Feature", geometry: { type: "LineString", coordinates: route ? route.coords : WAYPOINTS } } });
    }

    // 3D-gebouwen, onder de labels
    const firstLabel = map.getStyle().layers.find((l) => l.type === "symbol" && l.layout && l.layout["text-field"]);
    if (!map.getLayer("3d-buildings")) {
      map.addLayer({
        id: "3d-buildings",
        source: "composite",
        "source-layer": "building",
        filter: ["==", "extrude", "true"],
        type: "fill-extrusion",
        minzoom: 13,
        paint: {
          "fill-extrusion-color": "#cccccc",
          "fill-extrusion-height": ["get", "height"],
          "fill-extrusion-base": ["get", "min_height"],
          "fill-extrusion-opacity": 0.92
        }
      }, firstLabel && firstLabel.id);
    }

    if (!map.getLayer("route-casing")) {
      map.addLayer({ id: "route-casing", type: "line", source: "route", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#ffffff", "line-width": 20 } }, firstLabel && firstLabel.id);
      map.addLayer({ id: "route-line", type: "line", source: "route", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#ffe14d", "line-width": 12 } }, firstLabel && firstLabel.id);
    }
  }

  // Zet de kleuren van de kaart op de tokens van het huidige thema.
  function applyTheme() {
    if (!map || !styleReady) return;

    const land = css("--color-bg-raised");
    const road = css("--color-bg-surface");
    const water = css("--color-bg-raised-pressed");
    const building = css("--color-bg-raised-pressed");
    const label = css("--color-text-secondary");
    const accent = css("--color-bg-accent");

    const set = (id, prop, value) => { try { map.setPaintProperty(id, prop, value); } catch { /* deze laag kent die eigenschap niet */ } };

    for (const layer of map.getStyle().layers) {
      const { id, type } = layer;
      const source = layer["source-layer"];

      if (type === "background") set(id, "background-color", land);
      else if (id === "3d-buildings") set(id, "fill-extrusion-color", building);
      else if (id === "route-line") set(id, "line-color", accent);
      else if (id === "route-casing") set(id, "line-color", road);
      else if (type === "fill" && source === "water") set(id, "fill-color", water);
      else if (type === "fill" && source === "building") set(id, "fill-opacity", 0);
      else if (type === "fill" && ["landuse", "landcover", "national_park", "landuse_overlay"].includes(source)) set(id, "fill-color", land);
      else if (type === "fill" && source === "road") set(id, "fill-color", road);
      else if (type === "line" && source === "waterway") set(id, "line-color", water);
      else if (type === "line" && source === "road") {
        if (/case/.test(id)) set(id, "line-opacity", 0);
        else set(id, "line-color", road);
      } else if (type === "line" && ["admin", "aeroway", "structure"].includes(source)) set(id, "line-opacity", 0);
      else if (type === "symbol") {
        if (/poi|transit|airport|natural|waterway/.test(id)) map.setLayoutProperty(id, "visibility", "none");
        else { set(id, "text-color", label); set(id, "text-halo-color", land); }
      }
    }
  }

  /* ------------------------------------------------------------
     Rijden
  ------------------------------------------------------------ */
  function place(d) {
    const { lngLat, heading } = pointAt(d);
    // Rustige draaiing: de camera volgt de rijrichting niet met een ruk.
    const delta = ((heading - bearing + 540) % 360) - 180;
    bearing = (bearing + delta * 0.08 + 360) % 360;
    marker.setLngLat(lngLat);
    map.jumpTo({ center: lngLat, bearing, pitch: CAMERA.pitch });
  }

  function tick(now) {
    rafId = 0;
    if (!active || !route) return;
    const dt = lastFrame ? Math.min(0.1, (now - lastFrame) / 1000) : 0;
    lastFrame = now;
    distance = (distance + SPEED * dt) % route.length;
    place(distance);
    rafId = requestAnimationFrame(tick);
  }

  function updateLoop() {
    if (reduceMotion.matches || !active || !route) return;
    if (!rafId) { lastFrame = 0; rafId = requestAnimationFrame(tick); }
  }

  /* ------------------------------------------------------------
     Publieke functies voor app.js
  ------------------------------------------------------------ */
  async function init() {
    if (!TOKEN || !window.mapboxgl || !el) return;

    mapboxgl.accessToken = TOKEN;
    map = new mapboxgl.Map({
      container: el,
      style: STYLE,
      center: WAYPOINTS[0],
      zoom: CAMERA.zoom,
      pitch: CAMERA.pitch,
      interactive: false,       // de kaartlink eronder blijft klikbaar
      attributionControl: false,
      fadeDuration: 0
    });
    map.addControl(new mapboxgl.AttributionControl({ compact: true }), "bottom-right");

    // Toon in de console wat er misgaat, zonder de token te tonen.
    map.on("error", (event) => {
      const { status, url = "", message = "" } = event.error || {};
      console.warn("Mapbox:", status || "", String(url).replace(/access_token=[^&]+/, "access_token=***").slice(0, 160), message);
    });

    const dot = document.createElement("div");
    dot.className = "bus-marker";
    marker = new mapboxgl.Marker({ element: dot });

    map.on("style.load", () => { styleReady = true; addLayers(); applyTheme(); });
    map.on("load", async () => {
      route = buildRoute(await loadRoute());
      map.getSource("route").setData({ type: "Feature", geometry: { type: "LineString", coordinates: route.coords } });
      distance = route.length * START_FRACTION;
      marker.setLngLat(route.coords[0]).addTo(map);
      place(distance);
      updateLoop();
    });

    reduceMotion.addEventListener("change", updateLoop);
    addEventListener("resize", () => requestAnimationFrame(padForOverlay));
  }

  // Houd de bus zichtbaar onder de kaart "Volgende halte" die over de kaart ligt.
  function padForOverlay() {
    if (!map || !hostCard) return;
    const overlay = hostCard.querySelector(".next-stop");
    const top = overlay ? overlay.offsetTop + overlay.offsetHeight + 24 : 0;
    map.setPadding({ top, bottom: 40, left: 0, right: 0 });
  }

  // Verplaats de kaart naar het kaartblok van de zichtbare weergave (of verberg hem).
  function attach(view) {
    if (!map) return;
    const card = document.querySelector(`#view-${view} .map-card`);
    active = Boolean(card);
    if (card) {
      card.insertBefore(el, card.querySelector(".next-stop"));
      card.classList.add("map-card--gl");
      el.hidden = false;
      hostCard = card;
      map.resize();
      padForOverlay();
      updateLoop();
    }
  }

  function zoom(step) { if (map) map.easeTo({ zoom: map.getZoom() + step * 0.7, duration: 300 }); }

  window.HmiMap = { init, attach, applyTheme, zoom, enabled: Boolean(TOKEN) };
  init();
})();
