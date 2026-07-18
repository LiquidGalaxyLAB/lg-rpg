#!/bin/bash
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"

set -e

TOTAL_SCREENS="${1:-3}"
PORT="${2:-8111}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$PROJECT_ROOT"
mkdir -p logs

if [ "$TOTAL_SCREENS" != "3" ] && [ "$TOTAL_SCREENS" != "5" ]; then
  echo "Error: Screen number must be 3 or 5."
  exit 1
fi

# Fail fast with a clear reason instead of letting `node` calls die silently.
if ! command -v node >/dev/null 2>&1; then
  echo "Error: node not found. Install Node 16 via nvm and set a default alias (nvm alias default 16)."
  exit 1
fi

# Every curl gets a timeout: a wedged process on the port must not hang this script.
CURL="curl -sf --max-time 2"

is_healthy() {
  $CURL "http://localhost:${PORT}/api/health" > /dev/null 2>&1
}

read_running_screens() {
  $CURL "http://localhost:${PORT}/api/config" \
    | node -e "let s=''; process.stdin.on('data', d => s += d); process.stdin.on('end', () => { try { console.log(JSON.parse(s).totalScreens || ''); } catch { console.log(''); } });"
}

# The port can be held by a stuck server or a foreign process that never answers
# health checks; nothing else legitimately owns it, so reclaim it.
free_port() {
  if fuser -n tcp "$PORT" >/dev/null 2>&1; then
    echo "Port ${PORT} is held by an unresponsive process; freeing it."
    fuser -k -n tcp "$PORT" >/dev/null 2>&1 || true
    sleep 1
    if fuser -n tcp "$PORT" >/dev/null 2>&1; then
      echo "Error: port ${PORT} is occupied and could not be freed. Run 'ss -ltnp | grep ${PORT}' on the LG."
      exit 1
    fi
  fi
}

start_server() {
  echo "Starting LG RPG server | Root: $PROJECT_ROOT | Port: $PORT | Screens: $TOTAL_SCREENS | Node: $(node -v)"
  # stdout is mirrored in-app to logs/server.log (src/lib/file-logger.js);
  # stderr goes to boot-error.log so import/loader crashes are not lost.
  TOTAL_SCREENS="$TOTAL_SCREENS" PORT="$PORT" node server.js > /dev/null 2> logs/boot-error.log &
  SERVER_PID=$!
  echo "PID: $SERVER_PID"
}

stop_server() {
  pkill -f 'node.*server.js' >/dev/null 2>&1 || pkill -f 'server.js' >/dev/null 2>&1 || true
  # Wait until the port is actually released before relaunching, otherwise the
  # new node process races the dying one and crashes with EADDRINUSE.
  for _ in $(seq 1 20); do
    if ! is_healthy; then
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

if is_healthy; then
  CURRENT_SCREENS="$(read_running_screens || true)"
  if [ "$CURRENT_SCREENS" = "$TOTAL_SCREENS" ]; then
    echo "Server is already running on port ${PORT} with ${TOTAL_SCREENS} screens."
  else
    echo "Server is running with ${CURRENT_SCREENS:-unknown} screens; requested ${TOTAL_SCREENS}. Restarting."
    stop_server
    free_port
    start_server
  fi
else
  free_port
  start_server
fi

echo "Waiting for server to be ready..."
for i in $(seq 1 30); do
  if is_healthy; then
    echo "Server is healthy."
    break
  fi
  # A dead process will never become healthy: report the real reason immediately.
  if [ -n "${SERVER_PID:-}" ] && ! kill -0 "$SERVER_PID" 2>/dev/null; then
    # First real error line carries the message ("Error:", "Error [CODE]", "TypeError:", ...);
    # a bare 'Error' match would hit Node's ErrorCaptureStackTrace internals line first.
    # Fallback to the first line for errors without the word (e.g. glibc).
    REASON="$(grep -m1 -E 'Error(:| \[)' logs/boot-error.log 2>/dev/null || head -n 1 logs/boot-error.log 2>/dev/null)"
    echo "Error: server crashed on startup: ${REASON:-no error output; check logs/server.log}"
    exit 1
  fi
  if [ "$i" -eq 30 ]; then
    echo "Error: server did not become healthy within 30s. Check logs/server.log and logs/boot-error.log"
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
