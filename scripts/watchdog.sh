#!/usr/bin/env bash
# Watchdog — called by cron every 5 minutes.
# Checks if the proxy is healthy; restarts it if not.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
PID_FILE="$PROJECT_DIR/labrem-proxy.pid"
LOG_FILE="$PROJECT_DIR/logs/server.log"

timestamp() { date '+%Y-%m-%d %H:%M:%S'; }
log() { echo "[$(timestamp)] $1"; }

cd "$PROJECT_DIR"

# Load env vars
if [ ! -f ".env" ]; then
  log "ERROR: .env not found — cannot run watchdog."
  exit 1
fi
set -a
# shellcheck disable=SC1091
source .env
set +a

PORT="${PORT:-3456}"
HTTPS_ENABLED="${HTTPS_ENABLED:-false}"
PROTOCOL="http"
[ "$HTTPS_ENABLED" = "true" ] && PROTOCOL="https"

# ---------------------------------------------------------------------------
# Health check
# ---------------------------------------------------------------------------
if curl -sk --max-time 5 "$PROTOCOL://localhost:$PORT/health" &>/dev/null; then
  log "OK: server is healthy on $PROTOCOL://localhost:$PORT"
  exit 0
fi

log "WARN: server is not responding — attempting restart..."

# ---------------------------------------------------------------------------
# Kill stale process (if PID file exists)
# ---------------------------------------------------------------------------
if [ -f "$PID_FILE" ]; then
  OLD_PID=$(cat "$PID_FILE")
  if kill -0 "$OLD_PID" 2>/dev/null; then
    log "Killing stale process PID $OLD_PID..."
    kill "$OLD_PID" 2>/dev/null || true
    sleep 2
    kill -9 "$OLD_PID" 2>/dev/null || true
  fi
  rm -f "$PID_FILE"
fi

# Also free the port if something else is holding it
if lsof -i ":$PORT" -sTCP:LISTEN &>/dev/null; then
  BLOCKING_PID=$(lsof -ti ":$PORT" -sTCP:LISTEN)
  log "Killing process $BLOCKING_PID blocking port $PORT..."
  kill -9 "$BLOCKING_PID" 2>/dev/null || true
  sleep 1
fi

# ---------------------------------------------------------------------------
# Restart (no rebuild — assumes dist/ is already present)
# ---------------------------------------------------------------------------
if [ ! -d "node_modules" ]; then
  log "ERROR: node_modules not found — run start.sh first."
  exit 1
fi

if [ ! -d "dist" ]; then
  log "dist/ missing — building client before restart..."
  npm run build:client >> "$LOG_FILE" 2>&1 || { log "ERROR: client build failed."; exit 1; }
fi

nohup node_modules/.bin/tsx src/server.js >> "$LOG_FILE" 2>&1 &
NEW_PID=$!
echo "$NEW_PID" > "$PID_FILE"
log "Server restarted (PID: $NEW_PID)"

# Verify it came back up
sleep 5
if curl -sk --max-time 5 "$PROTOCOL://localhost:$PORT/health" &>/dev/null; then
  log "OK: server is healthy after restart."
else
  log "ERROR: server still not responding after restart. Check $LOG_FILE"
  exit 1
fi
