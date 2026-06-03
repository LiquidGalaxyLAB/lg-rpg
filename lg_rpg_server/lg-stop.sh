#!/bin/bash

set -e

TOTAL_SCREENS="${1:-3}"
PORT="${2:-3000}"

echo "🛑 Stopping Liquid Galaxy RPG..."

# 1. Stop the backend Node.js server
if pkill -f server.js >/dev/null 2>&1; then
  echo "   ✅ Node.js server stopped."
else
  echo "   ℹ️ Node.js server was not running."
fi

# 2. Kill local kiosk browser
pkill -f "chromium-browser" 2>/dev/null || true
echo "   ✅ Local browser stopped on lg1."

# 3. Kill remote kiosk browsers on slave hosts
echo "   🌐 Stopping remote browsers on slave screens..."
for ((i=1; i<=TOTAL_SCREENS; i++)); do
  if [ "$i" -ne 1 ]; then
    SLAVE="lg${i}"
    echo "      📡 Stopping browser on $SLAVE via SSH..."
    sshpass -p 'lg' ssh -o StrictHostKeyChecking=no -o ConnectTimeout=3 "lg@${SLAVE}" "pkill -f chromium-browser" 2>/dev/null || true
  fi
done

echo "✅ Done."
