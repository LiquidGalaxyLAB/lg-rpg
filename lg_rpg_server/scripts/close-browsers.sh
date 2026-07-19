#!/bin/bash

set -e

TOTAL_SCREENS="${1:-3}"
# Slave SSH password; the controller passes the one from its Settings page.
SSH_PASSWORD="${2:-lg}"

echo "🛑 Closing browsers on all screens..."

# Kill local kiosk browser
pkill -TERM -f 'chromium-browser|chromium|chrome' 2>/dev/null || true
echo "   ✅ Local browser stopped on lg1."

# Kill remote kiosk browsers on slave hosts
for ((i=1; i<=TOTAL_SCREENS; i++)); do
  if [ "$i" -ne 1 ]; then
    SLAVE="lg${i}"
    echo "      📡 Stopping browser on $SLAVE via SSH..."
    sshpass -p "$SSH_PASSWORD" ssh -o StrictHostKeyChecking=no -o ConnectTimeout=10 "lg@${SLAVE}" "pkill -TERM -f 'chromium-browser|chromium|chrome'; sleep 1; pgrep -af 'chromium|chrome' || echo stopped" 2>/dev/null || echo "Could not SSH to ${SLAVE}"
  fi
done

echo "✅ All browsers closed."
