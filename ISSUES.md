# Networking: Known Issues

If the phone can't reach the server over the local network, it's almost always one of these three things. Check them whenever you set up on a new network.

| # | Quick symptom | Jump to |
|---|---|---|
| 1 | Hotspot phone times out, other phones are fine | [Hotspot trap](#1--phone-hosting-the-hotspot-cant-connect) |
| 2 | Server is up, port is open, still no connection | [VirtualBox routing](#2--virtualbox-sends-replies-out-the-wrong-adapter) |
| 3 | Worked before, broke after a reboot | [Firewall](#3--firewall-blocks-port-3000-after-reboot) |

---

## 1 — Phone hosting the hotspot can't connect

**Symptom:** The phone running the app *and* the hotspot gets `Connection timed out (errno 110)`, but a second phone on the same hotspot connects fine.

**Why:** Android routes the app's traffic out the mobile data (5G/LTE) interface instead of the local hotspot, so the local `10.x.x.x` IP never resolves.

**Fix:** Don't host the hotspot from the same phone that runs the app. Use another phone or a router as the Wi-Fi host, and keep the controller phone as a normal client.

---

## 2 — VirtualBox sends replies out the wrong adapter

**Symptom:** The server is running and port 3000 is open, but the app still times out.

**Why:** The LG VM usually has two adapters — NAT (`eth0`, internal `10.0.2.x`) and host/bridged (`eth1`, same subnet as the phones). If NAT has the **lower metric**, the VM replies through NAT, an address no phone can reach.

**Check:** SSH into the LG machine and run `route -n`. Look at the `Metric` column on the `0.0.0.0` (default route) rows — lower metric wins. The **host adapter (`eth1`) must win**.

```
Destination     Gateway         Genmask   Flags Metric Iface
0.0.0.0         10.110.111.1    0.0.0.0   UG    100    eth1   ← host network should win
0.0.0.0         10.0.2.2        0.0.0.0   UG    700    eth0   ← NAT should lose
```

**Fix (survives reboots):** edit `/etc/network/interfaces` so the host adapter has the lower metric:

```
auto eth0
iface eth0 inet dhcp
    metric 700

auto eth1
iface eth1 inet dhcp
    metric 100
```

Then apply: `sudo ifdown eth0 && sudo ifup eth0` and re-check with `route -n`.

---

## 3 — Firewall blocks port 3000 after reboot

**Symptom:** After a VM reboot the app gets `Socket Unreachable`, even though the server started fine.

**Why:** LG rigs block all non-whitelisted ports with `iptables`, and those rules live in RAM — every reboot wipes the port-3000 rule.

**Check:** `sudo iptables -L INPUT -n --line-numbers | grep 3000` — no output means the port is blocked.

**Fix — quick (one session):**

```bash
sudo iptables -I INPUT 1 -p tcp --dport 3000 -j ACCEPT
```

**Fix — permanent (survives reboots):** add the rule *first*, then save it.

```bash
sudo iptables -I INPUT 1 -p tcp --dport 3000 -j ACCEPT
sudo apt-get install -y iptables-persistent   # answer "Yes" to save current rules
sudo netfilter-persistent save                # writes /etc/iptables/rules.v4
```

**Fix — automatic:** you usually don't need to do any of the above. When you tap **Start Server** in the controller's Settings page, the app opens port 3000 over SSH right before launching the server, so it self-heals after a reboot.
