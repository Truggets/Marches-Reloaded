#!/usr/bin/env bash
# Roll back to a previous release. Usage: rollback.sh [release-name]
# With no argument, rolls back to the release before the current one.
# Mirrors the Rink Dashboard's rollback.sh (/opt/therink-dashboard/scripts/rollback.sh).
set -euo pipefail

APP_ROOT="/opt/marches-reload"
cd "$APP_ROOT/releases"

CURRENT_TARGET=$(readlink -f "$APP_ROOT/current" | xargs basename)

if [ -n "${1:-}" ]; then
  TARGET="$1"
else
  # Sort by directory NAME (timestamp-prefixed => lexicographic order ==
  # chronological order), not mtime: `rsync -a` in deploy.sh preserves each
  # release's mtime from the shared $REPO_DIR working copy, so release dirs
  # can end up with identical/stale mtimes and `ls -t` can't reliably tell
  # newest from oldest (this is exactly what caused a bad rollback target
  # once already).
  TARGET=$(ls -1 | sort -r | grep -v "^${CURRENT_TARGET}\$" | head -n 1)
fi

if [ -z "$TARGET" ] || [ ! -d "$APP_ROOT/releases/$TARGET" ]; then
  echo "Could not find a release to roll back to (target: '${TARGET:-none}')." >&2
  echo "Available releases:" >&2
  ls -1 | sort -r >&2
  exit 1
fi

echo "Rolling back from $CURRENT_TARGET to $TARGET"
ln -sfn "$APP_ROOT/releases/$TARGET" "$APP_ROOT/current"

systemctl restart marches-reload
sleep 1
systemctl is-active --quiet marches-reload && echo "Rolled back and service is active." || { echo "Service failed to start after rollback!" >&2; exit 1; }
