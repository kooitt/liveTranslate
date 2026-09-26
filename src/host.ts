// Host flow: capture mic as raw 16kHz mono PCM and stream it to the backend.
// Raw PCM (not a container format like webm) has no header/init-segment, so
// any Soniox session opened later for a newly-requested language can start
// decoding mid-stream without needing bytes from the very beginning.
let audioCtx: AudioContext | null = null;
let socket: WebSocket | null = null;

export function initHostView(root: HTMLElement): void {
  root.innerHTML = `
    <div class="screen">
      <h1>Host a session</h1>
      <button id="start-btn" class="big-btn primary">🎤 Start Hosting</button>
      <div id="session-info" class="session-info hidden">
        <p>Share this link with your audience:</p>
        <div class="room-link-row">
          <input id="room-link" readonly class="room-link" />
          <button id="copy-btn" class="link-btn">Copy</button>
        </div>
        <p class="room-code-label">Room code: <span id="room-code"></span></p>
        <div id="host-transcript" class="caption-text"></div>
        <button id="stop-btn" class="link-btn">Stop session</button>
      </div>
    </div>
  `;

  root.querySelector<HTMLButtonElement>("#start-btn")!.onclick = () => startHosting(root);
}

async function startHosting(root: HTMLElement): Promise<void> {
  const res = await fetch("/api/rooms", { method: "POST" });
  if (!res.ok) {
    alert("Could not start session. Try again.");
    return;
  }
  const { code } = await res.json();

  const link = `${location.origin}${location.pathname}?room=${code}`;
  (root.querySelector("#room-link") as HTMLInputElement).value = link;
  root.querySelector("#room-code")!.textContent = code;
  root.querySelector("#session-info")!.classList.remove("hidden");
  root.querySelector("#start-btn")!.classList.add("hidden");

  root.querySelector<HTMLButtonElement>("#copy-btn")!.onclick = () => {
    navigator.clipboard.writeText(link);
  };

  const proto = location.protocol === "https:" ? "wss" : "ws";
  socket = new WebSocket(`${proto}://${location.host}/ws/host?room=${code}`);

  socket.onopen = () => startMicStream(root);
  socket.onerror = () => {
    root.querySelector("#host-transcript")!.textContent = "⚠️ Connection error.";
  };

  root.querySelector<HTMLButtonElement>("#stop-btn")!.onclick = () => {
    stopHosting();
    location.reload();
  };
}

async function startMicStream(root: HTMLElement): Promise<void> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  audioCtx = new AudioContext({ sampleRate: 16000 });
  const source = audioCtx.createMediaStreamSource(stream);

  // ponytail: ScriptProcessorNode is deprecated but keeps this to one inline
  // function with no worklet file; upgrade path is AudioWorkletNode if
  // browser support is ever dropped.
  const processor = audioCtx.createScriptProcessor(4096, 1, 1);
  const mute = audioCtx.createGain();
  mute.gain.value = 0; // keep the graph live without echoing audio to speakers

  processor.onaudioprocess = (event) => {
    if (socket?.readyState !== WebSocket.OPEN) return;
    const input = event.inputBuffer.getChannelData(0);
    const pcm = new Int16Array(input.length);
    for (let i = 0; i < input.length; i++) {
      const s = Math.max(-1, Math.min(1, input[i]));
      pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    socket.send(pcm.buffer);
  };

  source.connect(processor);
  processor.connect(mute);
  mute.connect(audioCtx.destination);

  root.querySelector("#host-transcript")!.textContent = "🎙️ Listening… speak now.";
}

function stopHosting(): void {
  audioCtx?.close();
  audioCtx = null;
  socket?.close();
  socket = null;
}
