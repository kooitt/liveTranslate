import "./style.css";
import { initHostView } from "./host";
import { initListenView } from "./listen";
import { initAdminView } from "./admin";
import { initThemeToggle } from "./theme";
import { icons } from "./icons";

const appRoot = document.querySelector<HTMLDivElement>("#app")!;
const path = location.pathname;
const roomMatch = path.match(/^\/room\/([^/]+)\/?$/);
const isAdmin = path === "/admin" || path.startsWith("/admin/");

appRoot.innerHTML = `
  <header class="shell-header">
    <a href="/" class="brand">Verba<span class="brand-dot">·</span>Live</a>
    <div class="shell-header-right">
      <button id="theme-toggle" class="icon-btn"></button>
    </div>
  </header>
  <main id="main" class="shell-main"></main>
`;
initThemeToggle(document.querySelector<HTMLButtonElement>("#theme-toggle")!, icons);

const main = document.querySelector<HTMLDivElement>("#main")!;

if (isAdmin) {
  initAdminView(main);
} else if (roomMatch) {
  initListenView(main, decodeURIComponent(roomMatch[1]));
} else {
  renderLanding(main);
}

function renderLanding(main: HTMLElement): void {
  main.innerHTML = `
    <p class="panel-label">Live communication console</p>
    <h1 class="landing-title">Real-time speech, translated instantly.</h1>
    <p class="landing-tagline">
      One speaker. Any number of listeners. Each person hears the translation
      in their own language, live — via their room's permanent link or QR code.
    </p>
    <div class="btn-row">
      <button id="host-btn" class="btn btn-primary">Host a session</button>
    </div>
  `;
  main.querySelector<HTMLButtonElement>("#host-btn")!.onclick = () => initHostView(main);
}
