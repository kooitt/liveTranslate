import { LANGUAGES } from "./languages";
import { setStatus } from "./status";
import { renderFeed } from "./transcript";
import { attachMicWaveform } from "./waveform";
import { icons } from "./icons";
import { startHostSession, stopHostSession, listRooms, wsUrl, type HostSessionInfo, type PublicRoom } from "./rooms-api";
import { wireFullscreenButtons } from "./fullscreen";
import { escapeHtml } from "./html";

let audioCtx: AudioContext | null = null;
let micStream: MediaStream | null = null;
let workletNode: AudioWorkletNode | null = null;
let micSocket: WebSocket | null = null;
let previewSocket: WebSocket | null = null;
let paused = false;
let stopWaveform: (() => void) | null = null;
let micReconnectTimer: number | undefined;
let micReconnectAttempt = 0;
let hostVisibilityHandler: (() => void) | null = null;

export function initHostView(root: HTMLElement): void {
  root.classList.remove("wide");
  renderSetup(root);
}

async function renderSetup(root: HTMLElement): Promise<void> {
  const langOptions = LANGUAGES.map((l) => `<option value="${l.code}">${l.englishName}</option>`).join("");
  const rooms = await listRooms();
  const previewOptions = rooms.length
    ? rooms.map((r) => `<option value="${r.slug}">${escapeHtml(r.name)}</option>`).join("")
    : '<option value="" disabled>No rooms configured yet</option>';

  root.innerHTML = `
    <div>
      <p class="panel-label">Operator console</p>
      <h1 class="landing-title">Start a live session</h1>
      <p class="landing-tagline">Set up the session, then start speaking. Your speech is translated into every room configured in the <a href="/admin">admin dashboard</a>.</p>

      <form id="setup-form" class="setup-form">
        <div class="field">
          <label class="field-label" for="session-name">Session name</label>
          <input id="session-name" class="field-input" value="Sunday Service" required />
        </div>
        <div class="field">
          <label class="field-label" for="source-language">Speaker language</label>
          <select id="source-language" class="field-select">
            <option value="">Auto-detect</option>
            ${langOptions}
          </select>
        </div>
        <div class="field">
          <label class="field-label" for="preview-room">Preview room</label>
          <select id="preview-room" class="field-select">
            ${previewOptions}
          </select>
        </div>

        <div class="field">
          <div class="audio-control">
            <button type="button" id="test-audio" class="btn btn-secondary">Test audio</button>
            <canvas id="test-waveform" class="waveform hidden" width="160" height="28" aria-hidden="true"></canvas>
          </div>
        </div>

        <p id="setup-error" class="state-message hidden" style="color:var(--color-error)"></p>

        <div class="btn-row">
          <button type="submit" class="btn btn-primary">Start session</button>
        </div>
      </form>
    </div>
  `;

  const testBtn = root.querySelector<HTMLButtonElement>("#test-audio")!;
  const testCanvas = root.querySelector<HTMLCanvasElement>("#test-waveform")!;

  testBtn.onclick = async () => {
    testBtn.disabled = true;
    testBtn.textContent = "Testing…";
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const ctx = new AudioContext();
      await ctx.resume();
      const analyser = ctx.createAnalyser();
      ctx.createMediaStreamSource(stream).connect(analyser);
      testCanvas.classList.remove("hidden");
      const stop = attachMicWaveform(testCanvas, analyser);
      setTimeout(() => {
        stop();
        ctx.close();
        stream.getTracks().forEach((t) => t.stop());
        testCanvas.classList.add("hidden");
        testBtn.disabled = false;
        testBtn.textContent = "Test audio";
      }, 3000);
    } catch {
      testBtn.disabled = false;
      testBtn.textContent = "Microphone unavailable";
    }
  };

  const errorEl = root.querySelector<HTMLParagraphElement>("#setup-error")!;
  const submitBtn = root.querySelector<HTMLButtonElement>("#setup-form button[type=submit]")!;
  root.querySelector<HTMLFormElement>("#setup-form")!.onsubmit = async (e) => {
    e.preventDefault();
    errorEl.classList.add("hidden");
    const name = (root.querySelector<HTMLInputElement>("#session-name")!).value;
    const sourceLanguage = (root.querySelector<HTMLSelectElement>("#source-language")!).value;
    const previewSlug = (root.querySelector<HTMLSelectElement>("#preview-room")!).value;

    // ponytail: acquire mic + resume the AudioContext here, synchronously
    // within the click's user-activation window — a slow server round
    // trip (e.g. a cold-starting free host) can otherwise outlast that
    // window, leaving the context stuck "suspended" with no error.
    submitBtn.disabled = true;
    submitBtn.textContent = "Starting…";
    let stream: MediaStream;
    let audioContext: AudioContext;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioContext = new AudioContext({ sampleRate: 16000 });
      await audioContext.resume();
    } catch {
      submitBtn.disabled = false;
      submitBtn.textContent = "Start session";
      alert("Microphone access is required to host a session.");
      return;
    }

    try {
      const session = await startHostSession(name, sourceLanguage);
      renderConsole(root, session, previewSlug, rooms, audioContext, stream);
    } catch (err) {
      submitBtn.disabled = false;
      submitBtn.textContent = "Start session";
      errorEl.textContent = err instanceof Error ? err.message : "Could not start session";
      errorEl.classList.remove("hidden");
      stream.getTracks().forEach((t) => t.stop());
      audioContext.close();
    }
  };
}

