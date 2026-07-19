#!/usr/bin/env bash
# Deploy Marches Reload. Usage: deploy.sh [git-ref]
# Mirrors the Rink Dashboard's deploy.sh (/opt/therink-dashboard/scripts/deploy.sh) —
# same release/symlink/prune pattern, adapted for a static client build + thin Node API.
set -euo pipefail

APP_ROOT="/opt/marches-reload"
REPO_DIR="$APP_ROOT/repo"
REF="${1:-main}"
KEEP_RELEASES=5

if [ ! -d "$REPO_DIR/.git" ]; then
  echo "No repo checked out at $REPO_DIR yet. Clone it there first (see docs/planning/repo-setup.md)." >&2
  exit 1
fi

cd "$REPO_DIR"
git fetch --all --quiet
git checkout "$REF" --quiet
git pull --ff-only --quiet || true

SHA=$(git rev-parse --short HEAD)
TIMESTAMP=$(date -u +%Y%m%d%H%M%S)
RELEASE_NAME="${TIMESTAMP}-${SHA}"
RELEASE_DIR="$APP_ROOT/releases/$RELEASE_NAME"

echo "Deploying $REF ($SHA) to $RELEASE_DIR"
mkdir -p "$RELEASE_DIR"
rsync -a --exclude='.git' "$REPO_DIR/" "$RELEASE_DIR/"

cd "$RELEASE_DIR/server"
npm ci --omit=dev

cd "$RELEASE_DIR/client"
npm ci
npm run build

cd "$RELEASE_DIR"
chown -R marches:marches "$RELEASE_DIR"

ln -sfn "$RELEASE_DIR" "$APP_ROOT/current"
echo "$RELEASE_NAME $(date -u -Iseconds)" >> "$APP_ROOT/RELEASES.md"

systemctl restart marches-reload
sleep 1
systemctl is-active --quiet marches-reload && echo "Service is active." || { echo "Service failed to start!" >&2; exit 1; }

# Prune old releases, keeping the most recent N (current release is always kept).
cd "$APP_ROOT/releases"
ls -1t | tail -n +$((KEEP_RELEASES + 1)) | while read -r old; do
  echo "Pruning old release: $old"
  rm -rf "$old"
done

echo "Deployed $RELEASE_NAME successfully."
