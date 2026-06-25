import {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  TextChannel,
  EmbedBuilder,
  Colors,
  ActivityType,
} from "discord.js";
import { botManager } from "./bot-manager.js";

const STATE_EMOJI = {
  idle: "⚫",
  connecting: "🟡",
  connected: "🟢",
  logging_in: "🔵",
  afk: "🟢",
  disconnected: "🔴",
  error: "🔴",
};

const STATE_COLORS = {
  idle: Colors.Grey,
  connecting: Colors.Yellow,
  connected: Colors.Green,
  logging_in: Colors.Blue,
  afk: Colors.DarkGreen,
  disconnected: Colors.Red,
  error: Colors.DarkRed,
};

const commands = [
  new SlashCommandBuilder()
    .setName("mcbot")
    .setDescription("Minecraft AFK Bot control")
    .addSubcommand((s) =>
      s
        .setName("start")
        .setDescription("Start the Minecraft bot")
        .addStringOption((o) =>
          o.setName("host").setDescription("Server IP / hostname").setRequired(true)
        )
        .addStringOption((o) =>
          o.setName("username").setDescription("Minecraft username").setRequired(true)
        )
        .addStringOption((o) =>
          o.setName("password").setDescription("AuthMe /login password").setRequired(true)
        )
        .addIntegerOption((o) =>
          o.setName("port").setDescription("Server port (default: 25565)")
        )
        .addStringOption((o) =>
          o.setName("version").setDescription("MC version e.g. 1.20.1 (optional)")
        )
    )
    .addSubcommand((s) => s.setName("stop").setDescription("Stop the Minecraft bot"))
    .addSubcommand((s) => s.setName("status").setDescription("Show bot status and recent logs"))
    .addSubcommand((s) =>
      s
        .setName("chat")
        .setDescription("Send a chat message through the bot")
        .addStringOption((o) =>
          o.setName("message").setDescription("Message to send").setRequired(true)
        )
    )
    .addSubcommand((s) =>
      s.setName("setlog").setDescription("Stream live bot logs to this channel")
    )
    .addSubcommand((s) =>
      s.setName("unsetlog").setDescription("Stop log streaming in this channel")
    ),
];

class DiscordBot {
  constructor(token) {
    this.token = token;
    this.client = new Client({ intents: [GatewayIntentBits.Guilds] });
    this.logChannels = new Set();
    this.logBuffer = [];
    this.logFlushTimer = null;

    const defaultChannel = process.env.DISCORD_CHANNEL_ID;
    if (defaultChannel) {
      this.logChannels.add(defaultChannel);
      this.startLogFlusher();
    }

    this.client.on("clientReady", () => {
      console.log(`[Discord] Logged in as ${this.client.user.tag}`);
      this.client.user.setActivity("Minecraft AFK Bot", { type: ActivityType.Watching });
      this.registerCommands().catch(console.error);
    });

    this.client.on("interactionCreate", async (interaction) => {
      if (!interaction.isChatInputCommand() || interaction.commandName !== "mcbot") return;
      await this.handleCommand(interaction).catch(console.error);
    });

    this.client.on("error", (err) => console.error("[Discord] Client error:", err));

    botManager.on("log", (entry) => this.queueLog(entry));
    botManager.on("stateChange", (state) => {
      const emoji = STATE_EMOJI[state] ?? "⚪";
      this.client.user?.setActivity(`${emoji} MC Bot: ${state.toUpperCase()}`, {
        type: ActivityType.Watching,
      });
    });
  }

  queueLog(entry) {
    if (this.logChannels.size === 0) return;
    const time = new Date(entry.time).toLocaleTimeString("en-US", { hour12: false });
    const prefix =
      entry.type === "error" ? "🔴" : entry.type === "chat" ? "💬" : "🟢";
    this.logBuffer.push(`\`${time}\` ${prefix} ${entry.message}`);
  }

  startLogFlusher() {
    if (this.logFlushTimer) return;
    this.logFlushTimer = setInterval(async () => {
      if (this.logBuffer.length === 0 || this.logChannels.size === 0) return;
      const lines = this.logBuffer.splice(0, 10);
      const content = lines.join("\n").slice(0, 1990);
      for (const channelId of this.logChannels) {
        try {
          const ch = await this.client.channels.fetch(channelId);
          if (ch instanceof TextChannel) await ch.send(content);
        } catch {
          this.logChannels.delete(channelId);
        }
      }
    }, 3000);
  }

  stopLogFlusher() {
    if (this.logFlushTimer) {
      clearInterval(this.logFlushTimer);
      this.logFlushTimer = null;
    }
  }

