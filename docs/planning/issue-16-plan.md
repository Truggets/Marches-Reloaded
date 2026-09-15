# Plan: Issue #16 — Language data

## Goal
"No language data in the bundled pack (species/background language grants)." Filed against the
2014-rules assumption that languages come from Background (e.g. "Sage grants two languages").

## Key finding: SRD 5.2 languages aren't granted per-species/background at all
Checked the actual source (`data/build/source/character-creation.md`'s "Choose Languages"
section, part of Step 2 in SRD 2024 creation): **every character simply knows Common plus 2
languages chosen (or rolled) from the Standard Languages table** — a flat, universal rule,
independent of species or background entirely. This is simpler than the issue assumed (no
per-background/species curation needed) and matches this app's target ruleset (SRD 5.2 /
2024 rules), not the 2014 PHB's background-grants-languages model the issue's wording echoed.

Rare languages (Druidic, Thieves' Cant, Undercommon, etc.) come from specific class/background
features, not this creation-time choice — out of scope here, listed in the data (`standard:
false`) for completeness/future display but not offered as a creation pick.

## New bundled data: `data/languages.json`
19 entries (`LanguageEntry`, new type in `schema.ts`): Common (`alwaysKnown: true`) + 9 Standard
(creation-choosable: Common Sign Language, Draconic, Dwarvish, Elvish, Giant, Gnomish, Goblin,
Halfling, Orc) + 9 Rare (Abyssal, Celestial, Deep Speech, Druidic, Infernal, Primordial, Sylvan,
Thieves' Cant, Undercommon). Hand-authored (fixed, small SRD table — no build-script transcription
needed), same precedent as `power-tiers.json`. Bundled-only, same pattern as `listMonsters()` —
not planned as an M2b-importable category.

`data/build/verify-pack.js` extended with count/dedup/pack-tag checks for the new dataset.

## Wizard: new `languages` step
`StepLanguages.tsx` — pick 2 from the 9 non-Common Standard languages, same toggle-grid pattern
as `StepSkills.tsx`. Always shown (every character makes this choice, no class/species gating
needed) — added to `WIZARD_STEPS`/`CreateCharacterPage.tsx`'s step array right after `skills`,
matching the source text's own step ordering.

## Data model
`CharacterData.languages?: string[]` — the 2 chosen ids. Common itself is NOT stored (implied,
same as class weapon/armor proficiencies aren't re-stated per character) — the sheet always
prepends "Common" when displaying.

## Sheet display
New "Languages" section on `CharacterSheetPage.tsx`, right after Skills: "Common, X, Y". Absent-
safe (`data.languages ?? []`) for every character saved before this shipped.

## Explicitly out of scope
- Rare languages as a creation-time pick (not part of the base 3-language grant — SRD 5.2 grants
  those only through specific features).
- Retroactively offering the languages step to existing characters (unlike #26's martial retro-
  picker, an unset `languages` array isn't really "owed" the same way — it's cosmetic/flavor, not
  a mechanical gap, so no urgency to force existing characters through a new step).
- The 1d12 roll option from the source text (only the "choose" path is offered, matching every
  other free-choice pick in this wizard — no other step offers a random-roll alternative either).

## Tests
`node data/build/verify-pack.js` — 19 languages present, exactly 1 `alwaysKnown` (Common), 9
`standard && !alwaysKnown`, no duplicate ids, all tagged `srd-5.2`. No new client-engine test
file — this is pure data + wizard glue, same test-coverage boundary as the rest of the data
layer (covered by `verify-pack.js`, not `computeSheet.test.ts`, since no new engine/rules logic
was added).

## Verification
`node data/build/verify-pack.js` — all checks pass. `tsc -b` + `vite build` clean, `vitest run`
195/195 (unchanged — no engine logic touched). Not manually browser-tested this session (same
established limitation as prior sessions).
