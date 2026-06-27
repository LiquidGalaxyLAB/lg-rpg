#!/bin/bash
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"

set -e

TOTAL_SCREENS="${1:-3}"
PORT="${2:-3000}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$PROJECT_ROOT"

read_running_screens() {
  curl -sf "http://localhost:${PORT}/api/config" \
    | node -e "let s=''; process.stdin.on('data', d => s += d); process.stdin.on('end', () => { try { console.log(JSON.parse(s).totalScreens || ''); } catch { console.log(''); } });"
}

start_server() {
  echo "Starting LG RPG server | Root: $PROJECT_ROOT | Port: $PORT | Screens: $TOTAL_SCREENS"
  TOTAL_SCREENS="$TOTAL_SCREENS" PORT="$PORT" node server.js > server.log 2>&1 &
  echo "PID: $!"
}

stop_server() {
  pkill -f 'node.*server.js' >/dev/null 2>&1 || pkill -f 'server.js' >/dev/null 2>&1 || true
  # Wait until the port is actually released before relaunching, otherwise the
  # new node process races the dying one and crashes with EADDRINUSE.
  for _ in $(seq 1 20); do
    if ! curl -sf "http://localhost:${PORT}/api/health" > /dev/null 2>&1; then
      echo "Stopped existing Node.js server."
      return 0
    fi
    sleep 0.5
  done
  # Still holding the port after 10s: force kill and give the OS a moment.
  pkill -9 -f 'server.js' >/dev/null 2>&1 || true
  sleep 1
  echo "Force-stopped existing Node.js server."
}

if curl -sf "http://localhost:${PORT}/api/health" > /dev/null 2>&1; then
  CURRENT_SCREENS="$(read_running_screens || true)"
  if [ "$CURRENT_SCREENS" = "$TOTAL_SCREENS" ]; then
    echo "Server is already running on port ${PORT} with ${TOTAL_SCREENS} screens."
  else
    echo "Server is running with ${CURRENT_SCREENS:-unknown} screens; requested ${TOTAL_SCREENS}. Restarting."
    stop_server
    start_server
  fi
else
  start_server
fi

echo "Waiting for server to be ready..."
for i in $(seq 1 45); do
  if curl -sf "http://localhost:${PORT}/api/health" > /dev/null 2>&1; then
    echo "Server is healthy."
    break
  fi
  if [ "$i" -eq 45 ]; then
    echo "Error: server failed to start. Check server.log"
    exit 1
  fi
  sleep 1
done

RUNNING_SCREENS="$(read_running_screens || true)"
if [ "$RUNNING_SCREENS" != "$TOTAL_SCREENS" ]; then
  echo "Error: server is configured for ${RUNNING_SCREENS:-unknown} screens, expected ${TOTAL_SCREENS}."
  exit 1
fi

echo "Server configured for ${RUNNING_SCREENS} screens."
