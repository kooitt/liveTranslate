import WebSocket from "ws";

const SONIOX_WS_URL = "wss://stt-rt.soniox.com/transcribe-websocket";

/**
 * Opens one Soniox real-time translation session. Caller feeds raw
 * pcm_s16le/16kHz/mono audio in; translated tokens come out via onTokens.
 * The session queues audio sent before the config handshake completes.
 */
export function openSonioxSession({ apiKey, targetLanguage, sampleRate = 16000, languageHints, onTokens, onError, onClose }) {
  const ws = new WebSocket(SONIOX_WS_URL);
  const queue = [];
  let ready = false;
  let closedIntentionally = false;
  let hadError = false;
  const tag = `Soniox[target=${targetLanguage}]`;

  ws.on("open", () => {
    ws.send(
      JSON.stringify({
        api_key: apiKey,
        model: "stt-rt-v5",
        audio_format: "pcm_s16le",
        sample_rate: sampleRate,
        num_channels: 1,
        enable_language_identification: true,
        ...(languageHints?.length ? { language_hints: languageHints } : {}),
        translation: { type: "one_way", target_language: targetLanguage },
      }),
    );
    ready = true;
    for (const chunk of queue.splice(0)) ws.send(chunk);
  });

  ws.on("message", (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }
    if (msg.error_code) {
      console.error(`${tag} error: ${msg.error_code} ${msg.error_message ?? ""}`);
      hadError = true;
      onError?.({ error_message: msg.error_message ?? "Soniox error" });
      return;
    }
    if (msg.tokens?.length) onTokens(msg.tokens);
  });

  // ponytail: Soniox typically sends an error_code message then a *clean*
  // close (code 1000) — so a close can never be assumed "fine" just because
  // the code is normal. Any close (expected or not) must drop the cached
  // session, or every later listener/reload just joins a dead session and
  // silently gets nothing forever, which was the actual bug here.
  ws.on("close", (code, reasonBuf) => {
    if (!closedIntentionally && !hadError) {
      console.error(`${tag} closed unexpectedly: code=${code} reason=${reasonBuf?.toString() ?? ""}`);
    }
    onClose?.({ intentional: closedIntentionally, hadError });
  });
  ws.on("error", (err) => {
    console.error(`${tag} connection error: ${err.message}`);
    hadError = true;
    onError?.({ error_message: err.message });
  });

  return {
    sendAudio(chunk) {
      if (ready && ws.readyState === WebSocket.OPEN) ws.send(chunk);
      else if (!ready) queue.push(chunk);
    },
    close() {
      closedIntentionally = true;
      if (ws.readyState === WebSocket.OPEN) ws.send("");
      ws.close();
    },
  };
}