  async registerCommands() {
    const rest = new REST().setToken(this.token);
    const appId = this.client.user.id;
    const guildId = process.env.DISCORD_GUILD_ID;

    if (guildId) {
      await rest.put(Routes.applicationGuildCommands(appId, guildId), {
        body: commands.map((c) => c.toJSON()),
      });
      console.log(`[Discord] Slash commands registered for guild ${guildId} (instant)`);
    } else {
      await rest.put(Routes.applicationCommands(appId), {
        body: commands.map((c) => c.toJSON()),
      });
      console.log("[Discord] Slash commands registered globally (up to 1 hour)");
    }
  }

  async handleCommand(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === "start") {
      if (botManager.isRunning()) {
        return interaction.reply({
          content: "⚠️ Bot is already running. Use `/mcbot stop` first.",
          ephemeral: true,
        });
      }
      const host = interaction.options.getString("host", true);
      const username = interaction.options.getString("username", true);
      const password = interaction.options.getString("password", true);
      const port = interaction.options.getInteger("port") ?? 25565;
      const version = interaction.options.getString("version");

      await interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(Colors.Yellow)
            .setTitle("🟡 Connecting...")
            .setDescription(`Connecting to **${host}:${port}** as **${username}**`)
            .setTimestamp(),
        ],
      });
      botManager.start({ host, port, username, password, version: version ?? null });
    }

    else if (sub === "stop") {
      if (!botManager.isRunning()) {
        return interaction.reply({ content: "⚫ Bot is not running.", ephemeral: true });
      }
      botManager.stop();
      await interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(Colors.Grey)
            .setTitle("⚫ Bot Stopped")
            .setDescription("The Minecraft bot has been stopped.")
            .setTimestamp(),
        ],
      });
    }

    else if (sub === "status") {
      const status = botManager.getStatus();
      const emoji = STATE_EMOJI[status.state] ?? "⚪";
      const color = STATE_COLORS[status.state] ?? Colors.Grey;
      const uptimeStr = status.uptime
        ? `${String(Math.floor(status.uptime / 3600)).padStart(2, "0")}:${String(Math.floor((status.uptime % 3600) / 60)).padStart(2, "0")}:${String(status.uptime % 60).padStart(2, "0")}`
        : "N/A";
      const recentLogs = status.logs
        .slice(-8)
        .map((l) => {
          const t = new Date(l.time).toLocaleTimeString("en-US", { hour12: false });
          const p = l.type === "error" ? "🔴" : l.type === "chat" ? "💬" : "🟢";
          return `\`${t}\` ${p} ${l.message}`;
        })
        .join("\n");

      const embed = new EmbedBuilder()
        .setColor(color)
        .setTitle(`${emoji} MC Bot Status`)
        .addFields(
          { name: "State", value: status.state.toUpperCase(), inline: true },
          { name: "Running", value: status.running ? "Yes" : "No", inline: true },
          { name: "Uptime", value: uptimeStr, inline: true }
        );
      if (status.host) embed.addFields({ name: "Server", value: `${status.host}:${status.port}`, inline: true });
      if (status.username) embed.addFields({ name: "Username", value: status.username, inline: true });
      if (recentLogs) embed.addFields({ name: "Recent Logs", value: recentLogs.slice(0, 1000) });
      embed.setTimestamp();
      await interaction.reply({ embeds: [embed] });
    }

    else if (sub === "chat") {
      if (!botManager.isRunning()) {
        return interaction.reply({ content: "⚫ Bot is not connected.", ephemeral: true });
      }
      const message = interaction.options.getString("message", true);
      botManager.sendChat(message);
      await interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(Colors.Green)
            .setDescription(`💬 Sent: **${message}**`)
            .setTimestamp(),
        ],
      });
    }

    else if (sub === "setlog") {
      this.logChannels.add(interaction.channelId);
      this.startLogFlusher();
      await interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(Colors.Green)
            .setTitle("✅ Log channel set")
            .setDescription("Live Minecraft bot logs will appear here.\nUse `/mcbot unsetlog` to stop.")
            .setTimestamp(),
        ],
      });
    }

    else if (sub === "unsetlog") {
      this.logChannels.delete(interaction.channelId);
      if (this.logChannels.size === 0) this.stopLogFlusher();
      await interaction.reply({
        content: "🔇 Log streaming stopped for this channel.",
        ephemeral: true,
      });
    }
  }

  async login() {
    await this.client.login(this.token);
  }
}

export async function startDiscordBot() {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) {
    console.warn("[Discord] DISCORD_BOT_TOKEN not set — Discord bot will not start.");
    return;
  }
  try {
    const bot = new DiscordBot(token);
    await bot.login();
    console.log("[Discord] Bot started successfully.");
  } catch (err) {
    console.error("[Discord] Failed to start bot:", err);
  }
}
