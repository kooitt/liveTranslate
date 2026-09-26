import { LANGUAGES } from "./languages";
import { setStatus } from "./status";
import { fetchRoomInfo, noAudioDiagnosis, wsUrl } from "./rooms-api";

/** Large-screen mode for projectors/TVs: no chrome, no controls, high contrast. */
export async function initDisplayView(root: HTMLElement, code: string, langCode: string): Promise<void> {
  document.documentElement.dataset.theme = "dark"; // projectors read best on dark, high-contrast

  const lang = LANGUAGES.find((l) => l.code === langCode) ?? LANGUAGES[0];
  const room = await fetchRoomInfo(code);

  if (!room) {
    root.innerHTML = `
      <div class="display-shell">
        <div class="display-body">
          <p class="state-title" style="text-align:center">Session not found</p>
        </div>
      </div>
    `;
    return;
  }

  const sourceName = room.sourceLanguage
    ? LANGUAGES.find((l) => l.code === room.sourceLanguage)?.englishName ?? room.sourceLanguage
    : "Speaker";

  root.innerHTML = `
    <div class="display-shell">
      <div class="display-header">
        <div id="display-status"></div>
        <span class="language-pair"><strong>${sourceName}</strong> → <strong>${lang.englishName}</strong></span>
      </div>
      <div class="display-body">
        <p id="display-source" class="display-source"></p>
        <p id="display-translation" class="display-translation">Waiting for speech…</p>
      </div>
    </div>
  `;

  const statusEl = root.querySelector<HTMLDivElement>("#display-status")!;
  const sourceEl = root.querySelector<HTMLParagraphElement>("#display-source")!;
  const translationEl = root.querySelector<HTMLParagraphElement>("#display-translation")!;

  setStatus(statusEl, "connecting");
  const socket = new WebSocket(wsUrl(`/ws/listen?room=${code}&lang=${lang.code}`));

  let hasContent = false;
  const noAudioTimer = window.setTimeout(async () => {
    if (hasContent) return;
    translationEl.textContent = await noAudioDiagnosis(code);
  }, 10_000);

  socket.onopen = () => setStatus(statusEl, "live");
  socket.onclose = () => setStatus(statusEl, "connecting", "Reconnecting");
  socket.onerror = () => setStatus(statusEl, "error");

  socket.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.type === "error") {
      setStatus(statusEl, "error");
      window.clearTimeout(noAudioTimer); // don't let the generic diagnosis overwrite a specific error
      translationEl.textContent = msg.message ?? "Translation temporarily unavailable.";
      return;
    }
    if (msg.type !== "tokens") return;
    let src = "";
    let tr = "";
    for (const token of msg.tokens as Array<{ text: string; translation_status?: string }>) {
      if (token.translation_status === "original") src += token.text;
      else if (token.translation_status === "translation") tr += token.text;
    }
    if (src) {
      sourceEl.textContent = src;
      hasContent = true;
      window.clearTimeout(noAudioTimer);
    }
    if (tr) {
      hasContent = true;
      window.clearTimeout(noAudioTimer);
      translationEl.textContent = tr;
    }
  };
}
