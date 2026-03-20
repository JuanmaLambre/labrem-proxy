#!/usr/bin/env bash
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
PID_FILE="$PROJECT_DIR/labrem-proxy.pid"
LOG_FILE="$PROJECT_DIR/logs/server.log"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

info()  { echo -e "${GREEN}[INFO]${NC}  $1"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}  $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

# Register (or verify) the watchdog cron job
setup_watchdog() {
  local watchdog="$SCRIPT_DIR/watchdog.sh"
  local cron_entry="*/5 * * * * $watchdog >> $PROJECT_DIR/logs/watchdog.log 2>&1"

  if crontab -l 2>/dev/null | grep -qF "$watchdog"; then
    info "Watchdog cron job already registered ✓"
  else
    warn "Watchdog cron job not found — registering (every 5 min)..."
    (crontab -l 2>/dev/null; echo "$cron_entry") | crontab -
    info "Watchdog cron job registered ✓"
  fi
}

cd "$PROJECT_DIR"

# ---------------------------------------------------------------------------
# 1. Node.js
# ---------------------------------------------------------------------------
info "Checking Node.js..."
command -v node &>/dev/null || error "Node.js is not installed."
info "Node.js $(node --version) ✓"

# ---------------------------------------------------------------------------
# 2. .env file
# ---------------------------------------------------------------------------
[ -f ".env" ] || error ".env not found. Copy .env.example to .env and configure it."
info ".env found ✓"

# Load env vars
set -a
# shellcheck disable=SC1091
source .env
set +a

# ---------------------------------------------------------------------------
# 3. targets.json — existence and validity
# ---------------------------------------------------------------------------
TARGETS_CONFIG="${TARGETS_CONFIG:-src/targets.json}"
PORT="${PORT:-3456}"
HTTPS_ENABLED="${HTTPS_ENABLED:-false}"

[ -n "$TARGETS_CONFIG" ] || error "TARGETS_CONFIG is not set in .env or environment."
[ -f "$TARGETS_CONFIG" ] || error "targets.json not found at: $TARGETS_CONFIG"

node -e "JSON.parse(require('fs').readFileSync('$TARGETS_CONFIG', 'utf8'))" 2>/dev/null \
  || error "targets.json is not valid JSON: $TARGETS_CONFIG"

TARGET_COUNT=$(node -e "console.log(Object.keys(JSON.parse(require('fs').readFileSync('$TARGETS_CONFIG','utf8'))).length)")
if [ "$TARGET_COUNT" -eq 0 ]; then
  warn "targets.json has no entries — proxy has no targets configured."
else
  info "targets.json valid ($TARGET_COUNT target(s)) ✓"
fi

# ---------------------------------------------------------------------------
# 4. SSL certificates (only when HTTPS is enabled)
# ---------------------------------------------------------------------------
if [ "$HTTPS_ENABLED" = "true" ]; then
  SSL_KEY_PATH="${SSL_KEY_PATH:-./certs/key.pem}"
  SSL_CERT_PATH="${SSL_CERT_PATH:-./certs/cert.pem}"
  [ -f "$SSL_KEY_PATH" ]  || error "SSL key not found at: $SSL_KEY_PATH"
  [ -f "$SSL_CERT_PATH" ] || error "SSL cert not found at: $SSL_CERT_PATH"
  info "SSL certificates found ✓"
fi

# ---------------------------------------------------------------------------
# 5. node_modules
# ---------------------------------------------------------------------------
if [ ! -d "node_modules" ]; then
  warn "node_modules not found — running npm install..."
  npm install || error "npm install failed."
fi
info "node_modules ✓"

# ---------------------------------------------------------------------------
# 6. Check if server is already running
# ---------------------------------------------------------------------------
PROTOCOL="http"
[ "$HTTPS_ENABLED" = "true" ] && PROTOCOL="https"

if curl -sk --max-time 3 "$PROTOCOL://localhost:$PORT/health" &>/dev/null; then
  info "Server is already running on port $PORT ✓"
  setup_watchdog
  exit 0
fi

# Port bound by something unrelated?
if lsof -i ":$PORT" -sTCP:LISTEN &>/dev/null; then
  error "Port $PORT is already bound by another process (not this server)."
fi

# ---------------------------------------------------------------------------
# 7. Build client if needed
# ---------------------------------------------------------------------------
if [ ! -d "dist" ]; then
  info "dist/ not found — building client..."
  npm run build:client || error "Client build failed."
else
  info "Client already built (dist/) ✓"
fi

# ---------------------------------------------------------------------------
# 8. Start server in background
# ---------------------------------------------------------------------------
info "Starting labrem-proxy on $PROTOCOL://localhost:$PORT ..."
mkdir -p logs

nohup node_modules/.bin/tsx src/server.js > "$LOG_FILE" 2>&1 &
SERVER_PID=$!
echo "$SERVER_PID" > "$PID_FILE"
info "Server started (PID: $SERVER_PID) — logs: $LOG_FILE"

# Wait up to 30 s for health endpoint to respond
info "Waiting for server to become ready..."
for i in $(seq 1 30); do
  if curl -sk --max-time 3 "$PROTOCOL://localhost:$PORT/health" &>/dev/null; then
    info "Server is up and healthy ✓"
    break
  fi
  sleep 1
  if [ "$i" -eq 30 ]; then
    error "Server did not respond within 30 s. Check logs: $LOG_FILE"
  fi
done

# ---------------------------------------------------------------------------
# 9. Register watchdog cron
# ---------------------------------------------------------------------------
setup_watchdog
