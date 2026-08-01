# LG RPG Controller

The Flutter mobile controller for [Liquid Galaxy RPG](https://github.com/LiquidGalaxyLAB/lg-rpg). One phone per player. It does two jobs:

- **Play the game** — join a lobby, pick a character and loadout, then move, aim, and fire your avatar in real time over Socket.IO.
- **Drive the Liquid Galaxy rig** — over SSH it opens the firewall, starts/stops the Node.js game server, and manages Chromium across every LG screen.

Both connect to the same LG machine: the IP you enter on **Settings** drives the SSH session and builds the game URL (`http://<LG-IP>:8111`). Nothing to configure at build time.

---

## Gameplay

- **Characters & loadout** — pick a character and up to 4 items (power-ups + health potions) before the match; choices affect health and abilities. Each item is cooldown-gated rather than limited-use.
- **Movement & combat** — the joystick sends movement; ranged characters fire projectiles, melee characters swing.
- **Health & power-ups** — the server tracks health and buff timers; activate items mid-match from the controller. (Balance numbers are placeholders being tuned.)
- **PvP Zone Capture** — two teams fight to hold zones, with lobby, match, and result screens.
- **Lobby control** — leave lobby, disconnect, or leave match from the UI.

---

## Pages

Reachable from the drawer:

| Page | File | Purpose |
|---|---|---|
| Home / Lobby | `home_page.dart` | Player name, join lobby, pick mode and team, start game |
| Loadout | `inventory_page.dart` | Character and power-up selection (built from `loadout_widgets.dart`) |
| Map | `map_page.dart` | Google Earth sync — search a place, fly to it with 3D KML, and orbit |
| LG Tasks | `lg_task.dart` | Show logo, clean KML, relaunch, reboot |
| Settings | `settings_page.dart` | LG SSH credentials; connect, start/stop the server, launch/close browsers |
| About | `about_page.dart` | Project credits, mentors, and third-party asset licenses |

Opened automatically by the game flow:

| Page | File | Purpose |
|---|---|---|
| Controller | `controller_page.dart` | Joystick, aim/fire, and item activation during a match |
| Match waiting | `match_waiting_page.dart` | Waiting room between rounds |
| Match result | `match_result_page.dart` | End-of-match scores |

---

## Setup & build

```bash
cd lg_rpg_controller
flutter pub get

flutter run             # debug on a connected device
flutter build apk       # release APK
flutter build appbundle # Play Store bundle
```

Needs a running [LG RPG Server](../lg_rpg_server/README.md) on the Liquid Galaxy machine and an Android 5.0+ device.
