#!/bin/bash
set -e

# ─── Config ─────────────────────────────────────────────────
TOTAL_SCREENS="${1:-3}"
PORT="${2:-3000}"
SERVER_IP="10.42.6.1"

echo "Liquid Galaxy RPG Launcher | Screens: $TOTAL_SCREENS | Port: $PORT | IP: $SERVER_IP"

# ─── Start Node Server ─────────────
if curl -sf "http://localhost:${PORT}/api/health" > /dev/null 2>&1; then
  echo "✅ Server is already running on port ${PORT}."
else
  echo "🚀 Starting server in the background..."
  TOTAL_SCREENS=$TOTAL_SCREENS PORT=$PORT node server.js > server.log 2>&1 &
  echo "PID: $!"
fi

# ─── Wait for health ────────────────────────────────────────
echo "⏳ Waiting for server to be ready..."
for i in $(seq 1 15); do
  if curl -sf "http://localhost:${PORT}/api/health" > /dev/null 2>&1; then
    echo "✅ Server is healthy!"
    break
  fi
  ((i == 15)) && { echo "❌ Error: Server failed to start. Check server.log"; exit 1; }
  sleep 1
done

# ─── Generate Physical Screen Layout (Odds desc, Evens asc) ──
PHYSICAL_SCREENS=()
for ((i=TOTAL_SCREENS; i>=1; i--)); do
  ((i % 2 != 0)) && PHYSICAL_SCREENS+=($i)
done
for ((i=2; i<=TOTAL_SCREENS; i+=2)); do
  PHYSICAL_SCREENS+=($i)
done

# ─── Launch browsers on each LG screen ──────────────────────
echo "🌐 Launching browsers on each screen..."
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
