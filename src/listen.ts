import { findLanguage } from "./languages";
import { isSpeechEnabled, setSpeechEnabled, setSpeechVolume, getSpeechVolume, speak } from "./tts";
import { setStatus, friendlyDisconnectMessage, type ConnState } from "./status";
import { renderFeed } from "./transcript";
import { attachPulseWaveform } from "./waveform";
import { icons } from "./icons";
import { fetchRoomInfo, noAudioDiagnosis, wsUrl, type RoomInfo } from "./rooms-api";
import { getDisplayMode, setDisplayMode, renderModeControl, type DisplayMode } from "./display-mode";
import { wireFullscreenButtons } from "./fullscreen";
import { escapeHtml } from "./html";

interface TokenMsg {
  type: "tokens";
  tokens: Array<{ text: string; is_final: boolean; translation_status?: string }>;
}

let socket: WebSocket | null = null;
let reconnectTimer: number | undefined;
let reconnectAttempt = 0;

/** Each room now has one permanent URL (`/room/<slug>`) and one fixed
 * target language — there's nothing left for a listener to pick, so this
 * goes straight from "look up the room" to the live screen. */
export async function initListenView(root: HTMLElement, slug: string): Promise<void> {
  root.classList.remove("wide");

  if (!slug) {
    renderNotFound(root, "No room specified. Use the link or QR code your organizer shared.");
    return;
  }

  root.innerHTML = `
    <div class="state-block">
      <p class="state-activity"><span class="status-dot"></span>Looking up room…</p>
    </div>
  `;

  const room = await fetchRoomInfo(slug);
  if (!room) {
    renderNotFound(root, "Room not found. Check the link and try again.");
    return;
  }

  renderLiveScreen(root, room);
}

function renderNotFound(root: HTMLElement, message: string): void {
  root.innerHTML = `
    <div class="state-block">
      <p class="state-title">Room not found</p>
      <p class="state-message">${escapeHtml(message)}</p>
    </div>
  `;
}

