import "./style.css";
import { initHostView } from "./host";
import { initListenView } from "./listen";
import { initDisplayView } from "./display";
import { initThemeToggle } from "./theme";
import { icons } from "./icons";

const appRoot = document.querySelector<HTMLDivElement>("#app")!;
const params = new URLSearchParams(location.search);
const displayCode = params.get("display");
const roomFromLink = params.get("room") ?? "";

if (displayCode) {
  // Event display mode gets zero chrome — no header, no theme toggle.
  initDisplayView(appRoot, displayCode, params.get("lang") ?? "en");
} else {
  appRoot.innerHTML = `
    <header class="shell-header">
      <a href="${location.pathname}" class="brand">Verba<span class="brand-dot">·</span>Live</a>
      <div class="shell-header-right">
        <button id="theme-toggle" class="icon-btn"></button>
      </div>
    </header>
    <main id="main" class="shell-main"></main>
  `;
  initThemeToggle(document.querySelector<HTMLButtonElement>("#theme-toggle")!, icons);

  const main = document.querySelector<HTMLDivElement>("#main")!;
  if (roomFromLink) {
    initListenView(main, roomFromLink);
  } else {
    renderLanding(main);
  }
}

function renderLanding(main: HTMLElement): void {
  main.innerHTML = `
    <p class="panel-label">Live communication console</p>
    <h1 class="landing-title">Real-time speech, translated instantly.</h1>
    <p class="landing-tagline">
      One speaker. Any number of listeners. Each person hears the translation
      in their own language, live.
    </p>
    <div class="btn-row">
      <button id="host-btn" class="btn btn-primary">Host a session</button>
      <button id="join-btn" class="btn btn-secondary">Join a session</button>
    </div>
  `;
  main.querySelector<HTMLButtonElement>("#host-btn")!.onclick = () => initHostView(main);
  main.querySelector<HTMLButtonElement>("#join-btn")!.onclick = () => initListenView(main, "");
}
