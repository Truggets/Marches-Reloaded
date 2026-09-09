# M2b Phase 3 (species) + Phase 4 (equipment) — Execution Plan (shipped 2026-09-09)

## Goal
Per `docs/planning/m2b-execution-plan.md` §2-3 (confirmed scope, unchanged): extend the
admin content-pack importer, already shipped for feats (Phase 1) and backgrounds
(Phase 2), to also import species (18 vault entries) and equipment (38 weapons + 13
armor + 18 adventuring-gear items). Truman approved running both phases in parallel
since they're independent of each other and of the already-shipped phases.

## What already exists
- The full Phase 1/2 pattern: `data/build/parse-<category>-import.js` (CLI, "reject
  whole pack name the offender"), `server/src/routes/admin.js`'s `/packs/import` route
  (merge-on-conflict per content type so importing one type never wipes another already
  stored under the same pack id), `data/index.ts`'s `imported<Type>` merge pattern,
  `AdminPackImportPage.tsx`'s per-type textarea, `ContentPicker.tsx` (already generic).
- Vault sources found: species at `Core-and-Planar-Species.json` (18 entries, `mechanics_
  first: string[]` shape — an array of `"**Trait Name:** description"` strings, not one
  blob like backgrounds); equipment at `Core-Rulebook-Gear-and-Weapons.json` (`weapons`
  38, `armor` 13, `adventuring_gear` 18, all clean structured JSON — no prose parsing
  needed, unlike species/backgrounds).

## Orientation findings (read before building)
1. **Dwarven Toughness is safe.** `computeSheet.ts` checks `species?.name === 'Dwarf'`
   (name-based), not the id — an imported Dwarf (`phb-2024:dwarf`) will still trigger it
   correctly once `getSpecies` merges imported species in. No fix needed beyond the
   merge itself.
2. **Human's Versatile-trait names need normalization at import time**, not the wizard
   changed. `CreateCharacterPage.tsx` checks `t.name === 'Skillful'` / `t.name ===
   'Versatile'` (the bundled pack's SRD-official names). The vault instead titles these
   two trait items `"Versatile Traits - Skilled"` / `"Versatile Traits - Origin Feat"`.
   The species import parser must rename these two specific trait names to `Skillful`/
   `Versatile` — and **throw** if a `"Versatile Traits - *"`-shaped trait name shows up
   that isn't one of those two exact strings, rather than passing an unmapped name
   through unrenamed (same "throw on wrong-but-non-empty" discipline as Phase 2's
   skill-name validation fix).
3. **Elven Lineage stays non-interactive descriptive text — matches existing precedent,
   not a new gap.** Checked the bundled SRD Elf (`data/species.json`): its own Elven
   Lineage trait is already one long descriptive block (the lineage table folded into
   prose), not an interactive picker. The vault's Elven Lineage trait is the same shape.
   So Phase 3 ships it exactly like every other trait (name + full description) — no new
   design pass, no new accepted-gap issue needed (it's the same gap the bundled pack
   already has, e.g. subclass selection issue #21 covers a directly analogous case if
   ever revisited).
4. **Markdown must be preserved, not stripped, on species trait descriptions** — the
   opposite of Phase 2's `toolProficiency`/`equipment` fix. `CharacterSheetPage.tsx:421`
   renders `trait.description` through `renderEmphasis`, which expects `**bold**`
   markers to convert to real emphasis. Do NOT reapply Phase 2's `stripBold` here.
5. **Equipment schema decision (confirmed with Truman): add structured fields.**
   `EquipmentEntry` now has optional `damage`/`mastery`/`ac`/`strength`/`stealth`
   (`data/schema.ts`, already landed). Both the *bundled* SRD parser
   (`data/build/parse-equipment.js`) and the new *import* parser must populate them
   going forward, so `data/equipment.json` and any imported pack share the same shape —
   this is what real weapon-attack math (M11, issue #3) will eventually read. The
   existing prose `description`/`properties` composition stays too (don't remove
   working UI text), the structured fields are additive.
6. **Adventuring gear (18 entries) is in scope**, filed here explicitly rather than
   silently included — fits the existing `'gear'` `EquipmentCategory` with no schema
   change needed beyond the fields in point 5.
7. Expect the vault's species/equipment files to mix non-PHB source books the same way
   backgrounds did — `source` passes through as free text per entry either way, no code
   impact; pack-id splitting is an import-time decision for whoever runs the real
   import, not a parser concern.

## Task breakdown

### (A) Parallel, no-risk — kick off together, no per-task approval needed
1. **Bundled equipment parser update** — `data/build/parse-equipment.js`: populate the
   new `damage`/`mastery` (weapons) and `ac`/`strength`/`stealth` (armor) fields
   alongside the existing prose composition (point 5 above). Regenerate
   `data/equipment.json` via the existing build command, update
   `data/build/verify-equipment.js`'s assertions for the new fields, confirm it still
   passes. This is local, git-reversible, SRD-only data — no production impact.
2. **Species import parser** — `data/build/parse-species-import.js`, mirroring
   `parse-backgrounds-import.js`'s CLI/conventions: input shape `{ species: [{ name,
   source, category, mechanics_first: string[], lore_and_flavor }] }`. Each
   `mechanics_first` string is `"**Label:** rest"` — reuses `findField`-style bolded-
   label extraction per item (not per-blob like backgrounds) for `creatureType`/`size`/
   `speed`, and every other bolded item becomes a `SpeciesTrait {name, description}`
   (description keeps its markdown, point 4). Applies the Human trait rename map with
   throw-on-unmapped (point 2). Fixtures + verify script mirroring Phase 2's structure,
   including a case exercising the rename map's throw path. Validate against the real
   42... (18) real vault entries locally (never committed) before calling it done.
3. **Equipment import parser** — `data/build/parse-equipment-import.js`: input shape
   `{ weapon_mastery_properties: {...}, weapons: [...], armor: [...],
   adventuring_gear: [...] }`. Weapons/armor/gear are already clean structured JSON —
   this is a straight field-mapping exercise (populate `damage`/`mastery` or `ac`/
   `strength`/`stealth` directly from the source fields, `category: 'weapon'|'armor'|
   'gear'`), not prose extraction. `weapon_mastery_properties` itself is a reference
   glossary, not a list of equipment entries — do not import it as gear; each weapon
   entry only needs its own `mastery` property name (e.g. `"Nick"`), not the full rules
   text (which lives in the mastery-property glossary, out of `EquipmentEntry`'s scope
   for now). Fixtures + verify script. Validate against the real vault file locally.
4. **`data/index.ts` merge, both content types** — add `importedSpecies`/
   `importedEquipment` module-level arrays following the exact `importedFeats`/
   `importedBackgrounds` pattern; widen `initPacks()`'s response type; `listSpecies`/
   `getSpecies`/`listEquipment`/`getEquipment` merge bundled + imported the same way
   `listFeats`/`getFeat` do.
5. **`AdminPackImportPage.tsx`** — add "Species JSON" and "Equipment JSON" textareas
   alongside the existing two, same optional-per-field submit logic generalized to 4
   fields instead of 2, result message composing whichever counts came back.

### (B) Sequential, depends on (A)'s parser interfaces landing first
6. **`server/src/routes/admin.js`** — extend the existing feats/backgrounds
   optional-field + merge-on-conflict logic to `species`/`equipment` too (4 optional
   fields now, at least one required, each merged independently against whatever's
   already stored for that pack id). Import `parseSpeciesImport`/`parseEquipmentImport`
   from the two new parser modules (task 2/3), same CJS/ESM interop as the existing
   imports. No production DB/deploy action here — this is still local file editing,
   verified the same way Phase 2's route change was (a throwaway in-memory-DB script),
   not gated.

No step in this plan touches `git push`, `deploy.sh`, or a DB migration — everything
above is local file work + `git commit`, same gating as Phase 1/2. Push still gets its
own separate go-ahead at the end.

## Definition of done
- `node data/build/verify-equipment.js`, a new `verify-species-import.js`, and a new
  `verify-equipment-import.js` all pass.
- `npm --prefix client run build` and `npm --prefix client run test` both clean.
- Both new import parsers validated against the real vault files locally (never
  committed).
- Each piece reviewed as it lands (not batched), same as Phase 2.
- `PROJECT_SPEC.md`'s M2b row updated to reflect Phases 1-4 status (it currently still
  says "Not started," stale since Phase 1).
- `docs/planning/build-retro.md` gets a dated entry for this build.
- Species/equipment bundled data regeneration (task 1) doesn't regress any existing
  test (`npm --prefix client run test` covers `computeSheet.ts`'s armor-class logic,
  which reads `equipment.json` — must still pass after the field additions).
