import { LANGUAGES } from "./languages";
import { setStatus } from "./status";
import { renderFeed } from "./transcript";
import { fetchRoomInfo, noAudioDiagnosis, wsUrl } from "./rooms-api";
import { isDisplayMode, type DisplayMode } from "./display-mode";

/**
 * Large-screen mode for projectors/TVs: no chrome, no controls, high
 * contrast. The mode (source/translation/both) is set once by whoever
 * shares the link — see host.ts — not by an on-screen control, since this
 * screen is shared by everyone looking at it.
 */
export async function initDisplayView(root: HTMLElement, code: string, langCode: string, modeParam: string | null): Promise<void> {
  const mode: DisplayMode = isDisplayMode(modeParam) ? modeParam : "both";
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
        <p id="display-waiting" class="display-translation">Waiting for speech…</p>
        <div id="display-source" class="display-source hidden"></div>
        <div id="display-translation" class="display-translation hidden"></div>
      </div>
    </div>
  `;

  const statusEl = root.querySelector<HTMLDivElement>("#display-status")!;
  const waitingEl = root.querySelector<HTMLParagraphElement>("#display-waiting")!;
  const sourceEl = root.querySelector<HTMLDivElement>("#display-source")!;
  const translationEl = root.querySelector<HTMLDivElement>("#display-translation")!;

  setStatus(statusEl, "connecting");
  const socket = new WebSocket(wsUrl(`/ws/listen?room=${code}&lang=${lang.code}`));

  let sourceText = "";
  let translationText = "";
  let hasContent = false;
  const noAudioTimer = window.setTimeout(async () => {
    if (hasContent) return;
    waitingEl.textContent = await noAudioDiagnosis(code);
  }, 10_000);

  socket.onopen = () => setStatus(statusEl, "live");
  socket.onclose = () => setStatus(statusEl, "connecting", "Reconnecting");
  socket.onerror = () => setStatus(statusEl, "error");

  socket.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.type === "error") {
      setStatus(statusEl, "error");
      window.clearTimeout(noAudioTimer); // don't let the generic diagnosis overwrite a specific error
      waitingEl.classList.remove("hidden");
      sourceEl.classList.add("hidden");
      translationEl.classList.add("hidden");
      waitingEl.textContent = msg.message ?? "Translation temporarily unavailable.";
      return;
    }
    if (msg.type !== "tokens") return;

    let src = "";
    let tr = "";
    for (const token of msg.tokens as Array<{ text: string; is_final: boolean; translation_status?: string }>) {
      if (!token.is_final) continue; // display mode only shows settled text, no flickering partials
      // ponytail: "none" means "not translated" (most commonly: the source
      // already matches the target language). It's the single clean
      // output text, NOT a duplicate of the source — putting it in both
      // panels showed the same sentence twice. Only genuine "original"
      // tokens (which only occur alongside a real "translation") go in
      // the source lane; the source panel stays hidden otherwise.
      if (token.translation_status === "original") src += token.text;
      if (token.translation_status === "translation" || token.translation_status === "none") tr += token.text;
    }

    if (src || tr) {
      if (!hasContent) {
        hasContent = true;
        window.clearTimeout(noAudioTimer);
        waitingEl.classList.add("hidden");
        if (mode !== "source") translationEl.classList.remove("hidden");
      }
      sourceText += src;
      translationText += tr;
      // In "both" mode, only show the source panel when it's genuinely
      // different content (no duplicate text). In "source" mode it's
      // always shown, with a note if there's nothing distinct to show.
      if (mode !== "translation" && (mode === "source" || sourceText)) {
        sourceEl.classList.remove("hidden");
        renderFeed(sourceEl, sourceText, "");
        if (mode === "source" && !sourceText) {
          sourceEl.textContent = "No separate source text — this session's spoken language matches the display language.";
        }
      }
      if (mode !== "source") renderFeed(translationEl, translationText, "");
    }
  };
}
