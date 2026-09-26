import { LANGUAGES, type LanguageOption } from "./languages";
import { isSpeechEnabled, setSpeechEnabled, speak } from "./tts";

let socket: WebSocket | null = null;

export function initListenView(root: HTMLElement, initialCode: string): void {
  root.innerHTML = `
    <div class="screen">
      <h1>Join a session</h1>
      <input id="code-input" class="code-input" placeholder="Room code" maxlength="8" value="${initialCode}" />
      <div id="lang-grid" class="lang-grid"></div>
      <div id="captions" class="captions hidden">
        <div class="captions-header">
          <button id="tts-toggle" class="tts-toggle">🔇 Speak: Off</button>
          <button id="leave-btn" class="link-btn">Leave</button>
        </div>
        <div id="caption-text" class="caption-text"></div>
      </div>
    </div>
  `;

  const grid = root.querySelector<HTMLDivElement>("#lang-grid")!;
  for (const lang of LANGUAGES) {
    const btn = document.createElement("button");
    btn.className = "lang-card";
    btn.innerHTML = `<span class="flag">${lang.flag}</span><span>${lang.name}</span>`;
    btn.onclick = () => {
      const code = root.querySelector<HTMLInputElement>("#code-input")!.value.trim();
      connectListener(root, code, lang);
    };
    grid.appendChild(btn);
  }

  const ttsBtn = root.querySelector<HTMLButtonElement>("#tts-toggle")!;
  ttsBtn.onclick = () => {
    const next = !isSpeechEnabled();
    setSpeechEnabled(next);
    ttsBtn.textContent = next ? "🔊 Speak: On" : "🔇 Speak: Off";
    ttsBtn.classList.toggle("on", next);
  };

  root.querySelector<HTMLButtonElement>("#leave-btn")!.onclick = () => {
    socket?.close();
    location.href = location.pathname;
  };
}

function connectListener(root: HTMLElement, code: string, lang: LanguageOption): void {
  if (!code) {
    alert("Enter a room code first.");
    return;
  }
  socket?.close();

  const captionsEl = root.querySelector<HTMLDivElement>("#captions")!;
  const textEl = root.querySelector<HTMLDivElement>("#caption-text")!;
  captionsEl.classList.remove("hidden");
  textEl.textContent = "Connecting…";

  const proto = location.protocol === "https:" ? "wss" : "ws";
  socket = new WebSocket(
    `${proto}://${location.host}/ws/listen?room=${encodeURIComponent(code)}&lang=${lang.code}`,
  );

  const finalParts: string[] = [];

  socket.onopen = () => {
    textEl.textContent = "";
  };

  socket.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.type === "error") {
      textEl.textContent = `⚠️ ${msg.message}`;
      return;
    }
    if (msg.type !== "tokens") return;

    let newFinal = "";
    let nonFinal = "";
    for (const token of msg.tokens as Array<{ text: string; is_final: boolean; translation_status?: string }>) {
      if (token.translation_status !== "translation") continue;
      if (token.is_final) newFinal += token.text;
      else nonFinal += token.text;
    }
    if (newFinal) {
      finalParts.push(newFinal);
      speak(newFinal, lang.bcp47);
    }
    textEl.textContent = finalParts.join("") + nonFinal;
    textEl.scrollTop = textEl.scrollHeight;
  };

  socket.onclose = () => {
    textEl.textContent += "\n[disconnected]";
  };

  socket.onerror = () => {
    textEl.textContent = "⚠️ Connection error.";
  };
}