function renderLiveScreen(root: HTMLElement, room: RoomInfo): void {
  const lang = findLanguage(room.targetLanguage) ?? {
    code: room.targetLanguage,
    name: room.targetLanguage,
    englishName: room.targetLanguage,
    bcp47: "en-US",
  };
  const sourceName = room.sourceLanguage
    ? findLanguage(room.sourceLanguage)?.englishName ?? room.sourceLanguage
    : "Speaker";

  root.innerHTML = `
    <div>
      <div class="shell-header" style="border:none; padding:0; margin-bottom: var(--space-4)">
        <div id="live-status"></div>
        <button id="leave-btn" class="btn btn-ghost">Leave</button>
      </div>
      <p class="session-name">${escapeHtml(room.name)}</p>
      <p class="language-pair"><strong>${escapeHtml(sourceName)}</strong> → <strong>${escapeHtml(lang.englishName)}</strong></p>

      <hr class="divider" />

      <div class="btn-row" style="justify-content: space-between; align-items: center">
        <p class="panel-label" style="margin:0">Show</p>
        <div id="mode-control" class="segmented"></div>
      </div>

      <div id="empty-state" class="state-block">
        <p class="state-activity"><span class="status-dot"></span>Waiting for speech…</p>
        <p class="state-message">Translation will appear here automatically once the speaker begins.</p>
      </div>

      <div id="content" class="hidden">
        <div id="source-panel" class="panel-source console-panel hidden">
          <div class="panel-label-row">
            <p class="panel-label">Source</p>
            <button type="button" class="icon-btn fullscreen-btn" data-target="source-panel" aria-label="View source full screen">${icons.expand}</button>
          </div>
          <div id="source-lines" class="transcript-lines"></div>
        </div>
        <div id="translation-panel" class="console-panel">
          <div class="panel-label-row">
            <p class="panel-label">Translation</p>
            <button type="button" class="icon-btn fullscreen-btn" data-target="translation-panel" aria-label="View translation full screen">${icons.expand}</button>
          </div>
          <div id="translation-lines" class="transcript-lines translation-lines"></div>
        </div>
      </div>

      <hr class="divider" />

      <div class="audio-control">
        <button id="speak-toggle" class="icon-btn" aria-pressed="false" aria-label="Turn on spoken translation">${icons.mute}</button>
        <div class="volume-row">
          <span class="volume-label">Volume</span>
          <input id="volume" type="range" min="0" max="100" value="${Math.round(getSpeechVolume() * 100)}" aria-label="Speech volume" />
        </div>
        <canvas id="waveform" class="waveform" width="160" height="28" aria-hidden="true"></canvas>
      </div>
    </div>
  `;

  const statusEl = root.querySelector<HTMLDivElement>("#live-status")!;
  const emptyState = root.querySelector<HTMLDivElement>("#empty-state")!;
  const content = root.querySelector<HTMLDivElement>("#content")!;
  const sourcePanel = root.querySelector<HTMLDivElement>("#source-panel")!;
  const translationPanel = root.querySelector<HTMLDivElement>("#translation-panel")!;
  const sourceLinesEl = root.querySelector<HTMLDivElement>("#source-lines")!;
  const translationLinesEl = root.querySelector<HTMLDivElement>("#translation-lines")!;

  let displayMode: DisplayMode = getDisplayMode();
  renderModeControl(root.querySelector<HTMLDivElement>("#mode-control")!, displayMode, (mode) => {
    displayMode = mode;
    setDisplayMode(mode);
    applyDisplayMode();
  });
  const speakToggle = root.querySelector<HTMLButtonElement>("#speak-toggle")!;
  const volumeSlider = root.querySelector<HTMLInputElement>("#volume")!;
  const waveformCanvas = root.querySelector<HTMLCanvasElement>("#waveform")!;

  const pulse = attachPulseWaveform(waveformCanvas);

  speakToggle.onclick = () => {
    const next = !isSpeechEnabled();
    setSpeechEnabled(next);
    speakToggle.innerHTML = next ? icons.volume : icons.mute;
    speakToggle.setAttribute("aria-pressed", String(next));
    speakToggle.setAttribute("aria-label", next ? "Turn off spoken translation" : "Turn on spoken translation");
  };

  volumeSlider.oninput = () => {
    setSpeechVolume(Number(volumeSlider.value) / 100);
  };

  root.querySelector<HTMLButtonElement>("#leave-btn")!.onclick = () => {
    cleanup();
    location.href = "/";
  };

  // Full screen projects the source or translation panel without leaving
  // this view (native Fullscreen API, or a CSS fallback where that's
  // unsupported — see fullscreen.ts).
  wireFullscreenButtons(root);

  let sourceText = "";
  let translationText = "";
  let sourcePending = "";
  let translationPending = "";
  let hasContent = false;
  let noAudioTimer: number | undefined;

  function applyDisplayMode(): void {
    translationPanel.classList.toggle("hidden", displayMode === "source");
    if (displayMode === "translation") {
      sourcePanel.classList.add("hidden");
      return;
    }
    const hasSource = Boolean(sourceText || sourcePending);
    sourcePanel.classList.toggle("hidden", !hasSource && displayMode === "both");
    if (displayMode === "source" && !hasSource) {
      sourceLinesEl.innerHTML =
        '<p class="state-message">No separate source text — this room\'s spoken language matches your translation language.</p>';
    }
  }

  // ponytail: mobile browsers throttle or fully freeze setTimeout while a
  // tab is hidden (e.g. the phone's screen locks), so a dead socket's
  // scheduled backoff retry can sit stalled far longer than its own delay
  // — the page just sits on "Reconnecting…" until manually refreshed.
  // Force an immediate reconnect the moment the tab is visible again
  // instead of trusting that stale timer to ever fire promptly.
  function handleVisible() {
    if (document.visibilityState !== "visible") return;
    if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) return;
    window.clearTimeout(reconnectTimer);
    reconnectAttempt = 0;
    connect();
  }
  document.addEventListener("visibilitychange", handleVisible);

  function cleanup() {
    document.removeEventListener("visibilitychange", handleVisible);
    window.clearTimeout(reconnectTimer);
    window.clearTimeout(noAudioTimer);
    pulse.stop();
    socket?.close();
    socket = null;
  }

  function connect() {
    setStatus(statusEl, "connecting");
    socket = new WebSocket(wsUrl(`/ws/listen?slug=${encodeURIComponent(room.slug)}`));

    socket.onopen = () => {
      reconnectAttempt = 0;
      setStatus(statusEl, "live");
      window.clearTimeout(noAudioTimer);
      noAudioTimer = window.setTimeout(async () => {
        if (hasContent) return;
        emptyState.querySelector(".state-message")!.textContent = await noAudioDiagnosis(room.slug);
      }, 10_000);
    };

    socket.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.type === "error") {
        setStatus(statusEl, "error");
        window.clearTimeout(noAudioTimer); // don't let the generic diagnosis overwrite a specific error
        emptyState.querySelector(".state-message")!.textContent = msg.message ?? "Translation unavailable.";
        return;
      }
      if (msg.type !== "tokens") return;
      const tokenMsg = msg as TokenMsg;

      let newSourceFinal = "";
      let sourceNonFinal = "";
      let newTranslationFinal = "";
      let translationNonFinal = "";

      for (const token of tokenMsg.tokens) {
        // ponytail: "translation_status" is "original" | "translation" | "none".
        // "none" means "not translated" (most commonly: the detected
        // source already matches the target language) — it's the single
        // clean output text, not a duplicate of the source. Only genuine
        // "original" tokens (which only occur alongside a real
        // "translation") go in the source lane, or same-language sessions
        // showed the same sentence twice.
        if (token.translation_status === "original") {
          if (token.is_final) newSourceFinal += token.text;
          else sourceNonFinal += token.text;
        }
        if (token.translation_status === "translation" || token.translation_status === "none") {
          if (token.is_final) newTranslationFinal += token.text;
          else translationNonFinal += token.text;
        }
      }

      if (newSourceFinal || newTranslationFinal || sourceNonFinal || translationNonFinal) {
        if (!hasContent) {
          hasContent = true;
          window.clearTimeout(noAudioTimer);
          emptyState.classList.add("hidden");
          content.classList.remove("hidden");
        }
        pulse.pulse();
      }

      sourceText += newSourceFinal;
      if (newTranslationFinal) {
        translationText += newTranslationFinal;
        speak(newTranslationFinal, lang.bcp47);
      }
      sourcePending = sourceNonFinal;
      translationPending = translationNonFinal;

      renderFeed(sourceLinesEl, sourceText, sourcePending);
      renderFeed(translationLinesEl, translationText, translationPending);
      applyDisplayMode();
    };

    socket.onclose = () => {
      if (!hasContent) {
        setStatus(statusEl, "offline");
      } else {
        setStatus(statusEl, "connecting", "Reconnecting");
        emptyState.classList.remove("hidden");
        content.classList.add("hidden");
        emptyState.querySelector(".state-message")!.textContent = friendlyDisconnectMessage(true);
      }
      reconnectAttempt += 1;
      reconnectTimer = window.setTimeout(connect, Math.min(1000 * 2 ** reconnectAttempt, 10_000));
    };

    socket.onerror = () => {
      setStatus(statusEl, "error");
    };
  }

  connect();
}
