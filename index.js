import "dotenv/config";
import express from "express";
import { botManager } from "./bot-manager.js";
import { startDiscordBot } from "./discord-bot.js";

const app = express();
app.use(express.json());

// Health check — UptimeRobot / Render ping karta hai isse
app.get("/", (_req, res) => {
  const status = botManager.getStatus();
  res.json({ status: "ok", bot_state: status.state, running: status.running });
});

// Bot start karo
app.post("/bot/start", (req, res) => {
  const { host, port, username, password, version } = req.body;
  if (!host || !username || !password) {
    return res.status(400).json({ error: "host, username, aur password zaroori hai" });
  }
  if (botManager.isRunning()) {
    return res.status(409).json({ error: "Bot pehle se chal raha hai. Pehle stop karo." });
  }
  botManager.start({
    host,
    port: port ?? 25565,
    username,
    password,
    version: version ?? null,
  });
  res.json(botManager.getStatus());
});

// Bot band karo
app.post("/bot/stop", (_req, res) => {
  if (!botManager.isRunning()) {
    return res.status(404).json({ error: "Bot chal nahi raha." });
  }
  botManager.stop();
  res.json(botManager.getStatus());
});

// Status dekho
app.get("/bot/status", (_req, res) => {
  res.json(botManager.getStatus());
});

// Chat message bhejo
app.post("/bot/chat", (req, res) => {
  const { message } = req.body;
  if (!message) return res.status(400).json({ error: "message field zaroori hai" });
  if (!botManager.isRunning()) {
    return res.status(404).json({ error: "Bot connected nahi hai." });
  }
  try {
    botManager.sendChat(message);
    res.json({ ok: true, message });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`[Server] Running on port ${PORT}`);
});

startDiscordBot().catch(console.error);
