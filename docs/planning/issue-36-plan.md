# Issue #36 — CRLF breaks 4 bundled build scripts

**Status:** fix applied 2026-11-19 (same branch). Verified: all four parsers run, verify-*.js pass, regenerated JSON is JSON-equal to the checked-in files.

## Root cause
Vendored `data/build/source/*.md` have CRLF line endings on a Windows checkout. `.` never matches ``, so regexes written for LF fail silently. `parse-spells.js` (#33/PR #35), `parse-equipment.js` and `parse-monsters.js` already read with `.replace(/
/g, '
')`. Confirmed 2026-11-19 by reading the read lines: `parse-classes.js:186`, `parse-feats.js:67`, `parse-backgrounds.js:94`, `parse-species.js:102` call plain `fs.readFileSync(SOURCE_PATH, 'utf8')`. The failures described in the issue (0 classes parsed, crash on missing section) were not re-run here.

## Fix
Append `.replace(/
/g, '
')` to those four reads. Reproducibility only; shipped `data/*.json` is unaffected.

## Verification (per script, not bulk)
1. Run the script before and after the fix into a scratch copy of the output; diff against the checked-in JSON.
2. Expect zero diff (the issue says these were generated on LF checkouts). Any diff is a finding to explain, not to accept.
3. Run the matching `verify-*.js`.
4. Optional hardening: a `.gitattributes` rule (`data/build/source/*.md text eol=lf`) prevents recurrence; separate decision.
