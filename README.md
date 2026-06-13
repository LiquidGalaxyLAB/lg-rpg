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

## Installation

### 1. Clone the repository onto the Liquid Galaxy machine

The Flutter controller expects the server scripts at `~/lg-rpg-server/scripts/`. Clone the repo and create the expected symlink:

```bash
git clone https://github.com/LiquidGalaxyLAB/lg-rpg.git ~/lg-rpg
ln -s ~/lg-rpg/lg_rpg_server ~/lg-rpg-server
cd ~/lg-rpg-server
```

### 2. Install server dependencies

```bash
cd ~/lg-rpg-server
cp .env.example .env       # edit PORT, TOTAL_SCREENS, MAX_PLAYERS as needed
npm install
```

### 3. Open port 3000 (required on every boot — see [Networking](#check-3--linux-firewall-blocks-port-3000-on-reboot))

```bash
sudo iptables -I INPUT 1 -p tcp --dport 3000 -j ACCEPT
```

### 4. Start the game server

```bash
npm start
```

The server will be available at `http://<LG-IP>:3000`.

### 5. Build and run the Flutter controller

```bash
cd lg_rpg_controller
flutter pub get
flutter run --dart-define=GAME_SERVER_URL=http://<LG-IP>:3000
```

---

## Networking: Known Issues

Before the game can run over a local network, three common infrastructure problems must be verified and resolved. **Work through all three checks every time you set up on a new network.**

---

### Check 1 — Android Hotspot Routing Trap

**Symptom:** `OS Error: Connection timed out, errno = 110` from the Flutter app on the hotspot phone, while a second phone on the same hotspot reaches the server without issue.

**Root cause (the "split-brain" network):**
When a phone both hosts a Wi-Fi hotspot *and* runs the Flutter app, Android internally routes that app's outbound traffic through the cellular interface (5G/LTE) rather than through the local hotspot subnet. The local IP (`10.x.x.x`) never resolves on the global internet and the connection times out.

**Fix:**

Use a different phone or home router as the Wi-Fi host. The Flutter phone becomes a normal Wi-Fi client and routes all traffic through the local network correctly.

---

### Check 2 — VirtualBox NAT Adapter Has Higher Priority than Host Network

**Symptom:** The Node server starts and port 3000 is open, but the Flutter app still cannot connect. A phone on the same network as the LG machine gets no response, or the connection times out immediately.

**Root cause:**
The Liquid Galaxy Ubuntu machine typically has two network adapters in VirtualBox:

| Adapter | Interface | IP range | Purpose |
|---|---|---|---|
| NAT | `eth0` / `enp0s3` | `10.0.2.x` (internal) | Internet access via the Windows host |
| Bridged / Host-Only | `eth1` / `enp0s8` | same subnet as phones | Reachable by other devices on the local network |

When Ubuntu assigns a **lower metric** to the NAT adapter's default route, the NAT adapter has higher routing priority. Even though the server listens on all interfaces, the VM sends reply packets back out through the NAT adapter — an internal VirtualBox address that no phone can route to. The connection silently fails.

**How to verify:**

SSH into the Liquid Galaxy machine and run:

```bash
route -n
```

In the output, look at the **Metric** column for rows where Destination is `0.0.0.0` (the default route). A **lower metric = higher priority**.

```
# Problem: NAT adapter (eth0) has metric 100, host adapter (eth1) has metric 600
Kernel IP routing table
Destination     Gateway         Genmask         Flags Metric Ref    Use Iface
0.0.0.0         10.0.2.2        0.0.0.0         UG    100    0        0 eth0   ← NAT wins
0.0.0.0         10.110.111.1    0.0.0.0         UG    600    0        0 eth1   ← host network loses
```

If the NAT adapter (`eth0`) has a lower metric than the host adapter (`eth1`), this is the problem.

A correct routing table looks like:

```
# OK: host network adapter has lower metric (higher priority)
Destination     Gateway         Genmask         Flags Metric Ref    Use Iface
0.0.0.0         10.110.111.1    0.0.0.0         UG    100    0        0 eth1   ← host network wins
0.0.0.0         10.0.2.2        0.0.0.0         UG    700    0        0 eth0   ← NAT loses
```

**Fix (Ubuntu 16.04, survives reboots):**

Edit `/etc/network/interfaces` and set an explicit metric for both adapters:

```
auto eth0
iface eth0 inet dhcp
    metric 700

auto eth1
iface eth1 inet dhcp
    metric 100
```

Apply without rebooting:

```bash
sudo ifdown eth0 && sudo ifup eth0
route -n   # confirm the metrics changed
```

---

### Check 3 — Linux Firewall Blocks Port 3000 on Reboot

**Symptom:** After any VM reboot, the Flutter app gets an immediate `Socket Unreachable` error. The Node server starts successfully but packets are silently dropped.

**Root cause:**
Liquid Galaxy Ubuntu rigs ship with strict `iptables` rules that block incoming traffic on all non-whitelisted ports. These rules live in RAM only — **every reboot wipes them**, including any port-3000 rule you added in a previous session.

**How to verify:**

SSH into the Liquid Galaxy machine and run:

```bash
sudo iptables -L INPUT -n --line-numbers | grep 3000
```

If the command returns **no output**, port 3000 is currently blocked.

**Fix — manual (must be repeated after every reboot):**

```bash
sudo iptables -I INPUT 1 -p tcp --dport 3000 -j ACCEPT
```

**Fix — permanent (survives reboots):**

The key point: `iptables-persistent` saves whatever rules are currently loaded in memory. You must **add the port-3000 rule first**, then save — otherwise the saved ruleset will not include it.

```bash
# Step 1 — open port 3000 (if not already done)
sudo iptables -I INPUT 1 -p tcp --dport 3000 -j ACCEPT

# Step 2 — install iptables-persistent
#   When prompted "Save current IPv4 rules?", answer Yes
sudo apt-get install -y iptables-persistent

# Step 3 — save the current rules to disk (including port 3000)
sudo netfilter-persistent save
# This writes to /etc/iptables/rules.v4, which is loaded automatically on boot

# Verify the rule was saved
grep 3000 /etc/iptables/rules.v4
# Expected output:  -A INPUT -p tcp --dport 3000 -j ACCEPT
```

**Fix — automated via the controller:**

The Flutter controller automates the manual fix. When you tap **Start Server** in the Settings page, the app:

1. Generates a `setup.sh` script containing the `iptables` unlock command.
2. Uploads it to the LG machine via SFTP.
3. Executes it over SSH using `echo "$password" | sudo -S bash setup.sh` — opening the port moments before the Node server is launched.

This means the port is always open before the server starts, without requiring a terminal session on the rig.

---

## Third-Party Assets

This project uses pixel-art assets created by independent artists under open licenses.

See **[CREDITS.md](./CREDITS.md)** for the full list of contributors, asset links, and license details.

---

## Repository

[https://github.com/LiquidGalaxyLAB/lg-rpg](https://github.com/LiquidGalaxyLAB/lg-rpg)