function renderConsole(
  root: HTMLElement,
  session: HostSessionInfo,
  initialPreviewSlug: string,
  rooms: PublicRoom[],
  audioContext: AudioContext,
  stream: MediaStream,
): void {
  root.classList.add("wide");
  const previewRoom = rooms.find((r) => r.slug === initialPreviewSlug) ?? rooms[0] ?? null;

  const shareRows = rooms
    .map((r) => {
      const link = `${location.origin}/room/${r.slug}`;
      const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=96x96&data=${encodeURIComponent(link)}`;
      const lang = LANGUAGES.find((l) => l.code === r.targetLanguage)?.englishName ?? r.targetLanguage;
      return `
        <div class="join-row" style="margin-bottom: var(--space-3)">
          <img class="qr-image" src="${qrSrc}" alt="QR code for the ${escapeHtml(r.name)} room" width="96" height="96" />
          <div style="flex:1; min-width:0">
            <p style="margin:0 0 var(--space-1); font-weight:600">${escapeHtml(r.name)} <span style="color:var(--color-muted); font-weight:400">(${escapeHtml(lang)})</span></p>
            <div class="join-link" data-link="${link}">${link}</div>
          </div>
          <button type="button" class="btn btn-secondary copy-room-link" data-link="${link}">Copy</button>
        </div>`;
    })
    .join("");

  root.innerHTML = `
    <div>
      <div class="shell-header" style="border:none; padding:0; margin-bottom: var(--space-4)">
        <div>
          <p class="session-name">${escapeHtml(session.name)}</p>
          <div id="console-status" style="margin-top: var(--space-1)"></div>
        </div>
        <button id="settings-btn" class="icon-btn" aria-label="Settings">${icons.settings}</button>
      </div>

      <div id="settings-panel" class="settings-panel hidden">
        <div class="settings-row">
          <span>Preview room</span>
          <select id="preview-room-live" class="field-select" style="max-width:200px">
            ${rooms.map((r) => `<option value="${r.slug}" ${r.slug === previewRoom?.slug ? "selected" : ""}>${escapeHtml(r.name)}</option>`).join("") || '<option value="">No rooms</option>'}
          </select>
        </div>
      </div>

      <div class="join-panel">
        <p class="panel-label">Share with listeners</p>
        ${rooms.length ? shareRows : '<p class="state-message">No rooms configured yet — add one in the <a href="/admin">admin dashboard</a> so listeners have somewhere to join.</p>'}
      </div>

      <hr class="divider" />

      <div class="console-grid">
        <div class="console-panel" id="transcript-panel">
          <div class="panel-label-row">
            <p class="panel-label">Live transcript</p>
            <button type="button" class="icon-btn fullscreen-btn" data-target="transcript-panel" aria-label="View live transcript full screen">${icons.expand}</button>
          </div>
          <div id="transcript-lines" class="transcript-lines" style="min-height:120px">
            <p class="state-message">Waiting for speech…</p>
          </div>
        </div>
        <div class="console-panel" id="translation-panel">
          <div class="panel-label-row">
            <p class="panel-label" id="translation-panel-label">Translation ${previewRoom ? `(${escapeHtml(previewRoom.name)})` : ""}</p>
            <button type="button" class="icon-btn fullscreen-btn" data-target="translation-panel" aria-label="View translation full screen">${icons.expand}</button>
          </div>
          <div id="translation-lines" class="transcript-lines translation-lines" style="min-height:120px">
            <p class="state-message">Waiting for speech…</p>
          </div>
        </div>
      </div>

      <hr class="divider" />

      <div class="audio-control">
        <canvas id="mic-waveform" class="waveform" width="160" height="28" aria-hidden="true"></canvas>
      </div>

      <div class="btn-row" style="margin-top: var(--space-5)">
        <button id="pause-btn" class="btn btn-secondary">Pause</button>
        <button id="stop-btn" class="btn btn-danger">Stop session</button>
      </div>
    </div>
  `;

  const statusEl = root.querySelector<HTMLDivElement>("#console-status")!;
  setStatus(statusEl, "connecting");

  root.querySelector<HTMLButtonElement>("#settings-btn")!.onclick = () => {
    root.querySelector("#settings-panel")!.classList.toggle("hidden");
  };
  root.querySelectorAll<HTMLButtonElement>(".copy-room-link").forEach((btn) => {
    btn.onclick = () => navigator.clipboard.writeText(btn.dataset.link!);
  });

  // Full screen projects the transcript or translation panel without ever
  // leaving this console (native Fullscreen API, or a CSS fallback where
  // that's unsupported — see fullscreen.ts).
  wireFullscreenButtons(root);

  connectMic(session, statusEl, root.querySelector<HTMLCanvasElement>("#mic-waveform")!, audioContext, stream);
  if (previewRoom) connectPreview(previewRoom.slug, root);

  root.querySelector<HTMLSelectElement>("#preview-room-live")!.onchange = (e) => {
    const slug = (e.target as HTMLSelectElement).value;
    previewSocket?.close();
    const room = rooms.find((r) => r.slug === slug);
    root.querySelector("#translation-panel-label")!.textContent = `Translation ${room ? `(${room.name})` : ""}`;
    if (room) connectPreview(room.slug, root);
  };

  const pauseBtn = root.querySelector<HTMLButtonElement>("#pause-btn")!;
  pauseBtn.onclick = () => {
    paused = !paused;
    pauseBtn.textContent = paused ? "Resume" : "Pause";
    setStatus(statusEl, paused ? "connecting" : "live", paused ? "Paused" : undefined);
  };

  root.querySelector<HTMLButtonElement>("#stop-btn")!.onclick = async () => {
    stopHosting();
    await stopHostSession(session.id);
    location.reload();
  };
}

async function connectMic(
  session: HostSessionInfo,
  statusEl: HTMLElement,
  waveformCanvas: HTMLCanvasElement,
  audioContext: AudioContext,
  stream: MediaStream,
): Promise<void> {
  audioCtx = audioContext;
  micStream = stream;

  // Build the capture graph once, independent of the WebSocket. Audio
  // keeps flowing locally even while the socket reconnects below — the
  // worklet's message handler reads the module-level `micSocket` on every
  // callback, so sending resumes automatically the moment a new socket is
  // OPEN.
  const source = audioCtx.createMediaStreamSource(stream);
  const analyser = audioCtx.createAnalyser();
  source.connect(analyser);
  stopWaveform = attachMicWaveform(waveformCanvas, analyser);

  try {
    await audioCtx.audioWorklet.addModule(new URL("./pcm-worklet.js", import.meta.url));
  } catch {
    setStatus(statusEl, "error", "Audio processing unavailable in this browser — try Chrome or Edge");
    return;
  }
  workletNode = new AudioWorkletNode(audioCtx, "pcm-processor");
  const mute = audioCtx.createGain();
  mute.gain.value = 0; // keep the graph live without echoing audio to speakers

  workletNode.port.onmessage = (event: MessageEvent<ArrayBuffer>) => {
    if (paused || micSocket?.readyState !== WebSocket.OPEN) return;
    micSocket.send(event.data);
  };

  source.connect(workletNode);
  workletNode.connect(mute);
  mute.connect(audioCtx.destination);

  // ponytail: mobile browsers throttle or fully freeze setTimeout while a
  // tab is hidden (e.g. the host's phone/tablet screen locks), so a dead
  // socket's scheduled backoff retry can sit stalled far longer than its
  // own delay. Force an immediate reconnect the moment the tab is visible
  // again instead of trusting that stale timer to ever fire promptly.
  hostVisibilityHandler = () => handleHostVisible(session, statusEl);
  document.addEventListener("visibilitychange", hostVisibilityHandler);

  openMicSocket(session, statusEl);
}

function handleHostVisible(session: HostSessionInfo, statusEl: HTMLElement): void {
  if (document.visibilityState !== "visible" || !audioCtx) return;
  if (micSocket && (micSocket.readyState === WebSocket.OPEN || micSocket.readyState === WebSocket.CONNECTING)) return;
  window.clearTimeout(micReconnectTimer);
  micReconnectAttempt = 0;
  openMicSocket(session, statusEl);
}

function openMicSocket(session: HostSessionInfo, statusEl: HTMLElement): void {
  // ponytail: AudioContext({sampleRate:16000}) is only a request — Safari/
  // iOS and some Android browsers ignore it and keep the hardware's native
  // rate (44100/48000). Tell the server the *actual* rate rather than
  // assuming it, or Soniox gets audio at the wrong speed/pitch and never
  // detects any speech, with no audio bytes ever missing and no error.
  micSocket = new WebSocket(wsUrl(`/ws/host?session=${session.id}&sampleRate=${Math.round(audioCtx!.sampleRate)}`));

  micSocket.onopen = async () => {
    window.clearTimeout(micReconnectTimer);
    micReconnectAttempt = 0;
    // ponytail: re-resume defensively — some browsers re-suspend a context
    // that's been idle since it was created, even mid-session.
    await audioCtx!.resume();
    if (audioCtx!.state !== "running") {
      setStatus(statusEl, "error", "Audio blocked — reload and try Start session again");
      return;
    }
    setStatus(statusEl, "live");
  };

  micSocket.onclose = () => {
    // audioCtx is nulled by stopHosting() before it closes this socket —
    // that's how we tell an intentional stop apart from a dropped
    // connection worth retrying. Without this, a single transient drop
    // (flaky network, host restart) silently killed translation for the
    // rest of the session with no way back short of a full page reload.
    if (!audioCtx) return;
    setStatus(statusEl, "connecting", "Reconnecting");
    micReconnectAttempt += 1;
    micReconnectTimer = window.setTimeout(
      () => openMicSocket(session, statusEl),
      Math.min(1000 * 2 ** micReconnectAttempt, 10_000),
    );
  };
  micSocket.onerror = () => setStatus(statusEl, "error");
}

function connectPreview(roomSlug: string, root: HTMLElement): void {
  const transcriptEl = root.querySelector<HTMLDivElement>("#transcript-lines")!;
  const translationEl = root.querySelector<HTMLDivElement>("#translation-lines")!;
  let sourceText = "";
  let translationText = "";

  previewSocket = new WebSocket(wsUrl(`/ws/listen?slug=${encodeURIComponent(roomSlug)}`));
  previewSocket.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.type !== "tokens") return;
    let srcFinal = "";
    let srcPending = "";
    let trFinal = "";
    let trPending = "";
    for (const token of msg.tokens as Array<{ text: string; is_final: boolean; translation_status?: string }>) {
      // ponytail: "none" is still real spoken text, just not translated —
      // mirror it into both panels so translation doesn't stay empty
      // forever in a same-language session. See listen.ts.
      if (token.translation_status === "original" || token.translation_status === "none") {
        token.is_final ? (srcFinal += token.text) : (srcPending += token.text);
      }
      if (token.translation_status === "translation" || token.translation_status === "none") {
        token.is_final ? (trFinal += token.text) : (trPending += token.text);
      }
    }
    sourceText += srcFinal;
    translationText += trFinal;
    renderFeed(transcriptEl, sourceText, srcPending);
    renderFeed(translationEl, translationText, trPending);
  };
}

function stopHosting(): void {
  window.clearTimeout(micReconnectTimer);
  if (hostVisibilityHandler) document.removeEventListener("visibilitychange", hostVisibilityHandler);
  hostVisibilityHandler = null;
  workletNode?.disconnect();
  workletNode = null;
  stopWaveform?.();
  stopWaveform = null;
  audioCtx?.close();
  audioCtx = null;
  micStream?.getTracks().forEach((t) => t.stop());
  micStream = null;
  micSocket?.close();
  micSocket = null;
  previewSocket?.close();
  previewSocket = null;
}
