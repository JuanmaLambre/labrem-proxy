#!/bin/bash
set -e

TARGET_HOST="10.90.46.232"
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

cd "$PROJECT_ROOT"

echo Making a copy of node_modules...
mv node_modules node_modules_backup

echo Installing for Linux...
npm install --os=linux --cpu=x64 --libc=glibc

echo Zipping files...
zip --symlinks -r "$ARCHIVE_PATH" node_modules $(git ls-files)
echo "Archive created: $ARCHIVE_PATH ($(du -sh "$ARCHIVE_PATH" | cut -f1))"

echo "Uploading to $SSH_USER@$TARGET_HOST:$DEST_PATH ..."
SSH_OPTS=(-o StrictHostKeyChecking=accept-new)
scp "${SSH_OPTS[@]}" "$ARCHIVE_PATH" "$SSH_USER@$TARGET_HOST:$DEST_PATH"
echo Uploaded

rm "$ARCHIVE_PATH"
mv node_modules_backup node_modules

echo "Done. Deployed to $DEST_PATH on $TARGET_HOST."
