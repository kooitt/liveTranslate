import express from "express";
import { createServer } from "node:http";
import { WebSocketServer } from "ws";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRoom, getRoom, attachHost, joinListener } from "./rooms.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;
const SONIOX_API_KEY = process.env.SONIOX_API_KEY;

const app = express();
app.use(express.static(path.join(__dirname, "..", "dist")));

app.post("/api/rooms", (req, res) => {
  const room = createRoom();
  res.json({ code: room.code });
});

const server = createServer(app);
const wss = new WebSocketServer({ noServer: true });

server.on("upgrade", (req, socket, head) => {
  const url = new URL(req.url, "http://localhost");

  if (url.pathname === "/ws/host") {
    const room = getRoom(url.searchParams.get("room"));
    if (!room) {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => attachHost(room, ws));
    return;
  }

  if (url.pathname === "/ws/listen") {
    const room = getRoom(url.searchParams.get("room"));
    const lang = url.searchParams.get("lang");
    if (!room || !lang || !SONIOX_API_KEY) {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => joinListener(room, lang, ws, SONIOX_API_KEY));
    return;
  }

  socket.destroy();
});

server.listen(PORT, () => {
  console.log(`LiveTranslate listening on http://localhost:${PORT}`);
  if (!SONIOX_API_KEY) {
    console.warn("Warning: SONIOX_API_KEY is not set — listener sessions will fail.");
  }
});
