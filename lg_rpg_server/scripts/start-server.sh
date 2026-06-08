#!/bin/bash
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

set -e

TOTAL_SCREENS="${1:-3}"
PORT="${2:-3000}"

# Resolve the project root directory (parent of scripts/)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "🚀 Starting LG RPG Server... | Root: $PROJECT_ROOT | Port: $PORT"

cd "$PROJECT_ROOT"

if curl -sf "http://localhost:${PORT}/api/health" > /dev/null 2>&1; then
  echo "✅ Server is already running on port ${PORT}."
else
  echo "🚀 Starting server in the background..."
  TOTAL_SCREENS=$TOTAL_SCREENS PORT=$PORT node server.js > server.log 2>&1 &
  echo "PID: $!"
fi

# Wait for health check
echo "⏳ Waiting for server to be ready..."
for i in $(seq 1 15); do
  if curl -sf "http://localhost:${PORT}/api/health" > /dev/null 2>&1; then
    echo "✅ Server is healthy!"
    break
  fi
  ((i == 15)) && { echo "❌ Error: Server failed to start. Check server.log"; exit 1; }
  sleep 1
done
