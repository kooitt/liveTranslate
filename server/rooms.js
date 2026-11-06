import { query } from "./db.js";
import { openSonioxSession } from "./soniox.js";

const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export function isValidSlug(slug) {
  return typeof slug === "string" && slug.length > 0 && slug.length <= 64 && SLUG_RE.test(slug);
}

export function slugify(text) {
  return (text ?? "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/* ------------------------------------------------------------------ *
 * Permanent rooms — persisted in Postgres, admin-managed.
 * ------------------------------------------------------------------ */

export async function listRoomRecords() {
  const { rows } = await query("SELECT id, slug, name, target_language, created_at FROM rooms ORDER BY created_at");
  return rows.map(toRoomShape);
}

export async function getRoomBySlug(slug) {
  const { rows } = await query("SELECT id, slug, name, target_language, created_at FROM rooms WHERE slug = $1", [
    slug,
  ]);
  return rows[0] ? toRoomShape(rows[0]) : null;
}

export async function getRoomById(id) {
  const { rows } = await query("SELECT id, slug, name, target_language, created_at FROM rooms WHERE id = $1", [id]);
  return rows[0] ? toRoomShape(rows[0]) : null;
}

function toRoomShape(row) {
  return { id: row.id, slug: row.slug, name: row.name, targetLanguage: row.target_language };
}

/** Thrown for conditions the route layer should turn into a 400/409, not a 500. */
export class RoomValidationError extends Error {}

export async function createRoomRecord({ name, slug, targetLanguage }) {
  if (!name?.trim()) throw new RoomValidationError("Name is required");
  if (!isValidSlug(slug)) throw new RoomValidationError("Slug must be lowercase letters, numbers and dashes only");
  if (!targetLanguage?.trim()) throw new RoomValidationError("Target language is required");
  try {
    const { rows } = await query(
      "INSERT INTO rooms (slug, name, target_language) VALUES ($1, $2, $3) RETURNING id, slug, name, target_language, created_at",
      [slug, name.trim(), targetLanguage],
    );
    return toRoomShape(rows[0]);
  } catch (err) {
    if (err.code === "23505") throw new RoomValidationError("That slug is already taken");
    throw err;
  }
}

export async function updateRoomRecord(id, { name, slug, targetLanguage }) {
  if (!name?.trim()) throw new RoomValidationError("Name is required");
  if (!isValidSlug(slug)) throw new RoomValidationError("Slug must be lowercase letters, numbers and dashes only");
  if (!targetLanguage?.trim()) throw new RoomValidationError("Target language is required");
  let row;
  try {
    const result = await query(
      "UPDATE rooms SET name = $1, slug = $2, target_language = $3 WHERE id = $4 RETURNING id, slug, name, target_language, created_at",
      [name.trim(), slug, targetLanguage, id],
    );
    row = result.rows[0];
  } catch (err) {
    if (err.code === "23505") throw new RoomValidationError("That slug is already taken");
    throw err;
  }
  if (!row) throw new RoomValidationError("Room not found");
  // The room's language changed (or it's just been edited) — drop any live
  // translation stream for it so listeners reconnect and get a session
  // matching the new configuration instead of silently going stale.
  closeRoomSession(id, "This room was just updated — reconnecting.");
  return toRoomShape(row);
}

export async function deleteRoomRecord(id) {
  closeRoomSession(id, "This room has been removed.");
  await query("DELETE FROM rooms WHERE id = $1", [id]);
}

/* ------------------------------------------------------------------ *
 * Live broadcast — one host session at a time, in-memory only. Its
 * audio fans out into every permanent room's own (lazily-opened)
 * Soniox session. None of this needs to survive a restart.
 * ------------------------------------------------------------------ */

let liveSession = null; // { id, name, sourceLanguage, hostSocket, sampleRate, audioBytesReceived, hostGraceTimer }
const roomSessions = new Map(); // roomId -> { session, listeners: Set<ws> }

// ponytail: mirrors the previous per-room grace period — a host's browser
// retries with backoff up to 10s between attempts (see host.ts), so a
// brief network blip shouldn't instantly end the session for everyone.
const HOST_RECONNECT_GRACE_MS = 30_000;

export function getLiveSessionInfo() {
  if (!liveSession) return null;
  return {
    id: liveSession.id,
    name: liveSession.name,
    sourceLanguage: liveSession.sourceLanguage,
    live: liveSession.hostSocket !== null,
    hostAudioReceived: liveSession.audioBytesReceived > 0,
  };
}

export async function listHostSessions() {
  const { rows } = await query(
    "SELECT id, name, source_language, started_at, ended_at FROM host_sessions ORDER BY started_at DESC LIMIT 50",
  );
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    sourceLanguage: r.source_language,
    startedAt: r.started_at,
    endedAt: r.ended_at,
    live: liveSession?.id === r.id,
  }));
}

