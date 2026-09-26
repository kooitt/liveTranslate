import "./style.css";
import { initHostView } from "./host";
import { initListenView } from "./listen";

const app = document.querySelector<HTMLDivElement>("#app")!;
const roomFromLink = new URLSearchParams(location.search).get("room") ?? "";

function renderLanding(): void {
  app.innerHTML = `
    <div class="landing">
      <h1 class="brand">🌍 LiveTranslate</h1>
      <p class="tagline">Live conference captions, translated into your language.</p>
      <div class="landing-actions">
        <button id="host-btn" class="big-btn primary">🎤 Host a session</button>
        <button id="join-btn" class="big-btn secondary">🌐 Join a session</button>
      </div>
    </div>
  `;
  app.querySelector<HTMLButtonElement>("#host-btn")!.onclick = () => initHostView(app);
  app.querySelector<HTMLButtonElement>("#join-btn")!.onclick = () => initListenView(app, "");
}

if (roomFromLink) {
  initListenView(app, roomFromLink);
} else {
  renderLanding();
}
