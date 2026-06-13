# LG RPG Controller

The Flutter mobile controller app for [Liquid Galaxy RPG](https://github.com/LiquidGalaxyLAB/lg-rpg). Players use this app to join the game lobby, pick a character, and move their avatar with an on-screen joystick.

The app also manages the Liquid Galaxy rig directly over SSH — opening the firewall, starting and stopping the Node.js game server, and launching or closing Chromium across all LG screens.

---

## Stack

| Package | Version | Purpose |
|---|---|---|
| [flutter_riverpod](https://riverpod.dev/) | ^2.5 | State management |
| [dartssh2](https://pub.dev/packages/dartssh2) | ^2.10 | SSH connection + SFTP file uploads to Liquid Galaxy |
| [socket_io_client](https://pub.dev/packages/socket_io_client) | ^2.0 | Real-time WebSocket connection to the game server |
| [mobile_scanner](https://pub.dev/packages/mobile_scanner) | ^7.0 | QR code scanning for server URL discovery |
| [flutter_joystick](https://pub.dev/packages/flutter_joystick) | ^0.2 | On-screen joystick for player movement |
| [circular_menu](https://pub.dev/packages/circular_menu) | ^4.0 | Radial action menu |
| [flutter_secure_storage](https://pub.dev/packages/flutter_secure_storage) | ^10.0 | Encrypted storage for SSH credentials |
| [shared_preferences](https://pub.dev/packages/shared_preferences) | ^2.2 | Persistent player settings |
| [uuid](https://pub.dev/packages/uuid) | ^4.4 | Persistent player identity token |

---

## Architecture

The app follows a clean-architecture layout across three layers:

```
lib/
├── core/            # App-wide constants, DI container, error types
├── data/            # Datasources (SSH, Socket.IO, local storage), models, repository impls
├── domain/          # Entities, repository interfaces, use cases
└── ui/              # Pages, Riverpod providers, widgets
```

**Two independent runtime flows:**

```
SSH flow (LG control)
  SettingsPage → ConnectionProvider → LgRepositoryImpl → SshService (dartssh2)
                                                        → runs scripts on LG via SSH

Game flow (multiplayer)
  HomePage → GameProviders → GameServerRepositoryImpl → SocketService (socket_io_client)
                                                       → Socket.IO server on LG
```

---

## Prerequisites

- Flutter SDK ≥ 3.0.0 and Dart SDK ≥ 3.0.0
- Android 5.0+ device (or iOS 12+ with appropriate signing)
- A running [LG RPG Server](../lg_rpg_server/README.md) on the Liquid Galaxy machine

---

## Setup

```bash
cd lg_rpg_controller
flutter pub get
```

### Server URL

The game server URL is injected at build time via `--dart-define`. The default fallback in `lib/core/constant/game_constants.dart` is `http://10.129.32.94:3000` — override it for your network:

```bash
flutter run --dart-define=GAME_SERVER_URL=http://<LG-IP>:3000
```

---

## Building

```bash
# Run on a connected device (debug)
flutter run --dart-define=GAME_SERVER_URL=http://<LG-IP>:3000

# Release APK
flutter build apk --dart-define=GAME_SERVER_URL=http://<LG-IP>:3000

# Release App Bundle (Play Store)
flutter build appbundle --dart-define=GAME_SERVER_URL=http://<LG-IP>:3000
```

---

## Pages

| Page | File | Description |
|---|---|---|
| Settings | `settings_page.dart` | Enter LG SSH credentials; connect, start/stop server |
| Home / Lobby | `home_page.dart` | Enter player name, join lobby, select game mode, start game |
| Controller | `controller_page.dart` | Joystick input — sends `move` events to the server |
| Inventory | `inventory_page.dart` | Player inventory view |
| Quests | `quest_page.dart` | Active quest tracker |
| Action Wheel | `wheel_page.dart` | Radial menu for skills and items |

---

## SSH Automation

When **Start Server** is tapped, the controller:

1. Generates a `setup.sh` script containing `sudo iptables -I INPUT 1 -p tcp --dport 3000 -j ACCEPT`.
2. Uploads it to the LG machine via SFTP (using `dartssh2`).
3. Executes it over SSH with `echo "$password" | sudo -S bash setup.sh` — opening the firewall.
4. Runs `~/lg-rpg-server/scripts/start-server.sh` to launch the Node.js server.

This sequence ensures port 3000 is open before the server starts, without any manual terminal intervention on the rig.

---

## Networking Notes

There are two common connectivity problems when running the game over a local network:

1. **Android Hotspot Routing Trap** — the phone hosting the hotspot cannot reach its own local network from apps running on the same device.
2. **LG Firewall reset** — `iptables` blocks port 3000 after every reboot.

See the [root README networking section](../README.md#networking-known-issues) for verification commands and fixes for both issues.
