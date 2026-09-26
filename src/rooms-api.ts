export interface RoomInfo {
  code: string;
  name: string;
  sourceLanguage: string;
  live: boolean;
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

export function wsUrl(path: string): string {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  return `${proto}://${location.host}${path}`;
}
