#!/bin/bash

set -e

TOTAL_SCREENS="${1:-3}"
PORT="${2:-3000}"
SERVER_IP="${3:-10.42.6.1}"

echo "🌐 Launching browsers on LG displays | Screens: $TOTAL_SCREENS | IP: $SERVER_IP:$PORT"

# Generate Physical Screen Layout (Odds desc, Evens asc)
PHYSICAL_SCREENS=()
for ((i=TOTAL_SCREENS; i>=1; i--)); do
  ((i % 2 != 0)) && PHYSICAL_SCREENS+=($i)
done
for ((i=2; i<=TOTAL_SCREENS; i+=2)); do
  PHYSICAL_SCREENS+=($i)
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

  BROWSER_CMD="DISPLAY=:0 chromium-browser --kiosk '${URL}' &>/dev/null &"

  if [ "$host_id" -eq 1 ]; then
    echo "   ✅ Launching $LABEL locally on lg1 (Position $pos): $URL"
    eval "$BROWSER_CMD"
  else
    SLAVE="lg${host_id}"
    echo "   📡 Launching $LABEL on $SLAVE via SSH (Position $pos): $URL"
    sshpass -p 'lg' ssh -o StrictHostKeyChecking=no -o ConnectTimeout=5 "lg@${SLAVE}" "$BROWSER_CMD" 2>/dev/null || \
      echo "   ⚠️  Could not SSH to $SLAVE. Please open manually: $URL"
  fi
done

echo "🎮 Done!"
