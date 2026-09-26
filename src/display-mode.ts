export type DisplayMode = "source" | "translation" | "both";

const KEY = "livetranslate-display-mode";
const MODES: DisplayMode[] = ["source", "translation", "both"];

export function isDisplayMode(value: string | null): value is DisplayMode {
  return value !== null && (MODES as string[]).includes(value);
}

export function getDisplayMode(): DisplayMode {
  const stored = localStorage.getItem(KEY);
  return isDisplayMode(stored) ? stored : "both";
}

export function setDisplayMode(mode: DisplayMode): void {
  localStorage.setItem(KEY, mode);
}

const LABELS: Record<DisplayMode, string> = { source: "Source", translation: "Translated", both: "Both" };

/** A 3-way segmented control. Calls onChange immediately and on every click. */
export function renderModeControl(container: HTMLElement, initial: DisplayMode, onChange: (mode: DisplayMode) => void): void {
  container.innerHTML = MODES.map(
    (m) => `<button type="button" class="segmented-option" data-mode="${m}" aria-pressed="${m === initial}">${LABELS[m]}</button>`,
  ).join("");
  container.querySelectorAll<HTMLButtonElement>(".segmented-option").forEach((btn) => {
    btn.onclick = () => {
      const mode = btn.dataset.mode as DisplayMode;
      container.querySelectorAll(".segmented-option").forEach((b) => b.setAttribute("aria-pressed", "false"));
      btn.setAttribute("aria-pressed", "true");
      onChange(mode);
    };
  });
}
