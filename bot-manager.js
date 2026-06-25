// slot-manager.js — 100 independent bot slots
// Ye file bot-manager.js ko replace karti hai
import mineflayer from "mineflayer";
import { EventEmitter } from "node:events";

const MAX_SLOTS = 100;

class BotSlot extends EventEmitter {
  constructor(id) {
    super();
    this.id = id;
    this.bot = null;
    this.config = null;
    this.state = "idle"; // idle | connecting | connected | afk | disconnected | error
    this.connectedAt = null;
    this.logs = [];
    this.afkInterval = null;
    this.reconnectTimer = null;
    this.reconnectAttempts = 0;
    this.errorMessage = null;
  }

  addLog(type, message) {
    const entry = { time: new Date().toISOString(), type, message };
    this.logs.push(entry);
    if (this.logs.length > 200) this.logs = this.logs.slice(-200);
    console.log(`[Slot ${this.id}][${type.toUpperCase()}] ${message}`);
    this.emit("log", { slotId: this.id, ...entry });
  }

  setState(state) {
    this.state = state;
    this.emit("stateChange", { slotId: this.id, state });
  }

  getStatus() {
    return {
      id: this.id,
      running: this.bot !== null && !["disconnected", "error", "idle"].includes(this.state),
      state: this.state,
      host: this.config?.host ?? null,
      port: this.config?.port ?? null,
      username: this.config?.username ?? null,
      version: this.config?.version ?? null,
      uptime: this.connectedAt ? Math.floor((Date.now() - this.connectedAt) / 1000) : null,
      errorMessage: this.errorMessage ?? null,
      logs: this.logs.slice(-50),
    };
  }

  start(config) {
    this.stopReconnectTimer();
    this.stopBotOnly();
    this.reconnectAttempts = 0;
    this.config = config;
    this.errorMessage = null;
    this.setState("connecting");
    this.addLog("info", `Connecting to ${config.host}:${config.port} as ${config.username}...`);

    const opts = {
      host: config.host,
      port: config.port ?? 25565,
      username: config.username,
      auth: "offline",
    };
    if (config.version) opts.version = config.version;

    try {
      this.bot = mineflayer.createBot(opts);
    } catch (err) {
      this.addLog("error", `Failed to create bot: ${err.message}`);
      this.errorMessage = err.message;
      this.setState("error");
      return;
    }

    this.bot.on("login", () => {
      this.setState("connected");
      this.connectedAt = Date.now();
      this.addLog("info", `Logged in as ${this.bot?.username ?? config.username}`);
    });

    this.bot.on("spawn", () => {
      this.setState("afk");
      this.addLog("info", "Spawned. AFK mode active.");
      this.startAfk();
      this.sendLoginIfNeeded();
    });

    this.bot.on("chat", (username, message) => {
      this.addLog("chat", `<${username}> ${message}`);
      const loginPrompts = ["please login", "register", "/login", "login to play", "please register"];
      if (username !== this.bot?.username && loginPrompts.some((p) => message.toLowerCase().includes(p))) {
        setTimeout(() => {
          if (this.bot && config.password) {
            this.bot.chat(`/login ${config.password}`);
            this.addLog("system", "Re-sent /login after server prompt.");
          }
        }, 500);
      }
    });

    this.bot.on("message", (jsonMsg) => {
      const text = jsonMsg.toString().trim();
      if (text) this.addLog("system", text);
    });

    this.bot.on("kicked", (reason) => {
      const r = typeof reason === "string" ? reason : JSON.stringify(reason);
      this.addLog("error", `Kicked: ${r}`);
      this.errorMessage = `Kicked: ${r}`;
      this.setState("disconnected");
      this.stopAfk();
      this.bot = null;
      this.scheduleReconnect();
    });

    this.bot.on("error", (err) => {
      this.addLog("error", `Error: ${err.message}`);
      this.errorMessage = err.message;
      this.setState("error");
      this.stopAfk();
      this.bot = null;
      this.scheduleReconnect();
    });

    this.bot.on("end", (reason) => {
      this.addLog("info", `Disconnected: ${reason}`);
      this.setState("disconnected");
      this.stopAfk();
      this.bot = null;
      this.connectedAt = null;
      this.scheduleReconnect();
    });
  }

