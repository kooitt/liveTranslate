export interface RoomInfo {
  code: string;
  name: string;
  sourceLanguage: string;
  live: boolean;
  hostAudioReceived: boolean;
}

export async function createRoom(name: string, sourceLanguage: string): Promise<RoomInfo> {
  const res = await fetch("/api/rooms", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, sourceLanguage }),
  });
  if (!res.ok) throw new Error("Could not start session");
  return res.json();
}

export async function fetchRoomInfo(code: string): Promise<RoomInfo | null> {
  const res = await fetch(`/api/rooms/${encodeURIComponent(code)}`);
  if (!res.ok) return null;
  return res.json();
}

/** Distinguishes "speaker never sent audio" from "audio arrived, but no transcript came back" — two very different problems. */
export async function noAudioDiagnosis(code: string): Promise<string> {
  const info = await fetchRoomInfo(code);
  if (!info?.live) return "The speaker isn't connected. Ask them to start the session.";
  if (!info.hostAudioReceived) {
    return "The speaker's microphone audio isn't reaching the server — ask them to check mic permissions and reload.";
  }
  return "Audio is being received, but no transcript has come back yet — this may be a translation issue for this language.";
}

export function wsUrl(path: string): string {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  return `${proto}://${location.host}${path}`;
}
