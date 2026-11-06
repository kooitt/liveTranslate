import express from "express";
import { createServer } from "node:http";
import { WebSocketServer } from "ws";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { migrate } from "./db.js";
import {
  getRoomBySlug,
  listRoomRecords,
  createRoomRecord,
  updateRoomRecord,
  deleteRoomRecord,
  RoomValidationError,
  attachHost,
  joinListener,
  startHostSession,
  stopHostSession,
  getLiveSessionInfo,
  listHostSessions,
} from "./rooms.js";
import {
  requireAdmin,
  getAdminByEmail,
  verifyPassword,
  createSession,
  getSessionToken,
  setSessionCookie,
  clearSessionCookie,
  destroySession,
  listAdmins,
  createAdmin,
  deleteAdmin,
  AdminValidationError,
  seedAdminIfNeeded,
} from "./auth.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;
const SONIOX_API_KEY = process.env.SONIOX_API_KEY;
const DIST_DIR = path.join(__dirname, "..", "dist");

await migrate();
await seedAdminIfNeeded();

const app = express();
app.use(express.json());
app.use(express.static(DIST_DIR));

// ponytail: Express 4 doesn't forward a rejected promise from an async
// route handler to the error middleware on its own — without this, a
// thrown DB error would just hang the request forever instead of
// returning a 500.
const ah = (fn) => (req, res, next) => fn(req, res, next).catch(next);

/* ---------------- Admin auth ---------------- */

app.post(
  "/api/admin/login",
  ah(async (req, res) => {
    const { email, password } = req.body ?? {};
    const admin = email ? await getAdminByEmail(email) : null;
    if (!admin || !verifyPassword(password ?? "", admin.password_hash)) {
      res.status(401).json({ error: "Invalid email or password" });
      return;
    }
    const { token, expiresAt } = await createSession(admin.id);
    setSessionCookie(res, token, expiresAt);
    res.json({ email: admin.email });
  }),
);

app.post(
  "/api/admin/logout",
  ah(async (req, res) => {
    await destroySession(getSessionToken(req));
    clearSessionCookie(res);
    res.json({ ok: true });
  }),
);

app.get("/api/admin/me", requireAdmin, (req, res) => {
  res.json({ email: req.admin.email });
});

/* ---------------- Admin: rooms CRUD ---------------- */

app.get(
  "/api/admin/rooms",
  requireAdmin,
  ah(async (req, res) => {
    res.json(await listRoomRecords());
  }),
);

app.post(
  "/api/admin/rooms",
  requireAdmin,
  ah(async (req, res) => {
    try {
      res.status(201).json(await createRoomRecord(req.body ?? {}));
    } catch (err) {
      if (!(err instanceof RoomValidationError)) throw err;
      res.status(400).json({ error: err.message });
    }
  }),
);

app.patch(
  "/api/admin/rooms/:id",
  requireAdmin,
  ah(async (req, res) => {
    try {
      res.json(await updateRoomRecord(Number(req.params.id), req.body ?? {}));
    } catch (err) {
      if (!(err instanceof RoomValidationError)) throw err;
      res.status(400).json({ error: err.message });
    }
  }),
);

app.delete(
  "/api/admin/rooms/:id",
  requireAdmin,
  ah(async (req, res) => {
    await deleteRoomRecord(Number(req.params.id));
    res.json({ ok: true });
  }),
);

/* ---------------- Admin: sessions ---------------- */

app.get(
  "/api/admin/sessions",
  requireAdmin,
  ah(async (req, res) => {
    res.json(await listHostSessions());
  }),
);

app.post(
  "/api/admin/sessions/:id/stop",
  requireAdmin,
  ah(async (req, res) => {
    try {
      await stopHostSession(Number(req.params.id));
      res.json({ ok: true });
    } catch (err) {
      if (!(err instanceof RoomValidationError)) throw err;
      res.status(409).json({ error: err.message });
    }
  }),
);

/* ---------------- Admin: admin accounts ---------------- */

