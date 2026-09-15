# Plan: subclass content-pack import

Follow-up to `docs/planning/issue-22-and-subclass-import-plan.md`'s research — this doc covers
the actual implementation now that Truman confirmed "yes, build it next."

## Architecture: the one real change beyond #33's pattern
`Subclass` isn't a top-level `ContentPack` category (unlike feats/backgrounds/species/equipment/
spells) — it's nested inside `ClassEntry.subclasses[]` (`data/schema.ts`), and `classes.json`
itself isn't an M2b-importable category. Imported subclasses are stored as their own flat array
(each carrying its own `classId`) and merged into the right bundled class's `subclasses[]` at
READ time by a new `withImportedSubclasses()` helper inside `data/index.ts`'s `getClass()`/
`listClasses()`. Every existing call site (`LevelUpPage.tsx`, `SubclassChoicePage.tsx`,
`CharacterSheetPage.tsx`, `computeSheet.ts`'s `subclassUnlockLevel`/`featuresForLevel`) already
reads `classEntry.subclasses` off whatever `getClass()` returns — so this one merge point is the
ONLY change needed to make imported subclasses show up everywhere a bundled one already does.

## New parser: `parse-subclasses-import.js`
Vault shape: `{ subclasses: [{ name, class, source, category, mechanics_first, lore_and_flavor }] }`.
Each `mechanics_first` bullet is one feature, prefixed `"**<Name> (Level N):**"` — parsed into
`Feature[]` (`{level, name, description}`). `class` is slugified and validated against the app's
12 bundled class ids (`VALID_CLASS_IDS`) — a subclass for a class the app doesn't have (the vault
includes Artificer subclasses; the app has no Artificer class) throws, naming the offender, same
"reject the whole pack" convention as every other importer.

## Real data-quality findings from testing against all 4 real vault files
- **Core Rulebook Subclasses** (48 entries): all parse cleanly.
- **Xanathar's Guide Subclasses** (6): all parse cleanly.
- **Tasha's Cauldron Subclasses** (8): 4 Artificer (reject — no home class) + 4 real (Barbarian
  x2, Monk x2, all well-formed). Importable once the 4 Artificer entries are removed from the
  file by hand first.
- **subclasses-setting-v1** (15): **7 of 15** have at least one `mechanics_first` bullet that
  doesn't match the `"**Name (Level N):**"` shape — e.g. Path of the Giant's first bullet is
  `"**Ability/Stat Gains:** Your Reach increases by 5 feet (at Level 3)..."`, a level-less summary
  rider rather than a per-level feature. This is a real curation gap in that specific file (the
  3 official-book files are all clean), not a parser bug — needs Truman to either reformat those
  7 subclasses' prose to match the convention, or accept importing only the other 8 for now.

**Net: 48 + 6 + 4 = 58 of the 77 vault subclass entries are importable as-is today** (Core
Rulebook + Xanathar's + Tasha's-minus-Artificer). The remaining 19 (4 Artificer, 15 in
subclasses-setting-v1 — 7 malformed, 8 that would parse fine once decoupled from their
malformed siblings) need either data cleanup or a per-file import call excluding the bad entries.

## Server / client wiring
Same pattern as #33: extends `POST /api/admin/packs/import` with a `subclasses` field
(merge-on-conflict, doesn't wipe other content types for the same pack), a 6th
`AdminPackImportPage.tsx` textarea, `data/index.ts` merge (via `getClass()`, not a
`listSubclasses()`/`getSubclass()` pair — subclasses aren't queried standalone anywhere in the
app, only ever through their owning class).

## Tests
`verify-subclasses-import.js` + `fixtures/subclasses-import-sample.json` (new, mirrors
`verify-spells-import.js`'s fixture-based style): normal subclass parsing (id/classId/features in
order), `parseFeatureBullet` directly (including the "returns null, not a throw, for a
non-conforming bullet" case), Artificer-class throw naming the offender, malformed-bullet throw
naming the offender, `VALID_CLASS_IDS` is exactly the 12 bundled classes, no-duplicate-ids,
explicit packId threading. All passing. Manually verified the real parser against all 4 actual
vault files (documented findings above). `vitest run` unaffected (239/239 — no client engine
logic touched, this is data + admin-import glue + one merge-accessor change in `data/index.ts`,
same test-coverage boundary as #33/#16; the `withImportedSubclasses` merge itself matches this
file's existing precedent for `getSpecies`/`getFeat`/etc., none of which have their own vitest
coverage either — exercised by `verify-pack.js` + manual QA instead).

## Explicitly out of scope
- Actually importing the 58 clean subclasses into production — ships the pipeline; Truman
  imports via the admin UI once merged, same as spells.
- Cleaning up `subclasses-setting-v1.json`'s 7 malformed entries — that's editing Truman's own
  vault content, not something to do without being asked.
- Monsters/hazards/magic items — separate research track, see the combined plan doc.

## Verification
`node data/build/verify-subclasses-import.js` passing. `tsc -b` + `vite build` clean, `vitest run`
239/239.
