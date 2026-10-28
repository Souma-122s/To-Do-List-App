const themeStorageKey = "daylight.theme.v1";
let themeTransitionTimer;

function applyTheme(theme, persist = false, animate = false) {
  const selectedTheme = theme === "dark" ? "dark" : "light";
  const root = document.documentElement;
  const shouldAnimate = animate && !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (shouldAnimate) {
    root.classList.add("theme-transitioning");
    window.clearTimeout(themeTransitionTimer);
    themeTransitionTimer = window.setTimeout(() => root.classList.remove("theme-transitioning"), 220);
  }
  root.dataset.theme = selectedTheme;
  root.style.colorScheme = selectedTheme;

  const themeColor = document.querySelector('meta[name="theme-color"]');
  if (themeColor) themeColor.content = selectedTheme === "dark" ? "#191820" : "#f6f7fb";

  const button = document.querySelector("#theme-toggle");
  if (button) {
    const label = selectedTheme === "dark" ? "Switch to light mode" : "Switch to dark mode";
    button.setAttribute("aria-label", label);
    button.setAttribute("aria-pressed", String(selectedTheme === "dark"));
    button.title = label;
  }

  if (persist) {
    try { localStorage.setItem(themeStorageKey, selectedTheme); }
    catch { /* The selected theme still applies for this page. */ }
  }
}

let savedTheme = "light";
try {
  savedTheme = localStorage.getItem(themeStorageKey) || "light";
} catch { /* Use the default light theme when storage is unavailable. */ }
applyTheme(savedTheme);

document.addEventListener("DOMContentLoaded", () => {
  const button = document.querySelector("#theme-toggle");
  button?.addEventListener("click", () => {
    const nextTheme = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    applyTheme(nextTheme, true, true);
  });
});

window.addEventListener("storage", (event) => {
  if (event.key === themeStorageKey && (event.newValue === "light" || event.newValue === "dark")) {
    applyTheme(event.newValue, false, true);
  }
});