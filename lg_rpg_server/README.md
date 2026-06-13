# LG RPG Server

The game server for the [Liquid Galaxy RPG](https://github.com/LiquidGalaxyLAB/lg-rpg) project. It serves a [Phaser 4](https://phaser.io/) web client to LG screens and manages real-time multiplayer state via [Socket.IO](https://socket.io/).

---

## Stack

| Technology | Version | Purpose |
|---|---|---|
| [Node.js](https://nodejs.org/) | 16.20.2 | Runtime (pinned via Volta) |
| [Express](https://expressjs.com/) | ^4.19 | Static file serving + REST API |
| [Socket.IO](https://socket.io/) | ^4.8 | Real-time WebSocket multiplayer |
| [Phaser](https://phaser.io/) | ^4.1 | Browser-side game engine (runs on LG screens) |
| [lowdb](https://github.com/typicode/lowdb) | ^6.1 | Lightweight JSON persistence |
| [easystarjs](https://github.com/prettymuchbryce/easystarjs) | ^0.4 | A* pathfinding |
| [qrcode](https://github.com/soldair/node-qrcode) | ^1.5 | QR code generation for server URL |
| [dotenv](https://github.com/motdotla/dotenv) | ^17 | Environment variable loading |

---

## Setup

The Flutter controller expects the server to be accessible at `~/lg-rpg-server/` on the Liquid Galaxy machine. From the root of the cloned repository:

```bash
# From the project root on the LG machine
ln -s ~/lg-rpg/lg_rpg_server ~/lg-rpg-server
cd ~/lg-rpg-server
cp .env.example .env
npm install
```

### Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | Port the server listens on |
| `TOTAL_SCREENS` | `3` | Number of LG screens (used for map selection) |
| `MAX_PLAYERS` | `4` | Maximum concurrent players in a lobby |
| `CORS_ORIGIN` | `*` | Allowed CORS origins for Socket.IO |

---

## Running

```bash
npm start          # production
npm run dev        # development with nodemon auto-reload
```

Verify the server is up:

```bash
curl http://localhost:3000/api/health
# → {"ok":true}
```

---

## API Endpoints

| Method | Path | Response |
|---|---|---|
| `GET` | `/api/health` | `{ "ok": true }` — liveness check |
| `GET` | `/api/config` | Server config: screen count, max players, selected mode, map |

---

## Game Modes

| ID | Label | Description |
|---|---|---|
| `pvp` | PvP Mode | Players compete against each other |
| `zombie` | Zombie Mode | Survival co-op |

The lobby host selects the mode from the Flutter controller before starting the game.

---

## Socket Events

| Event | Direction | Payload | Description |
|---|---|---|---|
| `joinLobby` | Client → Server | `{ playerId, name }` | Join or re-join the lobby |
| `leaveLobby` | Client → Server | `{ playerId }` | Leave the lobby |
| `selectGameMode` | Client → Server | `{ mode }` | Host selects a game mode |
| `startGame` | Client → Server | — | Host starts the game |
| `move` | Client → Server | `{ playerId, dx, dy }` | Send movement delta (−1 to 1) |
| `updateLobby` | Server → All | `{ players, hostId, selectedMode }` | Current lobby state |
| `gameStarted` | Server → All | `{ selectedMode, map, startedBy }` | Game has started |
| `gameState` | Server → All | `{ players: [{ playerId, name, x, y }] }` | 60 Hz position tick |
| `lobbyError` | Server → Client | `{ message }` | Error for invalid actions |

---

## Scripts

Located in `scripts/` and invoked remotely by the Flutter controller over SSH:

| Script | Description |
|---|---|
| `start-server.sh <screens>` | Start the Node server (idempotent — skips if already running) |
| `stop-server.sh` | Kill the running Node server process |
| `launch-browsers.sh <screens>` | Open Chromium on each LG screen pointing to the game |
| `close-browsers.sh <screens>` | Close Chromium on all screens |

---

## Firewall

Port 3000 is blocked by default on Liquid Galaxy Ubuntu machines and resets to blocked on every reboot. Before starting the server after any reboot, run:

```bash
sudo iptables -I INPUT 1 -p tcp --dport 3000 -j ACCEPT
```

The Flutter controller automates this step when **Start Server** is tapped. See the [root README networking section](../README.md#networking-known-issues) for full diagnosis and fix details.
