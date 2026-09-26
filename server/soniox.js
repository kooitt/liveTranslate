import WebSocket from "ws";

const SONIOX_WS_URL = "wss://stt-rt.soniox.com/transcribe-websocket";

/**
 * Opens one Soniox real-time translation session. Caller feeds raw
 * pcm_s16le/16kHz/mono audio in; translated tokens come out via onTokens.
 * The session queues audio sent before the config handshake completes.
 */
export function openSonioxSession({ apiKey, targetLanguage, languageHints, onTokens, onError, onClose }) {
  const ws = new WebSocket(SONIOX_WS_URL);
  const queue = [];
  let ready = false;

  ws.on("open", () => {
    ws.send(
      JSON.stringify({
        api_key: apiKey,
        model: "stt-rt-v5",
        audio_format: "pcm_s16le",
        sample_rate: 16000,
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
      onError?.({ error_message: msg.error_message ?? "Soniox error" });
      return;
    }
    if (msg.tokens?.length) onTokens(msg.tokens);
  });

  ws.on("close", () => onClose?.());
  ws.on("error", (err) => onError?.({ error_message: err.message }));

  return {
    sendAudio(chunk) {
      if (ready && ws.readyState === WebSocket.OPEN) ws.send(chunk);
      else if (!ready) queue.push(chunk);
    },
    close() {
      if (ws.readyState === WebSocket.OPEN) ws.send("");
      ws.close();
    },
  };
}
