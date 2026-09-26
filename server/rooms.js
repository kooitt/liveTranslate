import { randomBytes } from "node:crypto";
import { openSonioxSession } from "./soniox.js";

// code -> { hostSocket, languages: Map<langCode, { session, listeners: Set<WebSocket> }> }
const rooms = new Map();

function generateCode() {
  return randomBytes(3).toString("hex"); // e.g. "a1b2c3"
}

export function createRoom() {
  let code;
  do {
    code = generateCode();
  } while (rooms.has(code));
  const room = { code, hostSocket: null, languages: new Map() };
  rooms.set(code, room);
  return room;
}

export function getRoom(code) {
  return rooms.get(code);
}

function closeRoom(room) {
  for (const entry of room.languages.values()) {
    entry.session.close();
    for (const listener of entry.listeners) listener.close();
  }
  room.languages.clear();
  rooms.delete(room.code);
}

/** Wires a host's mic WebSocket to fan its audio into every active language session. */
export function attachHost(room, ws) {
  room.hostSocket = ws;
  ws.on("message", (data, isBinary) => {
    if (!isBinary) return; // ignore any stray control/text frames
    for (const entry of room.languages.values()) entry.session.sendAudio(data);
  });
  ws.on("close", () => closeRoom(room));
  ws.on("error", () => closeRoom(room));
}

/** Joins a listener to a room+language, lazily opening the Soniox session for that language. */
export function joinListener(room, langCode, ws, apiKey) {
  let entry = room.languages.get(langCode);
  if (!entry) {
    entry = { session: null, listeners: new Set() };
    room.languages.set(langCode, entry);
    entry.session = openSonioxSession({
      apiKey,
      targetLanguage: langCode,
      onTokens: (tokens) => {
        const payload = JSON.stringify({ type: "tokens", tokens });
        for (const listener of entry.listeners) {
          if (listener.readyState === listener.OPEN) listener.send(payload);
        }
      },
      onError: (err) => {
        const payload = JSON.stringify({ type: "error", message: err.error_message });
        for (const listener of entry.listeners) {
          if (listener.readyState === listener.OPEN) listener.send(payload);
        }
      },
    });
  }
  entry.listeners.add(ws);

  ws.on("close", () => {
    entry.listeners.delete(ws);
    if (entry.listeners.size === 0) {
      entry.session.close();
      room.languages.delete(langCode);
    }
  });
}
