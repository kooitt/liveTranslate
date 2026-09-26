import { LANGUAGES } from "./languages";
import { setStatus } from "./status";
import { renderFeed } from "./transcript";
import { attachMicWaveform } from "./waveform";
import { icons } from "./icons";
import { createRoom, wsUrl, type RoomInfo } from "./rooms-api";

let audioCtx: AudioContext | null = null;
let micStream: MediaStream | null = null;
let processorNode: ScriptProcessorNode | null = null;
let micSocket: WebSocket | null = null;
let previewSocket: WebSocket | null = null;
let paused = false;
let stopWaveform: (() => void) | null = null;

export function initHostView(root: HTMLElement): void {
  root.classList.remove("wide");
  renderSetup(root);
}

function renderSetup(root: HTMLElement): void {
  const langOptions = LANGUAGES.map((l) => `<option value="${l.code}">${l.englishName}</option>`).join("");

  root.innerHTML = `
    <div>
      <p class="panel-label">Operator console</p>
      <h1 class="landing-title">Start a live session</h1>
      <p class="landing-tagline">Set up the session, then start speaking. Listeners each choose their own language.</p>

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
          <label class="field-label" for="preview-language">Preview / translation language</label>
          <select id="preview-language" class="field-select">
            ${langOptions}
          </select>
        </div>

        <div class="field">
          <div class="audio-control">
            <button type="button" id="test-audio" class="btn btn-secondary">Test audio</button>
            <canvas id="test-waveform" class="waveform hidden" width="160" height="28" aria-hidden="true"></canvas>
          </div>
        </div>

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

  const submitBtn = root.querySelector<HTMLButtonElement>("#setup-form button[type=submit]")!;
  root.querySelector<HTMLFormElement>("#setup-form")!.onsubmit = async (e) => {
    e.preventDefault();
    const name = (root.querySelector<HTMLInputElement>("#session-name")!).value;
    const sourceLanguage = (root.querySelector<HTMLSelectElement>("#source-language")!).value;
    const previewLanguage = (root.querySelector<HTMLSelectElement>("#preview-language")!).value;

    // ponytail: acquire mic + resume the AudioContext here, synchronously
    // within the click's user-activation window — a slow room/WebSocket
    // round trip (e.g. a cold-starting free host) can otherwise outlast
    // that window, leaving the context stuck "suspended" with no error.
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

    const room = await createRoom(name, sourceLanguage);
    renderConsole(root, room, previewLanguage, audioContext, stream);
  };
}

function renderConsole(
  root: HTMLElement,
  room: RoomInfo,
  previewLangCode: string,
  audioContext: AudioContext,
  stream: MediaStream,
): void {
  root.classList.add("wide");
  const joinLink = `${location.origin}${location.pathname}?room=${room.code}`;
  const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=128x128&data=${encodeURIComponent(joinLink)}`;
  const previewLang = LANGUAGES.find((l) => l.code === previewLangCode) ?? LANGUAGES[0];

  root.innerHTML = `
    <div>
      <div class="shell-header" style="border:none; padding:0; margin-bottom: var(--space-4)">
        <div>
          <p class="session-name">${escapeHtml(room.name)}</p>
          <div id="console-status" style="margin-top: var(--space-1)"></div>
        </div>
        <button id="settings-btn" class="icon-btn" aria-label="Settings">${icons.settings}</button>
      </div>

      <div id="settings-panel" class="settings-panel hidden">
        <div class="settings-row">
          <span>Preview language</span>
          <select id="preview-language-live" class="field-select" style="max-width:200px">
            ${LANGUAGES.map((l) => `<option value="${l.code}" ${l.code === previewLang.code ? "selected" : ""}>${l.englishName}</option>`).join("")}
          </select>
        </div>
      </div>

      <div class="join-panel">
        <p class="panel-label">Share with listeners</p>
        <div class="join-row">
          <img class="qr-image" src="${qrSrc}" alt="QR code to join this session" width="128" height="128" />
          <div style="flex:1; min-width:0">
            <div class="join-link">${joinLink}</div>
            <div class="btn-row" style="margin-top: var(--space-2)">
              <button id="copy-link" class="btn btn-secondary">Copy link</button>
              <a href="?display=${room.code}&lang=${previewLang.code}" target="_blank" class="btn btn-secondary" rel="noopener">Open event display</a>
            </div>
          </div>
        </div>
      </div>

      <hr class="divider" />

      <div class="console-grid">
        <div class="console-panel">
          <p class="panel-label">Live transcript</p>
          <div id="transcript-lines" class="transcript-lines" style="min-height:120px">
            <p class="state-message">Waiting for speech…</p>
          </div>
        </div>
        <div class="console-panel">
          <p class="panel-label">Translation (${escapeHtml(previewLang.englishName)})</p>
          <div id="translation-lines" class="transcript-lines" style="min-height:120px">
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
  root.querySelector<HTMLButtonElement>("#copy-link")!.onclick = () => {
    navigator.clipboard.writeText(joinLink);
  };

  connectMic(room, statusEl, root.querySelector<HTMLCanvasElement>("#mic-waveform")!, audioContext, stream);
  connectPreview(room, previewLang.code, root);

  root.querySelector<HTMLSelectElement>("#preview-language-live")!.onchange = (e) => {
    const code = (e.target as HTMLSelectElement).value;
    previewSocket?.close();
    root.querySelector(".console-panel:nth-child(2) .panel-label")!.textContent =
      `Translation (${LANGUAGES.find((l) => l.code === code)?.englishName ?? code})`;
    connectPreview(room, code, root);
  };

  const pauseBtn = root.querySelector<HTMLButtonElement>("#pause-btn")!;
  pauseBtn.onclick = () => {
    paused = !paused;
    pauseBtn.textContent = paused ? "Resume" : "Pause";
    setStatus(statusEl, paused ? "connecting" : "live", paused ? "Paused" : undefined);
  };

  root.querySelector<HTMLButtonElement>("#stop-btn")!.onclick = () => {
    stopHosting();
    location.reload();
  };
}

function escapeHtml(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function connectMic(
  room: RoomInfo,
  statusEl: HTMLElement,
  waveformCanvas: HTMLCanvasElement,
  audioContext: AudioContext,
  stream: MediaStream,
): void {
  audioCtx = audioContext;
  micStream = stream;
  // ponytail: AudioContext({sampleRate:16000}) is only a request — Safari/
  // iOS and some Android browsers ignore it and keep the hardware's native
  // rate (44100/48000). Tell the server the *actual* rate rather than
  // assuming it, or Soniox gets audio at the wrong speed/pitch and never
  // detects any speech, with no audio bytes ever missing and no error.
  micSocket = new WebSocket(wsUrl(`/ws/host?room=${room.code}&sampleRate=${Math.round(audioContext.sampleRate)}`));

  micSocket.onopen = async () => {
    // ponytail: re-resume defensively — some browsers re-suspend a context
    // that's been idle since it was created, even mid-session.
    await audioCtx!.resume();
    if (audioCtx!.state !== "running") {
      setStatus(statusEl, "error", "Audio blocked — reload and try Start session again");
      return;
    }
    setStatus(statusEl, "live");

    const source = audioCtx!.createMediaStreamSource(stream);
    const analyser = audioCtx!.createAnalyser();
    source.connect(analyser);
    stopWaveform = attachMicWaveform(waveformCanvas, analyser);

    // ponytail: ScriptProcessorNode is deprecated but keeps this to one
    // inline function with no worklet file; upgrade path is
    // AudioWorkletNode if browser support is ever dropped.
    processorNode = audioCtx!.createScriptProcessor(4096, 1, 1);
    const mute = audioCtx!.createGain();
    mute.gain.value = 0; // keep the graph live without echoing audio to speakers

    processorNode.onaudioprocess = (event) => {
      if (paused || micSocket?.readyState !== WebSocket.OPEN) return;
      const input = event.inputBuffer.getChannelData(0);
      const pcm = new Int16Array(input.length);
      for (let i = 0; i < input.length; i++) {
        const s = Math.max(-1, Math.min(1, input[i]));
        pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
      }
      micSocket!.send(pcm.buffer);
    };

    source.connect(processorNode);
    processorNode.connect(mute);
    mute.connect(audioCtx!.destination);
  };

  micSocket.onclose = () => setStatus(statusEl, "offline");
  micSocket.onerror = () => setStatus(statusEl, "error");
}

function connectPreview(room: RoomInfo, langCode: string, root: HTMLElement): void {
  const transcriptEl = root.querySelector<HTMLDivElement>("#transcript-lines")!;
  const translationEl = root.querySelector<HTMLDivElement>("#translation-lines")!;
  const sourceLines: string[] = [];
  const translationLines: string[] = [];

  previewSocket = new WebSocket(wsUrl(`/ws/listen?room=${room.code}&lang=${langCode}`));
  previewSocket.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.type !== "tokens") return;
    let srcFinal = "";
    let srcPending = "";
    let trFinal = "";
    let trPending = "";
    for (const token of msg.tokens as Array<{ text: string; is_final: boolean; translation_status?: string }>) {
      if (token.translation_status === "original") {
        token.is_final ? (srcFinal += token.text) : (srcPending += token.text);
      } else if (token.translation_status === "translation") {
        token.is_final ? (trFinal += token.text) : (trPending += token.text);
      }
    }
    if (srcFinal) sourceLines.push(srcFinal);
    if (trFinal) translationLines.push(trFinal);
    renderFeed(transcriptEl, sourceLines, srcPending);
    renderFeed(translationEl, translationLines, trPending);
  };
}

function stopHosting(): void {
  processorNode?.disconnect();
  processorNode = null;
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
