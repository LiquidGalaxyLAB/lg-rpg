# Networking: Known Issues

If the phone can't reach the server over the local network, it's almost always one of these two things. Check them whenever you set up on a new network.

| # | Quick symptom | Jump to |
|---|---|---|
| 1 | Hotspot phone times out, other phones are fine | [Hotspot trap](#1--phone-hosting-the-hotspot-cant-connect) |
| 2 | Worked before, broke after a reboot | [Firewall](#2--firewall-blocks-the-port-after-reboot) |

---

## 1 — Phone hosting the hotspot can't connect

**Symptom:** The phone running the app *and* the hotspot gets `Connection timed out (errno 110)`, but a second phone on the same hotspot connects fine.

**Why:** Android routes the app's traffic out the mobile data (5G/LTE) interface instead of the local hotspot, so the local `10.x.x.x` IP never resolves.

**Fix:** Don't host the hotspot from the same phone that runs the app. Use another phone or a router as the Wi-Fi host, and keep the controller phone as a normal client.

---

## 2 — Firewall blocks the port after reboot

**Symptom:** After a VM reboot the app gets `Socket Unreachable`, even though the server started fine.

**Why:** LG rigs block all non-whitelisted ports with `iptables`, and those rules live in RAM — every reboot wipes any rule you added by hand.

The server runs on **8111**, which is whitelisted on a stock rig, so this should not bite you. It only comes back if you override `PORT` to something outside the whitelist.

**Check:** `sudo iptables -L INPUT -n --line-numbers | grep 8111`, and confirm what the server is actually listening on with `ss -ltnp | grep node`.

**Fix — quick (one session):**

```bash
sudo iptables -I INPUT 1 -p tcp --dport 8111 -j ACCEPT
```

**Fix — permanent (survives reboots):** add the rule *first*, then save it.

```bash
sudo iptables -I INPUT 1 -p tcp --dport 8111 -j ACCEPT
sudo apt-get install -y iptables-persistent   # answer "Yes" to save current rules
sudo netfilter-persistent save                # writes /etc/iptables/rules.v4
```

**Fix — automatic:** tapping **Start Server** in the controller's Settings page also inserts the rule over SSH before launching the server. It's best-effort — if `sudo` fails there, the app logs a warning and carries on, because 8111 is normally open anyway.
