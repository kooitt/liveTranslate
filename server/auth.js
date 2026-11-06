import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { query } from "./db.js";

const SESSION_COOKIE = "admin_session";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const candidate = scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, "hex");
  // scrypt output is always 64 bytes here, but guard the length anyway —
  // timingSafeEqual throws on mismatched buffer lengths instead of just
  // returning false.
  if (candidate.length !== expected.length) return false;
  return timingSafeEqual(candidate, expected);
}

export async function getAdminByEmail(email) {
  const { rows } = await query("SELECT id, email, password_hash FROM admins WHERE email = $1", [email]);
  return rows[0] ?? null;
}

export async function createSession(adminId) {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await query("INSERT INTO admin_sessions (token, admin_id, expires_at) VALUES ($1, $2, $3)", [
    token,
    adminId,
    expiresAt,
  ]);
  return { token, expiresAt };
}

export async function getSessionAdmin(token) {
  if (!token) return null;
  const { rows } = await query(
    `SELECT admins.id, admins.email FROM admin_sessions
     JOIN admins ON admins.id = admin_sessions.admin_id
     WHERE admin_sessions.token = $1 AND admin_sessions.expires_at > now()`,
    [token],
  );
  return rows[0] ?? null;
}

export async function destroySession(token) {
  if (!token) return;
  await query("DELETE FROM admin_sessions WHERE token = $1", [token]);
}

/** Minimal manual cookie parsing — avoids a cookie-parser dependency for one cookie. */
function parseCookies(header) {
  const out = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  }
  return out;
}

export function getSessionToken(req) {
  return parseCookies(req.headers.cookie)[SESSION_COOKIE];
}

export function setSessionCookie(res, token, expiresAt) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  res.setHeader(
    "Set-Cookie",
    `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Expires=${expiresAt.toUTCString()}${secure}`,
  );
}

export function clearSessionCookie(res) {
  res.setHeader("Set-Cookie", `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}

/** Express middleware: 401s anything under /api/admin/* without a valid session. */
export async function requireAdmin(req, res, next) {
  const admin = await getSessionAdmin(getSessionToken(req));
  if (!admin) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  req.admin = admin;
  next();
}

export async function listAdmins() {
  const { rows } = await query("SELECT id, email, created_at FROM admins ORDER BY created_at");
  return rows;
}

export class AdminValidationError extends Error {}

export async function createAdmin(email, password) {
  if (!email?.trim()) throw new AdminValidationError("Email is required");
  if (!password || password.length < 8) throw new AdminValidationError("Password must be at least 8 characters");
  try {
    const { rows } = await query(
      "INSERT INTO admins (email, password_hash) VALUES ($1, $2) RETURNING id, email, created_at",
      [email.trim(), hashPassword(password)],
    );
    return rows[0];
  } catch (err) {
    if (err.code === "23505") throw new AdminValidationError("That email is already registered");
    throw err;
  }
}

export async function deleteAdmin(id) {
  const { rows } = await query("SELECT COUNT(*)::int AS count FROM admins");
  if (rows[0].count <= 1) throw new AdminValidationError("Can't remove the last remaining admin account");
  await query("DELETE FROM admins WHERE id = $1", [id]);
}

/** Seeds the one initial admin from env vars, only if no admins exist yet. */
export async function seedAdminIfNeeded() {
  const { ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) return;
  const { rows } = await query("SELECT 1 FROM admins LIMIT 1");
  if (rows.length > 0) return;
  await query("INSERT INTO admins (email, password_hash) VALUES ($1, $2)", [
    ADMIN_EMAIL,
    hashPassword(ADMIN_PASSWORD),
  ]);
  console.log(`Seeded initial admin account: ${ADMIN_EMAIL}`);
}
