import { LANGUAGES, type LanguageOption } from "./languages";
import { isSpeechEnabled, setSpeechEnabled, setSpeechVolume, getSpeechVolume, speak } from "./tts";
import { setStatus, friendlyDisconnectMessage, type ConnState } from "./status";
import { renderFeed } from "./transcript";
import { attachPulseWaveform } from "./waveform";
import { icons } from "./icons";
import { fetchRoomInfo, noAudioDiagnosis, wsUrl, type RoomInfo } from "./rooms-api";
import { getDisplayMode, setDisplayMode, renderModeControl, type DisplayMode } from "./display-mode";

interface TokenMsg {
  type: "tokens";
  tokens: Array<{ text: string; is_final: boolean; translation_status?: string }>;
}

let socket: WebSocket | null = null;
let reconnectTimer: number | undefined;
let reconnectAttempt = 0;

export function initListenView(root: HTMLElement, initialCode: string): void {
  root.classList.remove("wide");
  renderJoinScreen(root, initialCode);
}

function renderJoinScreen(root: HTMLElement, initialCode: string): void {
  root.innerHTML = `
    <div>
      <p class="panel-label">Join live translation</p>
      <h1 class="landing-title">Join a session</h1>
      <div class="field">
        <label class="field-label" for="code-input">Session code</label>
        <input id="code-input" class="field-input" placeholder="e.g. a1b2c3" maxlength="12" value="${initialCode}" autocomplete="off" />
      </div>
      <div id="join-status" class="state-block hidden"></div>
      <div id="lang-section" class="hidden">
        <p class="field-label">Choose your language</p>
        <div id="lang-list" class="lang-list" role="listbox" aria-label="Choose your language"></div>
        <div class="btn-row" style="margin-top: var(--space-5)">
          <button id="start-listening" class="btn btn-primary" disabled>Start listening</button>
        </div>
      </div>
    </div>
  `;

  const codeInput = root.querySelector<HTMLInputElement>("#code-input")!;
  const joinStatus = root.querySelector<HTMLDivElement>("#join-status")!;
  const langSection = root.querySelector<HTMLDivElement>("#lang-section")!;
  const langList = root.querySelector<HTMLDivElement>("#lang-list")!;
  const startBtn = root.querySelector<HTMLButtonElement>("#start-listening")!;

  let selected: LanguageOption | null = null;
  let currentInfo: RoomInfo | null = null;

  for (const lang of LANGUAGES) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "lang-option";
    btn.setAttribute("role", "option");
    btn.setAttribute("aria-pressed", "false");
    btn.innerHTML = `<span>${lang.name}</span><span class="english-name">${lang.englishName}</span>`;
    btn.onclick = () => {
      selected = lang;
      startBtn.disabled = false;
      langList.querySelectorAll(".lang-option").forEach((el) => el.setAttribute("aria-pressed", "false"));
      btn.setAttribute("aria-pressed", "true");
    };
    langList.appendChild(btn);
  }

  async function lookupRoom(code: string) {
    if (!code) {
      langSection.classList.add("hidden");
      joinStatus.classList.add("hidden");
      return;
    }
    joinStatus.classList.remove("hidden");
    joinStatus.innerHTML = `<span class="state-activity">${statusPulse()} Looking up session…</span>`;
    const info = await fetchRoomInfo(code);
    if (!info) {
      currentInfo = null;
      langSection.classList.add("hidden");
      joinStatus.innerHTML = `
        <p class="state-title">Session not found</p>
        <p class="state-message">Check the code and try again.</p>
      `;
      return;
    }
    currentInfo = info;
    joinStatus.innerHTML = `
      <p class="session-name">${escapeHtml(info.name)}</p>
      <div style="margin-top: var(--space-2)">${info.live ? liveBadge() : offlineBadge()}</div>
    `;
    langSection.classList.remove("hidden");
  }

  function statusPulse() {
    return '<span class="status-dot"></span>';
  }
  function liveBadge() {
    return '<span class="status status-live"><span class="status-dot"></span>Live</span>';
  }
  function offlineBadge() {
    return '<span class="status status-offline"><span class="status-dot"></span>Waiting for speaker</span>';
  }

  let debounce: number | undefined;
  codeInput.addEventListener("input", () => {
    window.clearTimeout(debounce);
    debounce = window.setTimeout(() => lookupRoom(codeInput.value.trim()), 350);
  });

  startBtn.onclick = () => {
    if (!selected || !currentInfo) return;
    renderLiveScreen(root, currentInfo, selected);
  };

  if (initialCode) lookupRoom(initialCode);
}

function escapeHtml(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function renderLiveScreen(root: HTMLElement, room: RoomInfo, lang: LanguageOption): void {
  const sourceName = room.sourceLanguage
    ? LANGUAGES.find((l) => l.code === room.sourceLanguage)?.englishName ?? room.sourceLanguage
    : "Speaker";

  root.innerHTML = `
    <div>
      <div class="shell-header" style="border:none; padding:0; margin-bottom: var(--space-4)">
        <div id="live-status"></div>
        <button id="leave-btn" class="btn btn-ghost">Leave</button>
      </div>
      <p class="session-name">${escapeHtml(room.name)}</p>
      <p class="language-pair"><strong>${sourceName}</strong> → <strong>${lang.englishName}</strong></p>

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
    location.href = location.pathname;
  };

  // Full screen uses the native Fullscreen API directly on a panel, so the
  // source or translation panel can be projected without leaving this view.
  root.querySelectorAll<HTMLButtonElement>(".fullscreen-btn").forEach((btn) => {
    btn.onclick = () => {
      const panel = root.querySelector<HTMLElement>(`#${btn.dataset.target}`)!;
      if (document.fullscreenElement === panel) document.exitFullscreen();
      else panel.requestFullscreen();
    };
  });
  document.addEventListener("fullscreenchange", () => {
    root.querySelectorAll<HTMLButtonElement>(".fullscreen-btn").forEach((btn) => {
      const panel = root.querySelector<HTMLElement>(`#${btn.dataset.target}`);
      const active = !!panel && document.fullscreenElement === panel;
      btn.innerHTML = active ? icons.close : icons.expand;
    });
  });

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
        '<p class="state-message">No separate source text — this session\'s spoken language matches your translation language.</p>';
    }
  }

  function cleanup() {
    window.clearTimeout(reconnectTimer);
    window.clearTimeout(noAudioTimer);
    pulse.stop();
    socket?.close();
    socket = null;
  }

  function connect() {
    setStatus(statusEl, "connecting");
    socket = new WebSocket(wsUrl(`/ws/listen?room=${encodeURIComponent(room.code)}&lang=${lang.code}`));

    socket.onopen = () => {
      reconnectAttempt = 0;
      setStatus(statusEl, "live");
      window.clearTimeout(noAudioTimer);
      noAudioTimer = window.setTimeout(async () => {
        if (hasContent) return;
        emptyState.querySelector(".state-message")!.textContent = await noAudioDiagnosis(room.code);
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
