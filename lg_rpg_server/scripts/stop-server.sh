#!/bin/bash

echo "🛑 Stopping LG RPG Server..."

# Kill Node.js server running server.js
if pkill -f 'node.*server.js' >/dev/null 2>&1 || pkill -f 'server.js' >/dev/null 2>&1; then
  echo "   ✅ Node.js server stopped."
else
  echo "   ℹ️ Node.js server was not running."
fi
