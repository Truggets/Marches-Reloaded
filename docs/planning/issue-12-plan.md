# Plan: Issue #12 — Unarmored Defense not factored into AC calculation

## Goal
Barbarian and Monk characters with no armor equipped get the correct SRD 5.2 Unarmored Defense AC (`10 + Dex + Con` for Barbarian, `10 + Dex + Wis` for Monk, voided for Monk while wielding a Shield), instead of the current flat `10 + Dex` fallback.

## Root cause
`armorClass()` in `client/src/engine/computeSheet.ts:113` has an explicit, documented gap (its own doc comment, lines 108–111): the unarmored fallback at line 151 is always `10 + dexModifier`, with no Con/Wis branch for any class.

**Live confirmation (2026-09-08, character `Test boi`, Tiefling Monk 1, Dex 16/+3, Wis 15/+2):** sheet currently shows **AC 13** (`10+3`). Correct value per SRD is **15** (`10+3+2`).

## Data available
The bundled pack already carries what's needed — no new data-curation work required:
- `data/classes.json` → each `ClassEntry.features[]` includes an entry named `"Unarmored Defense"` for Barbarian and Monk only (confirmed via `grep -rl "Unarmored Defense" data/*.json` — no species or feat grants it, so no other source needs checking).
  - Barbarian: *"...your base Armor Class equals 10 plus your Dexterity and Constitution modifiers. **You can use a Shield and still gain this benefit.**"*
  - Monk: *"While you aren't wearing armor **or wielding a Shield**, your base Armor Class equals 10 plus your Dexterity and Wisdom modifiers."*
- SRD multiclass rule (`data/build/source/character-creation.md:919`): *"If you have multiple ways to calculate your Armor Class, you can benefit from only one at a time."* — governs the Barbarian+Monk multiclass case: compute each applicable formula, take the best (highest) one.

## Proposed fix

**`client/src/engine/computeSheet.ts` — `armorClass()`:**
1. Change signature to require ability scores (not optional) and accept the full class list, since both are already in scope at the one real call site:
   ```ts
   export function armorClass(
     classes: CharacterClassEntry[],
     equipmentChoiceLetter: string,
     abilityScores: Record<Ability, number>,
   ): number
   ```
   Equipment/armor training still comes from `classes[0]` only (existing rule, multiclassing grants no new equipment) — `dexModifier` is derived internally from `abilityScores.Dexterity` rather than passed separately, removing one path to inconsistency.
2. In the unarmored branch (replacing line 151's flat fallback): for each class in `classes`, look up `getClass(c.classId)?.features.find(f => f.name === 'Unarmored Defense')`. For any match, parse the secondary ability out of the description with a regex (`/Dexterity and (\w+) modifiers/i`), validate it against the exported `ABILITIES` list (`character-wizard/types.ts`), and **throw** (matching this file's existing convention — `Unknown class:`, `Unparseable hitPointDie:`, `Unknown skill:`) if the parse doesn't resolve to a real ability. This keeps the fix data-driven per this project's design principle while failing loudly instead of silently producing `NaN` on a future homebrew pack with different phrasing.
3. Monk's shield exception: if `hasShield` is true, skip a Monk-sourced Unarmored Defense candidate entirely (its own text voids the benefit while wielding a shield) — Barbarian-sourced candidates remain valid with a shield.
4. If multiple classes yield a valid Unarmored Defense candidate (e.g. Barbarian/Monk multiclass), take the highest resulting AC — implements the SRD "benefit from only one, at a time" rule as "the best one," since there's no UI concept yet for the player to explicitly choose.
5. If no class grants Unarmored Defense, fall back to today's `10 + dexModifier` (unchanged behavior for the other 10 classes).

**Call site — `client/src/pages/CharacterSheetPage.tsx:176`:**
```ts
const ac = classEntry
  ? armorClass(data.classes, data.equipmentChoice, scores)
  : undefined
```
`scores` (from `finalAbilityScores(data)`) is already computed at line 170 — no new data plumbing needed.

## Test cases to add (`computeSheet.test.ts`)
- Monk unarmored, no shield: Dex 16/+3, Wis 15/+2 → AC 15 (ties directly to the live `Test boi` repro above).
- Barbarian unarmored, no shield: Dex/Con example → `10+Dex+Con`.
- Barbarian unarmored **+ shield**: shield bonus still applies on top (`10+Dex+Con+2`).
- Monk unarmored **+ shield**: Unarmored Defense voided, falls back to `10+Dex+2` (shield bonus alone, no Wis).
- Non-UD class unarmored (e.g. Wizard) — regression guard: still `10+Dex`, unchanged.
- Existing armored-AC tests (`fighter` option A/B) updated only to pass an `abilityScores` record instead of a bare `dexModifier` — values unaffected, they don't touch the unarmored branch.
- (Follow-up, not blocking this fix): a Barbarian/Monk multiclass case once that's reachable in a saved character, asserting the higher of the two candidate ACs wins.

## Out of scope / explicitly not touched
- Weapon Mastery, spell attack/DC, and the other accepted gaps (#3, #10, etc.) — unrelated to this fix.
- No change to equipment/armor-proficiency sourcing (still `classes[0]`-only, unchanged existing rule).

## Verification
- Run `computeSheet.test.ts` (new + existing cases pass).
- Reload `Test boi`'s live sheet after deploy and confirm AC reads **15**, not 13.
- Manually spot-check a Barbarian character (create one via the wizard) shows `10+Dex+Con` unarmored, and `+2` more with a Shield equipped.
