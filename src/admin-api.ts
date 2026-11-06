export interface AdminRoom {
  id: number;
  slug: string;
  name: string;
  targetLanguage: string;
}

export interface AdminSession {
  id: number;
  name: string;
  sourceLanguage: string;
  startedAt: string;
  endedAt: string | null;
  live: boolean;
}

export interface AdminAccount {
  id: number;
  email: string;
  created_at: string;
}

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { credentials: "same-origin", ...init });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? "Request failed");
  return body as T;
}

const json = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

export const login = (email: string, password: string) =>
  call<{ email: string }>("/api/admin/login", json({ email, password }));

export const logout = () => call<{ ok: true }>("/api/admin/logout", { method: "POST" });

export const me = () => call<{ email: string }>("/api/admin/me");

export const listRooms = () => call<AdminRoom[]>("/api/admin/rooms");

export const createRoom = (room: { name: string; slug: string; targetLanguage: string }) =>
  call<AdminRoom>("/api/admin/rooms", json(room));

export const updateRoom = (id: number, room: { name: string; slug: string; targetLanguage: string }) =>
  call<AdminRoom>(`/api/admin/rooms/${id}`, { ...json(room), method: "PATCH" });

export const deleteRoom = (id: number) => call<{ ok: true }>(`/api/admin/rooms/${id}`, { method: "DELETE" });

export const listSessions = () => call<AdminSession[]>("/api/admin/sessions");

export const stopSession = (id: number) => call<{ ok: true }>(`/api/admin/sessions/${id}/stop`, { method: "POST" });

export const listAdminAccounts = () => call<AdminAccount[]>("/api/admin/admins");

export const createAdminAccount = (email: string, password: string) =>
  call<AdminAccount>("/api/admin/admins", json({ email, password }));

export const deleteAdminAccount = (id: number) => call<{ ok: true }>(`/api/admin/admins/${id}`, { method: "DELETE" });
