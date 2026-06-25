// index.js — 100-slot Minecraft AFK Bot Server
import "dotenv/config";
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import {
  getAllSlotStatuses,
  getSlotStatus,
  getSlotLogs,
  startSlot,
  stopSlot,
  rejoinSlot,
  chatSlot,
  getActiveCount,
  MAX_SLOTS,
} from "./slot-manager.js";
import { startDiscordBot } from "./discord-bot.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json());

// ── Serve dashboard HTML ──────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, "public")));

// ── Health check ──────────────────────────────────────────────────────────
app.get("/health", (_req, res) => {
  res.json({ status: "ok", active: getActiveCount(), total: MAX_SLOTS });
});

// ── GET /slots — all slot summaries ──────────────────────────────────────
app.get("/slots", (_req, res) => {
  res.json({
    total: MAX_SLOTS,
    active: getActiveCount(),
    slots: getAllSlotStatuses().map(({ id, running, state, host, port, username, version, uptime, errorMessage }) => ({
      id, running, state, host, port, username, version, uptime, errorMessage,
    })),
  });
});

// ── GET /slots/:id — single slot status ──────────────────────────────────
app.get("/slots/:id", (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1 || id > MAX_SLOTS)
    return res.status(400).json({ error: `Slot ID must be 1–${MAX_SLOTS}` });
  res.json(getSlotStatus(id));
});

// ── GET /slots/:id/logs ───────────────────────────────────────────────────
app.get("/slots/:id/logs", (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1 || id > MAX_SLOTS)
    return res.status(400).json({ error: "Invalid slot ID" });
  const limit = Number(req.query.limit) || 80;
  res.json({ logs: getSlotLogs(id, limit) });
});

// ── POST /slots/:id/start ─────────────────────────────────────────────────
app.post("/slots/:id/start", (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1 || id > MAX_SLOTS)
    return res.status(400).json({ error: "Invalid slot ID" });

  const { host, port = 25565, username, password = "", version = "1.20.1" } = req.body;
  if (!host || !username)
    return res.status(400).json({ error: "host and username are required" });

  try {
    startSlot(id, { host, port: Number(port), username, password, version });
    res.json({ ok: true, message: `Slot ${id}: connecting to ${host}:${port} as ${username}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /slots/:id/stop ──────────────────────────────────────────────────
app.post("/slots/:id/stop", (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1 || id > MAX_SLOTS)
    return res.status(400).json({ error: "Invalid slot ID" });
  try {
    stopSlot(id);
    res.json({ ok: true, message: `Slot ${id} stopped` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /slots/:id/rejoin ────────────────────────────────────────────────
app.post("/slots/:id/rejoin", (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1 || id > MAX_SLOTS)
    return res.status(400).json({ error: "Invalid slot ID" });
  try {
    rejoinSlot(id);
    res.json({ ok: true, message: `Slot ${id} rejoining…` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /slots/:id/chat ──────────────────────────────────────────────────
app.post("/slots/:id/chat", (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1 || id > MAX_SLOTS)
    return res.status(400).json({ error: "Invalid slot ID" });
  const { message } = req.body;
  if (!message) return res.status(400).json({ error: "message is required" });
  try {
    chatSlot(id, message);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── SPA fallback ──────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// ── Start ─────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`[Server] Running on port ${PORT}`));

startDiscordBot().catch(console.error);
