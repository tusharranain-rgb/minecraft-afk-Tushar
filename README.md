# Minecraft 24/7 AFK Bot 🎮

Discord slash commands se control hone wala Minecraft AFK bot.

## Features
- ✅ Auto-login (`/login password`) on spawn
- ✅ Anti-AFK movement (1 block forward + 1 block back har ~4 minute)
- ✅ Auto-reconnect on kick/disconnect
- ✅ Discord slash commands: `/mcbot start/stop/status/chat/setlog`
- ✅ Live logs Discord channel pe stream hote hain

## Discord Commands
| Command | Description |
|---------|-------------|
| `/mcbot start host: username: password:` | Bot shuru karo |
| `/mcbot stop` | Bot band karo |
| `/mcbot status` | Status + recent logs dekho |
| `/mcbot chat message:hello` | MC server pe message bhejo |
| `/mcbot setlog` | Is channel pe live logs shuru karo |
| `/mcbot unsetlog` | Live logs band karo |

## Setup

### 1. Install karo
```bash
npm install
```

### 2. .env file banao
```bash
cp .env.example .env
```
Phir `.env` file mein apni values daalo.

### 3. Local chalao
```bash
npm start
```

## Render pe FREE Deploy karo (24/7)

1. GitHub pe repo banao aur code upload karo
2. [render.com](https://render.com) pe jaao → New → Web Service
3. GitHub repo connect karo
4. Settings:
   - **Build Command:** `npm install`
   - **Start Command:** `node src/index.js`
   - **Plan:** Free
5. Environment Variables add karo:
   - `DISCORD_BOT_TOKEN`
   - `DISCORD_CHANNEL_ID`
   - `DISCORD_GUILD_ID`
6. Deploy karo!

### UptimeRobot se 24/7 jaagta rakho (FREE)
1. [uptimerobot.com](https://uptimerobot.com) pe account banao
2. New Monitor → HTTP(s)
3. URL: `https://tumhara-app.onrender.com/`
4. Interval: 5 minutes
5. Save!

## API Endpoints (Optional)
```
GET  /           — Health check
GET  /bot/status — Bot ka status
POST /bot/start  — Bot shuru karo { host, port, username, password, version }
POST /bot/stop   — Bot band karo
POST /bot/chat   — Message bhejo { message }
```
