# LG RPG Server

The game server for the [Liquid Galaxy RPG](https://github.com/LiquidGalaxyLAB/lg-rpg) project. It serves the browser game to the LG screens and runs the authoritative multiplayer simulation.

---

## Stack

Node.js 16 with [Express](https://expressjs.com/) for static files and a small REST surface, and [Socket.IO](https://socket.io/) for real-time multiplayer. The browser client is [Phaser 4](https://phaser.io/), loaded from a CDN in `public/index.html` — so the LG machine needs internet access the first time the screens open the game. The AI cheerleader uses Google Gemini for its lines and Microsoft Edge TTS for the voice.

Exact dependency versions live in `package.json`.

---

## Setup

The Flutter controller expects the server at `~/lg-rpg-server/` on the Liquid Galaxy machine:

```bash
ln -s ~/lg-rpg/lg_rpg_server ~/lg-rpg-server
cd ~/lg-rpg-server
cp .env.example .env
npm install
```

### Environment variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `8111` | Port the server listens on (whitelisted on the LG firewall) |
| `TOTAL_SCREENS` | `3` | Number of LG screens (used for map selection) |
| `MAX_PLAYERS` | `4` | Maximum concurrent players in a lobby |
| `CORS_ORIGIN` | `*` | Allowed CORS origins for Socket.IO |
| `CHEERLEADER_ENABLED` | `true` | Turn the AI commentary duo on or off |
| `GEMINI_API_KEY` | — | Key from [Google AI Studio](https://aistudio.google.com/apikey); without it the commentary stays silent |

---

## Running

```bash
npm start          # production
npm run dev        # development with nodemon auto-reload
```

You should see `Server is running at port 8111`. Check it from anywhere on the network:

```bash
curl http://localhost:8111/api/health
# → {"ok":true}
```

Logs are mirrored to `logs/server.log`.

---

## Game modes

| ID | Label | Description |
|---|---|---|
| `zombie` | Zombie Mode | Co-op survival against waves of enemies. This is the default. |
| `pvp` | PvP Mode | Zone Capture — two teams fight to hold zones and score over a set of rounds. |

The lobby host picks the mode from the Flutter controller before starting the match. Each mode has its own maps under `public/assets/maps/<mode>/`, selected by screen count.

---

## Scripts

Located in `scripts/` and invoked remotely by the Flutter controller over SSH. Every argument is optional and falls back to the default shown.

| Script | Arguments | Description |
|---|---|---|
| `start-server.sh` | `<screens=3> <port=8111>` | Start the Node server (idempotent — skips if already running on the same screen count) |
| `stop-server.sh` | — | Kill the running Node server process |
| `launch-browsers.sh` | `<screens=3> <port=8111> <server-ip> <ssh-password=lg>` | Open Chromium on each LG screen pointing to the game |
| `close-browsers.sh` | `<screens=3> <ssh-password=lg>` | Close Chromium on all screens |

---

## Client/server protocol

The Socket.IO event names, game phases, and the shared loadout/character catalogs are defined once in `public/shared_constants.js` and imported by the server, the browser client, and mirrored in the controller app. Read that file rather than a table here — it is the source of truth.

The only HTTP endpoints are `GET /api/health` (liveness) and `GET /api/config` (bootstrap config the browser client fetches on load).

---

## Firewall

Liquid Galaxy Ubuntu machines block all non-whitelisted ports with `iptables`, and those rules reset on every reboot. The server runs on **8111**, which is whitelisted on a stock rig, so there is nothing to do here — the port is open out of the box.

This only becomes a problem if you override `PORT` to something outside the whitelist. In that case, open it after every reboot:

```bash
sudo iptables -I INPUT 1 -p tcp --dport <PORT> -j ACCEPT
```

The Flutter controller also inserts this rule when **Start Server** is tapped. See **[ISSUES.md](../ISSUES.md)** for networking diagnosis and fixes.
