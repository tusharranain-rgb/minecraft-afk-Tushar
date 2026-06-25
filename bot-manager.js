import mineflayer from "mineflayer";
import { EventEmitter } from "node:events";

class BotManager extends EventEmitter {
  constructor() {
    super();
    this.bot = null;
    this.config = null;
    this.state = "idle";
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
    console.log(`[${type.toUpperCase()}] ${message}`);
    this.emit("log", entry);
  }

  setState(state) {
    this.state = state;
    this.emit("stateChange", state);
  }

  getStatus() {
    return {
      running: this.bot !== null && !["disconnected", "error", "idle"].includes(this.state),
      state: this.state,
      host: this.config?.host ?? null,
      port: this.config?.port ?? null,
      username: this.config?.username ?? null,
      uptime: this.connectedAt ? Math.floor((Date.now() - this.connectedAt) / 1000) : null,
      logs: [...this.logs],
    };
  }

  start(config) {
    this.stopReconnectTimer();
    this.stopBotOnly();
    this.reconnectAttempts = 0;
    this.config = config;
    this.setState("connecting");
    this.errorMessage = null;
    this.addLog("info", `Connecting to ${config.host}:${config.port} as ${config.username}...`);

    const opts = {
      host: config.host,
      port: config.port,
      username: config.username,
      auth: "offline",
    };
    if (config.version) opts.version = config.version;

    this.bot = mineflayer.createBot(opts);

    this.bot.on("login", () => {
      this.setState("connected");
      this.connectedAt = Date.now();
      this.addLog("info", `Logged in as ${this.bot?.username ?? config.username}`);
    });

    this.bot.on("spawn", () => {
      this.setState("afk");
      this.addLog("info", "Spawned in world. AFK mode active.");
      this.startAfk();
      this.sendLoginIfNeeded();
    });

    this.bot.on("chat", (username, message) => {
      this.addLog("chat", `[${username}]: ${message}`);
      const loginPrompts = ["please login", "register", "/login", "login to play"];
      if (
        username !== this.bot?.username &&
        loginPrompts.some((p) => message.toLowerCase().includes(p))
      ) {
        setTimeout(() => {
          if (this.bot && config.password) {
            this.bot.chat(`/login ${config.password}`);
            this.addLog("system", "Re-sent /login after server prompt.");
          }
        }, 500);
      }
    });

    this.bot.on("message", (jsonMsg) => {
      const text = jsonMsg.toString();
      if (text?.trim()) this.addLog("system", text);
    });

    this.bot.on("kicked", (reason) => {
      this.setState("disconnected");
      this.stopAfk();
      this.bot = null;
      this.addLog("error", `Kicked from server: ${reason}`);
      this.scheduleReconnect();
    });

    this.bot.on("error", (err) => {
      this.setState("error");
      this.stopAfk();
      this.bot = null;
      this.addLog("error", `Bot error: ${err.message}`);
      this.scheduleReconnect();
    });

    this.bot.on("end", (reason) => {
      this.setState("disconnected");
      this.stopAfk();
      this.bot = null;
      this.connectedAt = null;
      this.addLog("info", `Disconnected: ${reason}`);
      this.scheduleReconnect();
    });
  }

  sendLoginIfNeeded() {
    if (!this.bot || !this.config?.password) return;
    setTimeout(() => {
      if (!this.bot || !this.config?.password) return;
      try {
        this.bot.chat(`/login ${this.config.password}`);
        this.addLog("system", "Sent: /login *** (password hidden)");
      } catch (err) {
        this.addLog("error", `Failed to send login: ${err}`);
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
        this.addLog("info", "Reconnecting automatically...");
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
      try { this.bot.quit("Restarting bot"); } catch {}
      this.bot.removeAllListeners();
      this.bot = null;
    }
  }

  startAfk() {
    this.stopAfk();

    const doMovement = () => {
      if (!this.bot || this.state !== "afk") return;
      try {
        this.addLog("info", "[Anti-AFK] Moving forward...");
        this.bot.setControlState("forward", true);

        setTimeout(() => {
          if (!this.bot) return;
          this.bot.setControlState("forward", false);

          setTimeout(() => {
            if (!this.bot || this.state !== "afk") return;
            this.addLog("info", "[Anti-AFK] Moving back...");
            this.bot.setControlState("back", true);

            setTimeout(() => {
              if (!this.bot) return;
              this.bot.setControlState("back", false);
              this.bot.clearControlStates();
            }, 1200);
          }, 400);
        }, 1200);

        const variant = Math.floor(Math.random() * 3);
        if (variant === 0) {
          setTimeout(() => {
            if (!this.bot || this.state !== "afk") return;
            this.bot.setControlState("jump", true);
            setTimeout(() => {
              if (this.bot) this.bot.setControlState("jump", false);
            }, 200);
          }, 600);
        } else if (variant === 1 && this.bot.entity) {
          const yaw = this.bot.entity.yaw + (Math.random() * 0.4 - 0.2);
          this.bot.look(yaw, 0, false);
        }
      } catch {}
    };

    const intervalMs = (3.5 + Math.random()) * 60 * 1000;
    this.afkInterval = setInterval(() => {
      if (this.bot && this.state === "afk") doMovement();
    }, intervalMs);

    setTimeout(() => {
      if (this.bot && this.state === "afk") doMovement();
    }, 10000);
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
    this.addLog("info", "Bot stopped.");
  }

  sendChat(message) {
    if (!this.bot) throw new Error("Bot is not running");
    this.bot.chat(message);
    this.addLog("chat", `[You]: ${message}`);
  }

  isRunning() {
    return this.bot !== null && !["disconnected", "error", "idle"].includes(this.state);
  }
}

export const botManager = new BotManager();
