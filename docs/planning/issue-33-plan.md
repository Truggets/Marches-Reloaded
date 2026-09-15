# Plan: Issue #33 — spell content-pack import

## Goal
Import the vault's 5 expansion-book spell files (Tasha's Cauldron, Fizban's Treasury,
Acquisitions Incorporated, Arcana Unleashed, Book of Many Things — 12 spells total) via M2b,
which had feats/backgrounds/species/equipment but never spells.

## Confirmed with Truman before building
- **Add `concentration`/`ritual` as real `SpellEntry` fields** — previously untracked even for
  the 339 bundled SRD spells. Bundled: derived from the existing `duration`/`castingTime` text
  (source markdown already encodes both, e.g. "Concentration, up to 1 hour", "1 minute or
  Ritual") — no new bundled data, a parser addition + re-run. Imported: read directly from the
  vault's explicit `"Yes"`/`"No"` fields.
- **Each book imports as its own separate content pack** — not merged into `phb-2024` or a
  shared "expansion-spells" pack.

## Real bug found and fixed along the way: `parse-spells.js` couldn't reproduce `spells.json`
Re-running the bundled spell parser to add `concentration`/`ritual` revealed it currently parses
**0 of 339 spells** on a clean checkout — confirmed with the unmodified script too, not something
this change introduced. Root cause: the vendored source markdown (`data/build/source/spells.md`)
has CRLF line endings on this Windows checkout, and JavaScript's `.` regex metacharacter never
matches a line terminator, **including `\r`** — so every `\n+`-anchored pattern in
`parseSpellBody`'s meta-line regex silently failed to match past the `\r` a `(.+)` capture group
correctly stopped before. The shipped `data/spells.json` was evidently generated on a checkout
with LF line endings at the time; this was a real, previously-undetected reproducibility gap.
**Fixed** with one line — normalize `\r\n` → `\n` once when the source file is read, rather than
patching every `\n` in every regex to `\r?\n`. Verified: re-running the fixed parser now parses
339/339, and every field except the two new ones is byte-for-byte identical to the previously
checked-in `spells.json` (diffed programmatically, not just eyeballed).

## New pure functions / parsers
- **`parseLevelAndSchool(levelStr)`** (`parse-spells-import.js`) — splits the vault's combined
  "2nd-Level Enchantment" / "Evocation Cantrip (0 Level)" / "Necromancy Cantrip" (no suffix, also
  occurs) into numeric `level` + string `school`. Returns `null` (not a throw) so the caller can
  name the offending spell.
- **`splitHigherLevels(mechanicsFirst)`** — pulls the one `mechanics_first` bullet starting
  `"**At Higher Levels:**"` (if present) out into the schema's own `higherLevels` field, same
  place the bundled SRD parser puts the equivalent text, rather than leaving it mixed into the
  general description.
- **`parseSpellsImport(vaultDoc, packId)`** — top-level converter, "reject the whole pack, name
  the offender" convention matching every other M2b importer. Description = `mechanics_first`
  bullets joined (markdown intact — the app already renders it via `renderEmphasis`), plus
  `lore_and_flavor` appended.

## Server / client wiring
Extends the existing single `POST /api/admin/packs/import` endpoint (same merge-on-conflict
pattern as feats/backgrounds/species/equipment — importing spells never wipes another
already-imported field for the same pack id) with a `spells` body field. `AdminPackImportPage.tsx`
gets a 5th textarea, with an explicit note that each book needs its own Pack ID. `data/index.ts`'s
`listSpells()`/`getSpell()`/`getSpellsByClass()` now merge in `importedSpells`, same pattern as
feats/backgrounds/species/equipment.

## Tests
- `verify-spells-import.js` + `fixtures/spells-import-sample.json` (new, mirrors
  `verify-feats-import.js`'s fixture-based style since the real vault files aren't committed):
  cantrip vs. leveled level/school parsing (both cantrip phrasings), concentration/ritual
  true/false, higherLevels extraction, description assembly, `.md`-suffix stripping,
  unrecognized-value / unparseable-level / duplicate-id throws naming the offender, explicit
  packId threading. All passing.
- `verify-spells.js` extended with `concentration`/`ritual` assertions on Fireball (both false)
  and Detect Magic (both true), plus an every-spell boolean-field check.
- `vitest run` unaffected (233/233, no client engine logic touched by this issue — this is data
  + admin-import glue, same test-coverage boundary as #16).
- Manually verified the real importer against all 5 actual vault files (not just the fixture) —
  all 12 spells parsed cleanly, spot-checked one full output by hand (Booming Blade, Tasha's Mind
  Whip) for level/school split, higherLevels extraction, and description assembly correctness.

## Explicitly out of scope
- Actually importing the 5 books into production — this PR ships the pipeline; Truman does the
  paste-and-import himself via the admin UI, same as the PHB-2024 import.
- Subclasses, monsters/hazards/magic items — separate follow-ups (subclass import parser doesn't
  exist yet despite the M12 selection feature; #22 covers the bestiary content).

## Verification
`node data/build/verify-pack.js`, `node data/build/verify-spells.js`, `node
data/build/verify-spells-import.js` all passing. `tsc -b` + `vite build` clean, `vitest run`
233/233. Server route change syntax-checked (`node --check`) — this app has no server-side test
suite (matches the rest of `server/src/routes/`, none of which are unit tested).
