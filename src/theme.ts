export type Theme = "light" | "dark";

const STORAGE_KEY = "livetranslate-theme";

function systemPrefersDark(): boolean {
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
}

export function getTheme(): Theme {
  const stored = localStorage.getItem(STORAGE_KEY) as Theme | null;
  return stored ?? (systemPrefersDark() ? "dark" : "light");
}

export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem(STORAGE_KEY, theme);
}

/** Wires an icon button to toggle + persist the theme, and applies it now. */
export function initThemeToggle(button: HTMLButtonElement, iconsMod: { sun: string; moon: string }): void {
  const render = () => {
    const current = getTheme();
    button.innerHTML = current === "dark" ? iconsMod.sun : iconsMod.moon;
    button.setAttribute("aria-label", current === "dark" ? "Switch to light theme" : "Switch to dark theme");
  };
  applyTheme(getTheme());
  render();
  button.onclick = () => {
    applyTheme(getTheme() === "dark" ? "light" : "dark");
    render();
  };
}
