#!/bin/bash

set -e

TOTAL_SCREENS="${1:-3}"
PORT="${2:-8111}"
SERVER_IP="${3:-}"
# Slave SSH password; the controller passes the one from its Settings page.
SSH_PASSWORD="${4:-lg}"
if [ -z "$SERVER_IP" ]; then
  SERVER_IP="10.42.6.1"
  echo "Warning: no server IP given; defaulting to ${SERVER_IP}. If screens stay blank, pass the master's IP as the 3rd argument."
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

"$SCRIPT_DIR/start-server.sh" "$TOTAL_SCREENS" "$PORT"

echo "Launching browsers on LG displays | Screens: $TOTAL_SCREENS | IP: $SERVER_IP:$PORT"


HALF=$((TOTAL_SCREENS / 2))
PHYSICAL_SCREENS=()
for ((i=HALF+2; i<=TOTAL_SCREENS; i++)); do   # left block: leftmost -> centre
  PHYSICAL_SCREENS+=("$i")
done
PHYSICAL_SCREENS+=(1)                          # master / centre
for ((i=2; i<=HALF+1; i++)); do                # right block: centre -> rightmost
  PHYSICAL_SCREENS+=("$i")
done

GAME_SCREEN=1

for idx in "${!PHYSICAL_SCREENS[@]}"; do
  host_id="${PHYSICAL_SCREENS[$idx]}"
  pos=$((idx + 1))

  URL="http://${SERVER_IP}:${PORT}/?screen=${GAME_SCREEN}"
  LABEL="Game Screen ${GAME_SCREEN}"
  ((GAME_SCREEN++))

  BROWSER_CMD="DISPLAY=:0 chromium-browser \
    --autoplay-policy=no-user-gesture-required \
    --incognito \
    --force-device-scale-factor=1 \
    --disable-session-crashed-bubble \
    --disable-infobars \
    --hide-scrollbars \
    --ignore-gpu-blocklist \
    --enable-gpu-rasterization \
    --enable-zero-copy \
    --enable-accelerated-2d-canvas \
    --disable-software-rasterizer \
    --use-gl=desktop \
    --kiosk '${URL}' &>/dev/null &"

  if [ "$host_id" -eq 1 ]; then
    echo "Launching $LABEL locally on lg1 (position $pos): $URL"
    eval "$BROWSER_CMD"
  else
    SLAVE="lg${host_id}"
    echo "Launching $LABEL on $SLAVE via SSH (position $pos): $URL"
    sshpass -p "$SSH_PASSWORD" ssh -o StrictHostKeyChecking=no -o ConnectTimeout=5 "lg@${SLAVE}" "$BROWSER_CMD" 2>/dev/null || \
      echo "Could not SSH to $SLAVE. Please open manually: $URL"
  fi
done

echo "Done."
