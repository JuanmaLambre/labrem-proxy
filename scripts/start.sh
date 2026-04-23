#!/usr/bin/env bash
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

info()  { echo -e "${GREEN}[INFO]${NC}  $1"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}  $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

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

set -a
# shellcheck disable=SC1091
source .env
set +a

# ---------------------------------------------------------------------------
# 3. targets.json — existence and validity
# ---------------------------------------------------------------------------
TARGETS_CONFIG="${TARGETS_CONFIG:-targets.json}"

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
# 4. node_modules
# ---------------------------------------------------------------------------
if [ ! -d "node_modules" ]; then
  warn "node_modules not found — running npm install..."
  npm install || error "npm install failed."
fi
info "node_modules ✓"

# ---------------------------------------------------------------------------
# 5. Build client if needed
# ---------------------------------------------------------------------------
if [ ! -d "dist" ]; then
  info "dist/ not found — building client..."
  npm run build || error "Client build failed."
else
  info "Client already built (dist/) ✓"
fi

# ---------------------------------------------------------------------------
# 6. Start with PM2
# ---------------------------------------------------------------------------
command -v pm2 &>/dev/null || error "PM2 is not installed. Run: npm install -g pm2"

if pm2 describe labrem-proxy &>/dev/null; then
  info "Restarting existing PM2 process..."
  pm2 restart ecosystem.config.cjs
else
  info "Starting labrem-proxy with PM2..."
  pm2 start ecosystem.config.cjs
fi

info "Done. Use 'pm2 logs labrem-proxy' to follow logs."
