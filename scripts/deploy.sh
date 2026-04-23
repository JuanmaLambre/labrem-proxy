#!/bin/bash
set -e

TARGET_HOST="172.27.90.37"
DEST_PATH="/home/jlambre"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
ARCHIVE_NAME="labrem-proxy-$(date +%Y%m%d-%H%M%S).zip"
ARCHIVE_PATH="./$ARCHIVE_NAME"

# Ask for SSH username
read -rp "SSH username: " SSH_USER
if [[ -z "$SSH_USER" ]]; then
  echo "Error: username cannot be empty." >&2
  exit 1
fi

CONTROL_SOCKET=$(mktemp -u /tmp/ssh-ctl-XXXXXX)
SSH_OPTS=(
  -o StrictHostKeyChecking=accept-new
  -o ControlPath="$CONTROL_SOCKET"
  -o ControlMaster=auto
  -o ControlPersist=yes
)
trap 'ssh "${SSH_OPTS[@]}" -O exit "$SSH_USER@$TARGET_HOST" 2>/dev/null; true' EXIT

cd "$PROJECT_ROOT"

echo Zipping files...
zip -r "$ARCHIVE_PATH" $(git ls-files)
echo "Archive created: $ARCHIVE_PATH ($(du -sh "$ARCHIVE_PATH" | cut -f1))"

echo "Uploading to $SSH_USER@$TARGET_HOST:$DEST_PATH ..."
scp "${SSH_OPTS[@]}" "$ARCHIVE_PATH" "$SSH_USER@$TARGET_HOST:$DEST_PATH"
echo Uploaded

rm "$ARCHIVE_PATH"

echo "Zip transfered. Extracting on remote server..."
ssh "${SSH_OPTS[@]}" "$SSH_USER@$TARGET_HOST" "cd $DEST_PATH; unzip -o labrem-proxy-*.zip -d labrem-proxy; rm labrem-proxy-*.zip; cd labrem-proxy; npm install --production;"

echo "Done. Deployed to $DEST_PATH on $TARGET_HOST."
