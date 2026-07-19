# Build Retro

Running log of what happened at the end of each `trugg-build` milestone — kept short, appended per milestone.

## M7 — 8-bit avatars (2026-07-19)

**What shipped:** deterministic client-side pixel-art avatars (DiceBear, CC0), shown on the character list and sheet, seeded by each character's stable id — no schema/server change.

**What broke or surprised us:** the M7 *deploy* (not the feature itself) caused a real, if brief, production outage. `scripts/deploy.sh`'s release-pruning step and `scripts/rollback.sh`'s default-target selection both sorted release directories by mtime (`ls -t`) to find newest/oldest — but every release is populated via `rsync -a` from the same persistent `$REPO_DIR` working copy, which preserves that source's mtimes, so release directories can end up with identical/stale mtimes. The prune step mistook the release it had *just deployed* for the oldest one and deleted it; the `current` symlink was left pointing at nothing and the whole site 404'd (not just the avatar feature). A first rollback attempt (`rollback.sh` with no argument) picked the *wrong* release for the exact same reason, before an explicit-by-name rollback recovered the site.

**What that changes going forward:** fixed both scripts to sort release directory names (timestamp-prefixed, so lexicographic order == chronological order) instead of relying on mtime — commit `014e566`. Added to `trugg-build`'s own process (this file, plus a §9 "Retro" step) so future milestones' deploys get checked against known deploy-script gotchas rather than re-discovering them. General lesson: **don't trust `ls -t`/mtime-based sorting for anything populated via `rsync -a` from a shared, reused source directory** — mtimes there reflect the source's history, not "when this copy was made."