  sendLoginIfNeeded() {
    if (!this.bot || !this.config?.password) return;
    setTimeout(() => {
      if (!this.bot || !this.config?.password) return;
      try {
        this.bot.chat(`/login ${this.config.password}`);
        this.addLog("system", "Sent /login (password hidden)");
      } catch (err) {
        this.addLog("error", `Login failed: ${err.message}`);
      }
    }, 1000);
  }

  scheduleReconnect() {
    if (!this.config || this.reconnectTimer) return;
    const delay = Math.min(30000, 5000 + this.reconnectAttempts * 5000);
    this.addLog("info", `Auto-reconnect in ${Math.floor(delay / 1000)}s (attempt ${this.reconnectAttempts + 1})...`);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.config && ["disconnected", "error"].includes(this.state)) {
        this.reconnectAttempts++;
        this.addLog("info", "Reconnecting...");
        this.start(this.config);
      }
    }, delay);
  }

  stopReconnectTimer() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  stopBotOnly() {
    this.stopAfk();
    if (this.bot) {
      try { this.bot.quit("Restarting"); } catch {}
      this.bot.removeAllListeners();
      this.bot = null;
    }
  }

  startAfk() {
    this.stopAfk();
    const doMovement = () => {
      if (!this.bot || this.state !== "afk") return;
      try {
        this.bot.setControlState("sneak", true);
        setTimeout(() => {
          if (this.bot) {
            this.bot.setControlState("sneak", false);
            const yaw = (this.bot.entity?.yaw ?? 0) + (Math.random() * 0.5 - 0.25);
            this.bot.look(yaw, 0, false);
          }
        }, 500);
      } catch {}
    };
    this.afkInterval = setInterval(() => {
      if (this.bot && this.state === "afk") doMovement();
    }, 30000 + Math.random() * 15000);
    setTimeout(() => doMovement(), 5000);
  }

  stopAfk() {
    if (this.afkInterval) {
      clearInterval(this.afkInterval);
      this.afkInterval = null;
    }
  }

  stop() {
    this.stopReconnectTimer();
    this.stopAfk();
    if (this.bot) {
      try { this.bot.quit("Stopped by user"); } catch {}
      this.bot.removeAllListeners();
      this.bot = null;
    }
    this.setState("idle");
    this.connectedAt = null;
    this.config = null;
    this.reconnectAttempts = 0;
    this.errorMessage = null;
    this.addLog("info", "Bot stopped.");
  }

  rejoin() {
    if (!this.config) throw new Error("No config saved for this slot");
    const cfg = { ...this.config };
    this.stop();
    setTimeout(() => this.start(cfg), 1000);
  }

  sendChat(message) {
    if (!this.bot) throw new Error("Bot is not running");
    this.bot.chat(message.slice(0, 256));
    this.addLog("chat", `[You] ${message}`);
  }

  isRunning() {
    return this.bot !== null && !["disconnected", "error", "idle"].includes(this.state);
  }
}

// ── Global slot registry ──────────────────────────────────────────────────

const slots = new Map();

function getSlot(id) {
  if (id < 1 || id > MAX_SLOTS) throw new Error(`Slot ID must be 1–${MAX_SLOTS}`);
  if (!slots.has(id)) slots.set(id, new BotSlot(id));
  return slots.get(id);
}

export function getAllSlotStatuses() {
  const result = [];
  for (let i = 1; i <= MAX_SLOTS; i++) {
    const slot = slots.get(i);
    result.push(
      slot
        ? slot.getStatus()
        : { id: i, running: false, state: "idle", host: null, port: null, username: null, version: null, uptime: null, errorMessage: null, logs: [] }
    );
  }
  return result;
}

export function getSlotStatus(id) {
  return getSlot(id).getStatus();
}

export function getSlotLogs(id, limit = 100) {
  const slot = slots.get(id);
  return slot ? slot.logs.slice(-limit) : [];
}

export function startSlot(id, config) {
  getSlot(id).start(config);
}

export function stopSlot(id) {
  getSlot(id).stop();
}

export function rejoinSlot(id) {
  getSlot(id).rejoin();
}

export function chatSlot(id, message) {
  getSlot(id).sendChat(message);
}

export function getActiveCount() {
  let count = 0;
  slots.forEach((s) => { if (s.isRunning()) count++; });
  return count;
}

export { MAX_SLOTS };
