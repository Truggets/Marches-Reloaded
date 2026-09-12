# Backups (closes #25)

## What this covers

`scripts/backup.sh` takes a consistent SQLite snapshot of the live database
(`.sqlite` file via `sqlite3 .backup`, not a raw file copy), encrypts it with
`age` against the public key in `shared/.env`, and writes it to
`shared/backups/`. Truman should periodically `scp` these off the VPS —
decryption needs the private key, which is never stored on the VPS itself.

## The bug this fixes

`backup.sh` hardcoded the source DB path as `marches.sqlite3` (trailing
"3"); the live file is actually `marches.sqlite` (see
`server/src/config.js`'s `dbPath`). `sqlite3 .backup` doesn't fail on a
missing source file — it silently creates one, so this bug would have
produced a valid-looking `.age` archive containing an empty database, not an
error. Separately, nothing in the repo or the deploy pipeline ever actually
called `backup.sh` (no cron, `deploy.sh` didn't invoke it) — that's the real
reason `/opt/marches-reload/shared/backups` was empty, not a failed
invocation. Both bugs are fixed here: the filename, and a new
source-file-exists check in `backup.sh` so a future path mismatch fails loud
instead of writing an empty backup. `rollback.sh` was checked and does not
share the filename constant — nothing to fix there.

## What changed

- `scripts/backup.sh`: fixed `DB_PATH` (and the working-copy filenames it
  produces internally) to match the real `marches.sqlite`; added a
  source-file-exists check so a future path mismatch fails loud instead of
  silently backing up an empty database (`sqlite3 .backup` auto-creates a
  missing source file rather than erroring).
- `scripts/deploy.sh`: now takes a pre-deploy backup as a **required** step
  (calls `$APP_ROOT/scripts/backup.sh` before touching the repo checkout or
  running the DB migration) — a deploy that can't produce a backup refuses
  to proceed, rather than silently deploying without one.

## Applying this to the VPS (T1/VPS-role step, not done by this commit)

`/opt/marches-reload/scripts/*.sh` are standalone, root-owned copies — the
release pipeline never overwrites them from a deploy (same reason the M7
incident's `deploy.sh`/`rollback.sh` fix needed a separate manual VPS patch).
After this merges to `main`:

1. Copy the fixed `scripts/backup.sh` and `scripts/deploy.sh` from the repo
   to `/opt/marches-reload/scripts/`, replacing the stale copies (back up
   the originals first, same convention as the M7 incident fix).
2. `bash -n` both files to confirm they're syntax-valid before trusting them
   live (same precaution used for the M7 fix).
3. Dry-run `backup.sh` once manually and confirm a real `.age` file appears
   under `shared/backups/` before relying on it in an actual deploy.
4. If a 0-byte `shared/data/marches.sqlite3` (trailing "3") file exists,
   that's a leftover from the old bug auto-creating it — safe to delete.

## Recommended nightly cron (not installed by this change)

```
0 3 * * * /opt/marches-reload/scripts/backup.sh >> /opt/marches-reload/shared/backups/cron.log 2>&1
```

Runs nightly at 03:00 UTC, appending output (including any failure) to a log
alongside the backups themselves so a silent failure is still visible on
disk. Installing this line into root's crontab on the VPS is also a
VPS-role/T1 step, not done as part of this commit.

**Note:** as of 2026-09-12 the VPS already has an independent, working
hourly backup (`marches_health_backup.sh`) running as a stopgap outside this
repo — that already covers the immediate data-loss risk this issue
originally flagged. This fix (and the nightly cron above) is the proper
long-term fix living in-repo, not an urgent gap-filler.
