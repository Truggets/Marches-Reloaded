# M4 Execution Plan — Character Sheet View

*Trugg Build · M4 · 2026-07-19*

## Goal (PROJECT_SPEC.md §4)
Read-only computed sheet (modifiers, proficiency, AC, HP, spell slots), printable/exportable.

## What already exists
- M2's `@data` query layer (`getClass`, `getSpecies`, `getBackground`, `getEquipment`, `getSpell`) and frozen schema.
- M3's `CharacterData` shape, persisted as **choices only** — ability roll+assignment+backgroundIncrease, skillProficiencies, equipmentChoice letter, spells. Nothing computed is stored.
- M3's `/api/characters/:id` (`GET`) — already returns a character with `data` parsed back to an object. No new server work needed; this is a pure client milestone.
- M2's `classes.json` armor-relevant precedent: every armor/shield entry's `properties` field has a machine-parseable `AC: ...` string (e.g. `"AC: 16; Strength: Str 13; Stealth: Disadvantage"`, `"AC: 11 + Dex modifier"`, `"AC: +2"` for Shield).

## Load-bearing decision: the reconstruction function is where "store choices, not computed" comes due
M4 is the *first* code that turns M3's stored choices back into final numbers. This is the piece every later milestone (M5 leveling, M6 multiclass) will reuse, so it gets built as a standalone, unit-tested module — not inline JSX — per `CLAUDE.md`'s own testing mandate ("Unit-test the rules engine... ability modifiers, proficiency bonus, AC/HP, spell-slot tables").

`app/client/src/engine/computeSheet.ts` (pure functions, no React):
- `finalAbilityScores(data)` — applies `backgroundIncrease` on top of `assignment`, handling **both** shapes M3 can produce: `{ plusOne: [a,b,c] }` (all three +1) and `{ plusTwo: X, plusOne: [Y] }` (split). Cap every score at 20.
- `abilityModifier(score)` — `Math.floor((score - 10) / 2)` (must be `floor`, not truncation — matters for odd scores below 10).
- `proficiencyBonus(classId)` — read from `getClass(classId).featureTable[0].proficiencyBonus` (already "+2" at level 1 for every class — no new data needed).
- `hitPoints(classId, conModifier)` — `parseInt(getClass(classId).hitPointDie) + conModifier` (e.g. Wizard's `"D6 per Wizard level"` → 6). This is mathematically identical to the SRD's separate "Level 1 Hit Points by Class" table, so no new lookup table needed.
- `armorClass(equipmentChoiceText, dexModifier)` — **narrow, conscious scope call** (M3 only stored the letter + we re-derive the raw option text via `getClass(classId).startingEquipment`, not itemized gear): split the chosen option's item list, match each name against `equipment.json`'s 13 armor/shield entries, parse the matched entry's `properties` field (`AC: N`, `AC: N + Dex modifier`, `AC: N + Dex modifier (max M)`, or `AC: +2` for Shield). If no armor item matches, default to unarmored `10 + dexModifier`. **Known gap, flagged not solved**: this doesn't special-case Barbarian/Monk Unarmored Defense (which use Con/Wis instead of a flat 10) — acceptable for M4, revisit if it bothers actual play.
- `spellSlots(classId)` — level-1 row of `spellSlotTable`, falling back to Warlock's `featureTable[0].extraColumns` shape (same fallback M3's wizard step already established). Non-casters return `undefined`.
- `skillBonus(skillName, data, classId)` — ability modifier for that skill's governing ability, plus proficiency bonus if the skill is in the character's `skillProficiencies`.
- **Explicitly out of scope**: spell save DC / spell attack bonus. Checked whether the pack cleanly exposes a spellcasting ability separate from `primaryAbility` — it doesn't for half-casters (Paladin/Ranger's `primaryAbility` is a combined `"Strength and Charisma"` / `"Dexterity and Wisdom"` string, not resolvable to a single casting ability without guessing). The spec only asks for spell *slots*, not DC/attack, so this is a deliberate boundary, not an oversight.

## Test plan (against M3's own real saved characters, known values)
Add `vitest` (Vite-native, no paid/heavy deps, fits the project's "no ongoing costs" constraint) as a client devDependency. `app/client/src/engine/computeSheet.test.ts` asserts against the exact two characters walked live in M4's predecessor:
- **Wizard** (Human, Sage background, Int 14 base → +1/+1/+1 background increase → Int 15): `abilityModifier(15) === 2`, `hitPoints('wizard', conModifier) === 6 + conModifier` (Con was 13→14, mod +2, so HP = 8), `spellSlots('wizard')` L1 row has 2 first-level slots.
- **Fighter** (Dwarf, Soldier background, Str 16 → +2/+1 split → Str 18, Con 13→14): `abilityModifier(18) === 4`, `hitPoints('fighter', +2) === 12`, `armorClass` for equipment option A (Chain Mail) `=== 16` (flat, ignores Dex per Chain Mail's real AC rule) and option B (Studded Leather) `=== 12 + dexModifier`.
- A proficient skill (e.g. Soldier's granted Athletics with Str 18) equals `abilityModifier(18) + proficiencyBonus === 4 + 2 === 6`.

## Task breakdown

### A. Parallel, no risk (starting immediately, no approval needed — pure client, no shared state)
1. **Engine module + tests** (Sonnet, fresh subagent — the highest-judgment piece, given the exact function list, armor-parsing approach, and the two known-value test characters above; this is NOT delegated blind, it's given the frozen spec above almost verbatim). Builds `app/client/src/engine/computeSheet.ts` + `computeSheet.test.ts`, adds `vitest` to `client/package.json` with a `test` script. Must pass `npm test` before reporting done.
2. **Sheet view + print/export UI** (Sonnet, fresh subagent, started in parallel — takes the engine module's function signatures as a contract even before agent 1 finishes, since the signatures are fully specified above). Builds `app/client/src/pages/CharacterSheetPage.tsx` at route `/characters/:id`, fetches via `GET /api/characters/:id`, renders ability scores+modifiers, proficiency bonus, AC, HP, saving throw proficiencies, skill list with bonuses (proficient ones marked), spell slots table (casters only) and chosen cantrips/prepared spells (resolved via `getSpell`), species traits, background feat, equipment choice text. Adds a `@media print` stylesheet (hide nav/buttons, clean single-column layout) and a "Download JSON" button (client-side `Blob`/`URL.createObjectURL`, no server round-trip). Wires the route into `main.tsx` behind `RequireAuth`, and links each row of `CharacterListPage.tsx` to its sheet.

These two are genuinely parallel: the sheet UI just calls the engine functions once they exist, and both start from the same frozen contract, so no sequencing needed — same pattern as M3's server/client split.

### B. Sequential, state-touching (each its own separate go-ahead)
1. **`git push`** once both pieces are merged, `npm test` and `npm run build` pass, and the sheet is verified locally against a real saved character.
2. **Deploy** (`./scripts/deploy.sh`) — pure client change, no migration (M3's `characters` table and `GET /:id` route already exist and need no changes).
3. Read-only verification after: open the sheet for a real character on the deployed site, confirm the numbers match hand-calculation, confirm print preview looks reasonable, confirm JSON download works. No approval needed — doesn't change state beyond step 2.

## Definition of done
Against `https://marches.therinkinc.com`: opening a saved character's sheet shows correct ability modifiers, proficiency bonus, HP, AC (armor-aware, not just flat 10+Dex), and (for casters) spell slots — verified against hand-calculated values for a real Wizard and a real Fighter character, matching the unit tests. Print preview renders a clean single-column sheet. A JSON export downloads successfully.