export async function startHostSession({ name, sourceLanguage }) {
  if (liveSession) throw new RoomValidationError("A session is already live — stop it first");
  const { rows } = await query(
    "INSERT INTO host_sessions (name, source_language) VALUES ($1, $2) RETURNING id, started_at",
    [name?.trim() || "Live Session", sourceLanguage || ""],
  );
  liveSession = {
    id: rows[0].id,
    name: name?.trim() || "Live Session",
    sourceLanguage: sourceLanguage || "",
    hostSocket: null,
    sampleRate: 16000,
    audioBytesReceived: 0,
    hostGraceTimer: null,
  };
  return getLiveSessionInfo();
}

/** Wires a host's mic WebSocket to fan its audio into every room's active session. */
export function attachHost(sessionId, ws, sampleRate) {
  if (!liveSession || liveSession.id !== sessionId) {
    ws.close(1008, "No matching live session");
    return;
  }
  if (liveSession.hostGraceTimer) {
    clearTimeout(liveSession.hostGraceTimer);
    liveSession.hostGraceTimer = null;
  }
  liveSession.hostSocket = ws;
  liveSession.sampleRate = sampleRate || 16000;
  ws.on("message", (data, isBinary) => {
    if (!isBinary || !liveSession) return;
    liveSession.audioBytesReceived += data.length;
    for (const entry of roomSessions.values()) entry.session.sendAudio(data);
  });
  const onHostGone = () => {
    if (!liveSession || liveSession.hostSocket !== ws) return; // a newer host connection already replaced this one
    liveSession.hostSocket = null;
    liveSession.hostGraceTimer = setTimeout(() => endHostSession(sessionId), HOST_RECONNECT_GRACE_MS);
  };
  ws.on("close", onHostGone);
  ws.on("error", onHostGone);
}

/** Admin force-stop or host's own "Stop session" button. */
export async function stopHostSession(sessionId) {
  if (!liveSession || liveSession.id !== sessionId) throw new RoomValidationError("That session isn't live");
  await endHostSession(sessionId);
}

async function endHostSession(sessionId) {
  if (!liveSession || liveSession.id !== sessionId) return;
  if (liveSession.hostGraceTimer) clearTimeout(liveSession.hostGraceTimer);
  liveSession.hostSocket?.close();
  liveSession = null;
  for (const roomId of [...roomSessions.keys()]) {
    closeRoomSession(roomId, "The speaker's session has ended.");
  }
  await query("UPDATE host_sessions SET ended_at = now() WHERE id = $1 AND ended_at IS NULL", [sessionId]);
}

function closeRoomSession(roomId, listenerMessage) {
  const entry = roomSessions.get(roomId);
  if (!entry) return;
  roomSessions.delete(roomId);
  entry.session.close();
  for (const listener of entry.listeners) {
    if (listener.readyState === listener.OPEN) {
      listener.send(JSON.stringify({ type: "error", message: listenerMessage }));
    }
    listener.close();
  }
}

/** Joins a listener to a permanent room, lazily opening that room's Soniox session. */
export function joinListener(room, ws, apiKey) {
  let entry = roomSessions.get(room.id);
  if (!entry) {
    entry = { session: null, listeners: new Set() };
    roomSessions.set(room.id, entry);
    entry.session = openSonioxSession({
      apiKey,
      targetLanguage: room.targetLanguage,
      sampleRate: liveSession?.sampleRate || 16000,
      languageHints: liveSession?.sourceLanguage ? [liveSession.sourceLanguage] : undefined,
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
      onClose: ({ intentional, hadError }) => {
        roomSessions.delete(room.id);
        if (intentional || hadError) return;
        const payload = JSON.stringify({
          type: "error",
          message: "Translation session ended unexpectedly. Please reload to reconnect.",
        });
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
      roomSessions.delete(room.id);
    }
  });
}
