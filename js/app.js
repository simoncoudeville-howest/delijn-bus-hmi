// De Lijn bus HMI: navigatie met de View Transition API.
// Eén pagina met vier weergaven. We wisselen de weergave binnen document.startViewTransition(),
// zodat de browser de oude en nieuwe staat kan laten overvloeien of morphen.

const root = document.documentElement;
const screen = document.getElementById("screen");
const views = [...document.querySelectorAll(".view")];
const navItems = [...document.querySelectorAll("[data-nav]")];
const viewTitle = document.getElementById("view-title");

const TITLES = { dashboard: "Overzicht", route: "Route", energy: "Energie", climate: "Klimaat" };
const supportsTransitions = "startViewTransition" in document;
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)");

let current = viewFromHash();

/* ------------------------------------------------------------
   Navigatie
------------------------------------------------------------ */
function viewFromHash() {
  const name = location.hash.slice(1);
  return name in TITLES ? name : "dashboard";
}

// Zet de DOM in de staat van de gekozen weergave. Geen animatie hier.
function render(view) {
  views.forEach((v) => { v.hidden = v.dataset.view !== view; });
  screen.dataset.view = view;
  navItems.forEach((item) => {
    if (item.dataset.nav === view) item.setAttribute("aria-current", "page");
    else item.removeAttribute("aria-current");
  });
  viewTitle.textContent = TITLES[view];
  document.title = `${TITLES[view]} | De Lijn bus HMI`;
  window.HmiMap?.attach(view); // de 3D-kaart verhuist mee naar het zichtbare kaartblok
}

function show(view) {
  if (view === current) return;
  current = view;

  if (!supportsTransitions) {
    render(view);
    return;
  }

  const transition = document.startViewTransition(() => render(view));

  // Na een klik op een kaart bestaat het aangeklikte element niet meer: zet de focus op de navigatie.
  transition.finished.finally(() => {
    if (document.activeElement === document.body || !document.activeElement?.isConnected) {
      navItems.find((item) => item.dataset.nav === view)?.focus({ preventScroll: true });
    }
  });
}

// Alle links zijn gewone #-links, dus de terugknop van de browser werkt vanzelf.
addEventListener("hashchange", () => show(viewFromHash()));
render(current);

/* ------------------------------------------------------------
   Dag en nacht, met een cirkel die uitdijt vanaf de knop
------------------------------------------------------------ */
const themeButton = document.getElementById("theme-toggle");

function applyTheme(theme) {
  root.dataset.theme = theme;
  const night = theme === "night";
  themeButton.setAttribute("aria-pressed", String(night));
  themeButton.setAttribute("aria-label", night ? "Dagmodus" : "Nachtmodus");
  themeButton.querySelector("i").className = night ? "ph ph-sun" : "ph ph-moon";
  window.HmiMap?.applyTheme(); // kaartkleuren volgen de tokens van het thema
  try { localStorage.setItem("delijn-hmi-theme", theme); } catch { /* opslag niet beschikbaar */ }
}

function initialTheme() {
  try {
    const saved = localStorage.getItem("delijn-hmi-theme");
    if (saved === "day" || saved === "night") return saved;
  } catch { /* opslag niet beschikbaar */ }
  return matchMedia("(prefers-color-scheme: dark)").matches ? "night" : "day";
}

applyTheme(initialTheme());

themeButton.addEventListener("click", (event) => {
  const next = root.dataset.theme === "night" ? "day" : "night";

  if (!supportsTransitions || reduceMotion.matches) {
    applyTheme(next);
    return;
  }

  // Bij toetsenbordbediening is clientX 0: begin dan in het midden van de knop.
  const rect = themeButton.getBoundingClientRect();
  const x = event.detail === 0 ? rect.left + rect.width / 2 : event.clientX;
  const y = event.detail === 0 ? rect.top + rect.height / 2 : event.clientY;
  const radius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));

  root.classList.add("theme-switching"); // zet de view-transition-names even uit (zie CSS)
  const transition = document.startViewTransition(() => applyTheme(next));

  transition.ready.then(() => {
    root.animate(
      { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
      { duration: 600, easing: "cubic-bezier(0.2, 0, 0, 1)", pseudoElement: "::view-transition-new(root)" }
    );
  });
  transition.finished.finally(() => root.classList.remove("theme-switching"));
});

/* ------------------------------------------------------------
   Klimaat: temperatuur, ventilator en modus
------------------------------------------------------------ */
let temperature = 21;
const MIN_TEMP = 16;
const MAX_TEMP = 28;

document.addEventListener("click", (event) => {
  const zoom = event.target.closest("[data-zoom]");
  if (zoom) {
    window.HmiMap?.zoom(Number(zoom.dataset.zoom));
    return;
  }

  const step = event.target.closest("[data-temp-step]");
  if (step) {
    temperature = Math.min(MAX_TEMP, Math.max(MIN_TEMP, temperature + Number(step.dataset.tempStep)));
    document.querySelectorAll("[data-temp-value]").forEach((el) => { el.textContent = temperature; });
    return;
  }

  const option = event.target.closest("[data-group] > button");
  if (option) {
    option.parentElement.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b === option)));
  }
});