app.get(
  "/api/admin/admins",
  requireAdmin,
  ah(async (req, res) => {
    res.json(await listAdmins());
  }),
);

app.post(
  "/api/admin/admins",
  requireAdmin,
  ah(async (req, res) => {
    try {
      const { email, password } = req.body ?? {};
      res.status(201).json(await createAdmin(email, password));
    } catch (err) {
      if (!(err instanceof AdminValidationError)) throw err;
      res.status(400).json({ error: err.message });
    }
  }),
);

app.delete(
  "/api/admin/admins/:id",
  requireAdmin,
  ah(async (req, res) => {
    try {
      await deleteAdmin(Number(req.params.id));
      res.json({ ok: true });
    } catch (err) {
      if (!(err instanceof AdminValidationError)) throw err;
      res.status(400).json({ error: err.message });
    }
  }),
);

/* ---------------- Public: rooms + host sessions ---------------- */

app.get(
  "/api/rooms",
  ah(async (req, res) => {
    res.json(await listRoomRecords());
  }),
);

app.get(
  "/api/rooms/:slug",
  ah(async (req, res) => {
    const room = await getRoomBySlug(req.params.slug);
    if (!room) {
      res.status(404).json({ error: "Room not found" });
      return;
    }
    const live = getLiveSessionInfo();
    res.json({
      slug: room.slug,
      name: room.name,
      targetLanguage: room.targetLanguage,
      sourceLanguage: live?.sourceLanguage ?? "",
      live: live?.live ?? false,
      hostAudioReceived: live?.hostAudioReceived ?? false,
    });
  }),
);

app.post(
  "/api/sessions",
  ah(async (req, res) => {
    try {
      const { name, sourceLanguage } = req.body ?? {};
      res.status(201).json(await startHostSession({ name, sourceLanguage }));
    } catch (err) {
      if (!(err instanceof RoomValidationError)) throw err;
      res.status(409).json({ error: err.message });
    }
  }),
);

app.post(
  "/api/sessions/:id/stop",
  ah(async (req, res) => {
    try {
      await stopHostSession(Number(req.params.id));
      res.json({ ok: true });
    } catch (err) {
      if (!(err instanceof RoomValidationError)) throw err;
      res.status(409).json({ error: err.message });
    }
  }),
);

/* ---------------- SPA fallback — lets /admin and /room/:slug deep-link ---------------- */

app.get("*", (req, res) => {
  res.sendFile(path.join(DIST_DIR, "index.html"));
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
});

const server = createServer(app);
const wss = new WebSocketServer({ noServer: true });

server.on("upgrade", (req, socket, head) => {
  const url = new URL(req.url, "http://localhost");

  if (url.pathname === "/ws/host") {
    const sessionId = Number(url.searchParams.get("session"));
    if (!sessionId) {
      socket.destroy();
      return;
    }
    const sampleRate = Number(url.searchParams.get("sampleRate")) || 16000;
    wss.handleUpgrade(req, socket, head, (ws) => attachHost(sessionId, ws, sampleRate));
    return;
  }

  if (url.pathname === "/ws/listen") {
    const slug = url.searchParams.get("slug");
    if (!slug || !SONIOX_API_KEY) {
      socket.destroy();
      return;
    }
    getRoomBySlug(slug)
      .then((room) => {
        if (!room) {
          socket.destroy();
          return;
        }
        wss.handleUpgrade(req, socket, head, (ws) => joinListener(room, ws, SONIOX_API_KEY));
      })
      .catch(() => socket.destroy());
    return;
  }

  socket.destroy();
});

server.listen(PORT, () => {
  console.log(`LiveTranslate listening on http://localhost:${PORT}`);
  if (!SONIOX_API_KEY) {
    console.warn("Warning: SONIOX_API_KEY is not set — listener sessions will fail.");
  }
  if (!process.env.DATABASE_URL) {
    console.warn("Warning: DATABASE_URL is not set — rooms/admin accounts cannot be read or written.");
  }
});
