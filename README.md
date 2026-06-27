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
        │          Liquid Galaxy (Ubuntu VM)        │
        │                                           │
        │  ┌──────────────┐   ┌───────────────────┐│
        │  │  Node.js     │◄──│  Chromium         ││
        │  │  Server :3000│   │  (across screens) ││
        │  └──────┬───────┘   └───────────────────┘│
        └─────────┼──────────────────────────────────┘
                  │ Socket.IO (WebSocket)
        ┌─────────┴──────────┐
        │   Flutter App      │  ← Android phone
        │   (Controller)     │  SSH + Socket.IO
        └────────────────────┘
```

---

## Prerequisites

### On the Liquid Galaxy machine

- Node.js v16.20.2 (via [nvm](https://github.com/nvm-sh/nvm) or [Volta](https://volta.sh/))
- `npm`
- `curl` (for the server health-check script)

### On the player's phone

- Android 5.0+ device
- Flutter SDK ≥ 3.0.0 (only if building from source)

---

## Setup

You only install things once. After that, everything — starting/stopping the
server, opening the firewall port, and launching the LG screens — is driven from
the controller app. You don't normally touch a terminal on the rig.

### 1. Install the server (one-time, on the Liquid Galaxy machine)

The controller expects the server scripts at `~/lg-rpg-server/scripts/`, so clone
the repo and create that symlink:

```bash
git clone https://github.com/LiquidGalaxyLAB/lg-rpg.git ~/lg-rpg
ln -s ~/lg-rpg/lg_rpg_server ~/lg-rpg-server
cd ~/lg-rpg-server
cp .env.example .env       # configure it — see below
npm install
```

That's it on the LG side — **don't** start the server or open the port by hand;
the controller does both for you (next section).

### Configuration (`.env`)

| Variable | Purpose |
|---|---|
| `PORT` | Server port (default `3000`). |
| `TOTAL_SCREENS` | Number of LG screens (game screens + 1 leaderboard screen). |
| `MAX_PLAYERS` | Max players allowed in a lobby. |
| `CORS_ORIGIN` | Allowed web origin (`*` is fine for a local rig). |

#### AI Cheerleader (optional)

The game ships with an AI commentary duo (Curly & Julie) that reacts to the match
live. It's **optional** — the game runs fine without it. It uses **Google Gemini**
to write the dialogue and **AWS Polly** to voice it, so it needs API keys:

| Variable | Purpose |
|---|---|
| `CHEERLEADER_ENABLED` | Set to `true` to turn the commentary on. |
| `GEMINI_API_KEY` | Google Gemini API key — **required** for the cheerleader to run; without it the commentary stays off. |
| `AWS_ACCESS_KEY_ID` | AWS access key for Polly text-to-speech. |
| `AWS_SECRET_ACCESS_KEY` | AWS secret key for Polly. |
| `AWS_REGION` | AWS region for Polly (defaults to `ap-south-1`). |

Notes:
- With `CHEERLEADER_ENABLED=true` **and** a valid `GEMINI_API_KEY`, the commentary turns on. If either is missing, it silently stays off and the game plays normally.
- The Gemini key drives the **text**; the AWS keys drive the **voice**. If the AWS keys are missing, lines are still generated but go unvoiced (logged as a warning).
- Get a Gemini key from [Google AI Studio](https://aistudio.google.com/apikey), and AWS keys from the [AWS IAM console](https://console.aws.amazon.com/iam/) (the user needs `polly:SynthesizeSpeech` permission).

### 2. Install the controller (on your phone)

Install the APK, or build from source:

```bash
cd lg_rpg_controller
flutter pub get
flutter run
```

---

## Running a session (from the controller)

1. Open the app → **Settings** → enter the LG machine's **IP, SSH username,
   password, and screen count** → **Connect**.
2. Tap **Start the Server**. This automatically opens port 3000 on the rig (it
   injects the firewall rule over SSH) and starts the Node server.
3. Tap **Launch Browser** to open the game across the LG screens.
4. Go back to **Home** → **Connect to Server** → pick a mode → **Play**.
5. When you're done, use **Stop the Server** and **Close Browser** from Settings.

Because the controller opens the port every time you press **Start the Server**,
the firewall self-heals after a reboot — no manual `iptables` step needed.

---

## Running the server manually (optional / for development)

If you'd rather run the server yourself on the LG instead of from the controller,
you must open the firewall port yourself first — this is the same rule the
controller injects automatically:

```bash
sudo iptables -I INPUT 1 -p tcp --dport 3000 -j ACCEPT   # only needed for manual starts
cd ~/lg-rpg-server
npm start
```

The server is then available at `http://<LG-IP>:3000`. To make the port survive
reboots without the controller, see [ISSUES.md](./ISSUES.md).

---

## Networking: Known Issues

If a phone can't reach the server over the local network, it's usually one of three things: a hotspot routing trap, a VirtualBox adapter priority issue, or the firewall blocking port 3000 after a reboot.

See **[ISSUES.md](./ISSUES.md)** for symptoms, checks, and fixes for each.

---

## Third-Party Assets

This project uses pixel-art assets created by independent artists under open licenses.

See **[CREDITS.md](./CREDITS.md)** for the full list of contributors, asset links, and license details.

---

## Repository

[https://github.com/LiquidGalaxyLAB/lg-rpg](https://github.com/LiquidGalaxyLAB/lg-rpg)
