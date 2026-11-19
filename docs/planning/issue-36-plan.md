# Issue #36 — CRLF breaks 4 bundled build scripts

**Status:** fixed in PR #45 (2026-11-19). Verified by an independent Opus review: all four parsers run on CRLF, LF and mixed sources; output is byte-equal to the checked-in `data/*.json`; `verify-*.js` pass.

## Root cause
Vendored `data/build/source/*.md` have CRLF line endings on a Windows checkout. `.` never matches a carriage return, so regexes written for LF fail silently. `parse-spells.js` (#33/PR #35), `parse-equipment.js` and `parse-monsters.js` already read with `.replace(/\r\n/g, '\n')`. The four affected scripts called plain `fs.readFileSync(SOURCE_PATH, 'utf8')`: `parse-classes.js:186`, `parse-feats.js:67`, `parse-backgrounds.js:94`, `parse-species.js:102`. Before the fix, on CRLF input: classes and feats parsed 0 entries, backgrounds and species crashed.

## Fix
Append `.replace(/\r\n/g, '\n')` to those four reads. Reproducibility only; shipped `data/*.json` is unaffected. On LF input the replace is a no-op.

## Verification (per script, not bulk)
1. Run each parser before and after the fix; compare to the checked-in JSON.
2. Run the matching `verify-*.js`.
3. Known gap: a lone CR (not part of CRLF) would survive the replace. No current source has one.
4. Optional hardening: a `.gitattributes` rule (`data/build/source/*.md text eol=lf`) prevents recurrence; separate decision.
