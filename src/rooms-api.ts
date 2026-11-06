export interface RoomInfo {
  slug: string;
  name: string;
  targetLanguage: string;
  sourceLanguage: string;
  live: boolean;
  hostAudioReceived: boolean;
}

export interface HostSessionInfo {
  id: number;
  name: string;
  sourceLanguage: string;
  live: boolean;
  hostAudioReceived: boolean;
}

export interface PublicRoom {
  id: number;
  slug: string;
  name: string;
  targetLanguage: string;
}

export async function startHostSession(name: string, sourceLanguage: string): Promise<HostSessionInfo> {
  const res = await fetch("/api/sessions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, sourceLanguage }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error ?? "Could not start session");
  return body;
}

export async function stopHostSession(sessionId: number): Promise<void> {
  await fetch(`/api/sessions/${sessionId}/stop`, { method: "POST" });
}

export async function listRooms(): Promise<PublicRoom[]> {
  const res = await fetch("/api/rooms");
  if (!res.ok) return [];
  return res.json();
}

export async function fetchRoomInfo(slug: string): Promise<RoomInfo | null> {
  const res = await fetch(`/api/rooms/${encodeURIComponent(slug)}`);
  if (!res.ok) return null;
  return res.json();
}

/** Distinguishes "no speaker is live" from "audio arrived, but no transcript came back" — two very different problems. */
export async function noAudioDiagnosis(slug: string): Promise<string> {
  const info = await fetchRoomInfo(slug);
  if (!info?.live) return "No speaker is live right now. Check back once the session starts.";
  if (!info.hostAudioReceived) {
    return "The speaker's microphone audio isn't reaching the server — ask them to check mic permissions and reload.";
  }
  return "Audio is being received, but no transcript has come back yet — this may be a translation issue for this language.";
}

export function wsUrl(path: string): string {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  return `${proto}://${location.host}${path}`;
}
