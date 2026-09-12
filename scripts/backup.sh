#!/usr/bin/env bash
# Online SQLite backup, encrypted with age (public-key/encrypt-only -
# decrypting requires the private key, which is NOT stored on this VPS).
# Truman should scp the resulting .age file to his own machine periodically.
# Mirrors the Rink Dashboard's backup.sh (/opt/therink-dashboard/scripts/backup.sh).
set -euo pipefail

APP_ROOT="/opt/marches-reload"
# #25: this used to say "marches.sqlite3" (trailing "3") — the live DB file
# is actually named "marches.sqlite" (see server/src/config.js's dbPath).
# sqlite3 auto-creates a missing source file rather than failing, so this
# would have silently backed up an empty database, not errored — the
# existence check below guards against that same class of bug recurring.
# In practice nothing ever called this script (no cron, deploy.sh didn't
# invoke it), which is why shared/backups was empty, not because it ran
# and failed.
DB_PATH="$APP_ROOT/shared/data/marches.sqlite"
BACKUP_DIR="$APP_ROOT/shared/backups"
ENV_FILE="$APP_ROOT/shared/.env"

if [ ! -f "$DB_PATH" ]; then
  echo "No database at $DB_PATH — refusing to write an empty backup." >&2
  exit 1
fi

PUBLIC_KEY=$(grep '^BACKUP_AGE_PUBLIC_KEY=' "$ENV_FILE" | cut -d'=' -f2-)
if [ -z "$PUBLIC_KEY" ]; then
  echo "BACKUP_AGE_PUBLIC_KEY not set in $ENV_FILE" >&2
  exit 1
fi

TIMESTAMP=$(date -u +%Y%m%dT%H%M%SZ)
WORK_DIR=$(mktemp -d)
trap 'rm -rf "$WORK_DIR"' EXIT

sqlite3 "$DB_PATH" ".backup '$WORK_DIR/marches.sqlite'"
cp "$ENV_FILE" "$WORK_DIR/.env"
tar -C "$WORK_DIR" -czf "$WORK_DIR/backup.tar.gz" marches.sqlite .env

OUT_FILE="$BACKUP_DIR/marches-backup-$TIMESTAMP.tar.gz.age"
age -r "$PUBLIC_KEY" -o "$OUT_FILE" "$WORK_DIR/backup.tar.gz"
chmod 600 "$OUT_FILE"

echo "Backup written to: $OUT_FILE"
echo "Copy it off the VPS, e.g.:"
echo "  scp root@$(hostname -I | awk '{print $1}'):$OUT_FILE ."
