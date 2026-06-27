#!/bin/bash

set -e

TOTAL_SCREENS="${1:-3}"
PORT="${2:-3000}"
SERVER_IP="${3:-10.42.6.1}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

"$SCRIPT_DIR/start-server.sh" "$TOTAL_SCREENS" "$PORT"

echo "Launching browsers on LG displays | Screens: $TOTAL_SCREENS | IP: $SERVER_IP:$PORT"

# Generate physical layout: odd screen ids descending, then even screen ids ascending.
PHYSICAL_SCREENS=()
for ((i=TOTAL_SCREENS; i>=1; i--)); do
  ((i % 2 != 0)) && PHYSICAL_SCREENS+=("$i")
done
for ((i=2; i<=TOTAL_SCREENS; i+=2)); do
  PHYSICAL_SCREENS+=("$i")
done

GAME_SCREEN=1

for idx in "${!PHYSICAL_SCREENS[@]}"; do
  host_id="${PHYSICAL_SCREENS[$idx]}"
  pos=$((idx + 1))

  if [ "$pos" -eq "$TOTAL_SCREENS" ]; then
    URL="http://${SERVER_IP}:${PORT}/right_screen.html"
    LABEL="Leaderboard"
  else
    URL="http://${SERVER_IP}:${PORT}/?screen=${GAME_SCREEN}"
    LABEL="Game Screen ${GAME_SCREEN}"
    ((GAME_SCREEN++))
  fi

  BROWSER_CMD="DISPLAY=:0 chromium-browser \
    --autoplay-policy=no-user-gesture-required \
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
    sshpass -p 'lg' ssh -o StrictHostKeyChecking=no -o ConnectTimeout=5 "lg@${SLAVE}" "$BROWSER_CMD" 2>/dev/null || \
      echo "Could not SSH to $SLAVE. Please open manually: $URL"
  fi
done

echo "Done."
