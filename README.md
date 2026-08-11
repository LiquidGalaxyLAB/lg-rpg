# LG RPG

A real-time multiplayer RPG built for [Liquid Galaxy](https://www.liquidgalaxy.eu/) — a multi-screen panoramic display rig. Players join from their Android phones via a Flutter controller app and explore a shared world rendered simultaneously across all LG screens.

> This project uses third-party pixel-art assets. See [CREDITS.md](./CREDITS.md) for the full list of artists and licenses.

---

## Architecture

| Component | Path | Role |
|---|---|---|
| **Game Server** | `lg_rpg_server/` | Node.js + Socket.IO server; serves the Phaser 4 web client to LG screens |
| **Controller App** | `lg_rpg_controller/` | Flutter mobile app; joins the lobby, moves the character, and manages the LG rig over SSH |

```
        ┌──────────────────────────────────────────┐
        │          Liquid Galaxy (Ubuntu VM)       │
        │                                          │
        │  ┌──────────────┐   ┌───────────────────┐│
        │  │  Node.js     │◄──│  Chromium         ││
        │  │  Server :8111│   │  (across screens) ││
        │  └──────┬───────┘   └───────────────────┘│
        └─────────┼────────────────────────────────┘
                  │ Socket.IO (WebSocket)
        ┌─────────┴──────────┐
        │   Flutter App      │  ← Android phone
        │   (Controller)     │  SSH + Socket.IO
        └────────────────────┘
```

---

## Installation

Installation happens once, on the **Liquid Galaxy master** (Ubuntu 16.04). After
that, everything — starting/stopping the server and launching the LG screens —
is driven from the controller app.

### 1. Install Node.js 16 via nvm (on the LG master)

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
source ~/.nvm/nvm.sh
nvm install 16
nvm alias default 16
node -v    # must print v16.x
npm -v     # must print 8.x
```

### 2. Get the code

If a previous install exists and you want a clean reinstall, first run:
`pkill -9 -f server.js; sudo rm -rf ~/lg-rpg`

```bash
git clone https://github.com/LiquidGalaxyLAB/lg-rpg.git ~/lg-rpg
ln -sfn ~/lg-rpg/lg_rpg_server ~/lg-rpg-server
cd ~/lg-rpg-server
npm install
cp .env.example .env
```

The `~/lg-rpg-server` symlink is required — the controller app expects the
server at that path.

### 3. Verify the server — do not skip this step

```bash
source ~/.nvm/nvm.sh
cd ~/lg-rpg-server
node server.js
```

You must see the line `Server is running at port 8111`. Press `Ctrl+C` and
continue. Don't leave it running — the controller app starts and stops the
server for you.

### 4. Install the controller app (on your phone)

Install the APK on your Android phone, or build from source:

```bash
cd lg_rpg_controller
flutter pub get
flutter run
```

---

## Configuration (`.env`) — optional

The game runs fine with the default `.env`. Editing `~/lg-rpg-server/.env` is
only needed for the **AI cheerleader** — a live commentary duo that reacts to
the match. To enable it, set:

- `CHEERLEADER_ENABLED=true`
- `GEMINI_API_KEY=` your key from [Google AI Studio](https://aistudio.google.com/apikey)

If either is missing, the commentary stays off and the game plays normally. The
voice uses free Microsoft Edge TTS — no extra key needed.

---

## The controller app

| Page | What it does |
|---|---|
| **Home** | Once connected to the server and master, select a game mode and press Play Game. |
| **Loadout** | Pick your character and up to 4 items (power-ups + health) to use during matches. Each has a cooldown; tap a selected item again to deselect it. |
| **Map** | Map and Google Earth sync — fly to locations with 3D KML and orbit. |
| **LG Tasks** | Basic Liquid Galaxy tasks: show logo, clean KML, relaunch, reboot. |

---

## Running the game

1. Open the app → **Settings** → fill in the master's **IP**, **username** (`lg`),
   **password**, **SSH port** (`22`), and **screen number** (**3 or 5 only**) →
   **Connect to Master**.
2. Tap **Start Server**. If anything is wrong (Node missing, invalid screen
   number, crashed server), a message saying exactly what failed appears within
   a few seconds.
3. Tap **Launch Browser** — the game appears across the LG screens.
4. Go back to **Home** → enter your player name → **Connect to Server**.
5. Select the game mode (the first player to connect is the host and picks the
   mode) → **Play Game**.

### Multiplayer

- On **each** phone: **Settings** → same details (same screen number) → **Connect to Master**.
- From **one** phone: **Start Server** → **Launch Browser**.
- On **every** phone: **Home** → **Connect to Server**.
- The first phone to connect is the host — it picks the mode (and teams, in PvP) and presses **Play Game**.

### Changing the screen number (3 ↔ 5)

Order matters:

**Close Browser** → **Stop Server** → **Disconnect from Master** → enter the new
screen number → **Connect to Master** → **Start Server** → **Launch Browser**.

---

## If something goes wrong

Error messages in the app state the actual cause — read them first. Server logs
live on the master in `~/lg-rpg-server/logs/`. For known issues and fixes, see
**[ISSUES.md](./ISSUES.md)**.

---

## Third-Party Assets

This project uses pixel-art assets created by independent artists under open licenses.

See **[CREDITS.md](./CREDITS.md)** for the full list of contributors, asset links, and license details.
