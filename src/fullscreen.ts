import { icons } from "./icons";

// ponytail: iOS Safari has no Fullscreen API for ordinary elements — only
// <video> gets a (separate, webkit-only) fullscreen method — so
// requestFullscreen is just absent there and silently does nothing when
// called, which is why the button "doesn't work" on iPhone but works on
// Android/desktop. Fall back to a fixed-position class that fills the
// viewport the same way, toggled by the same button and by Escape.
export function wireFullscreenButtons(root: ParentNode): void {
  function setActive(btn: HTMLButtonElement, active: boolean): void {
    btn.innerHTML = active ? icons.close : icons.expand;
  }

  function exitFake(panel: HTMLElement, btn: HTMLButtonElement): void {
    panel.classList.remove("fake-fullscreen");
    setActive(btn, false);
  }

  root.querySelectorAll<HTMLButtonElement>(".fullscreen-btn").forEach((btn) => {
    btn.onclick = () => {
      const panel = root.querySelector<HTMLElement>(`#${btn.dataset.target}`);
      if (!panel) return;
      if (panel.classList.contains("fake-fullscreen")) {
        exitFake(panel, btn);
        return;
      }
      if (document.fullscreenElement === panel) {
        document.exitFullscreen();
        return;
      }
      if (typeof panel.requestFullscreen !== "function") {
        panel.classList.add("fake-fullscreen");
        setActive(btn, true);
        return;
      }
      panel.requestFullscreen().catch(() => {
        panel.classList.add("fake-fullscreen");
        setActive(btn, true);
      });
    };
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    root.querySelectorAll<HTMLElement>(".console-panel.fake-fullscreen").forEach((panel) => {
      const btn = root.querySelector<HTMLButtonElement>(`.fullscreen-btn[data-target="${panel.id}"]`);
      if (btn) exitFake(panel, btn);
    });
  });

  document.addEventListener("fullscreenchange", () => {
    root.querySelectorAll<HTMLButtonElement>(".fullscreen-btn").forEach((btn) => {
      const panel = root.querySelector<HTMLElement>(`#${btn.dataset.target}`);
      if (panel && panel.classList.contains("fake-fullscreen")) return;
      setActive(btn, !!panel && document.fullscreenElement === panel);
    });
  });
}
