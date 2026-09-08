# Plan: Issue #2 — Origin feats that grant spells/cantrips don't allow new spells to be selected

## Goal
A character whose **Background** grants a spell-casting Origin feat (currently only Magic Initiate exists in the pack, e.g. Sage → "Magic Initiate (Wizard)") gets a real spell-picker for that feat's 2 cantrips + 1 level-1 spell during character creation — regardless of whether their class is itself a spellcaster.

## Root cause
This isn't Sage-specific or a picker bug — it's a structural gap:
- `CharacterData` (`client/src/character-wizard/types.ts`) has **no field at all** for feat-granted spells. `spells` is class-spellcasting only; `originFeatId` (line 95) only records *which* Origin feat a **species'** Versatile trait grants — nothing stores chosen spells for either a background's fixed feat or a Versatile-chosen one.
- The wizard's Spells step (`CreateCharacterPage.tsx:133`) is gated entirely on `isCaster`, which is `getCasterCounts(classEntry) !== null` (`character-wizard/parsing.ts:82`) — purely a function of the **class**. A non-caster class (e.g. Fighter) never renders a Spells step at all, no matter what the background grants.
- **Live-confirmed** (2026-09-08): a Fighter + Sage character's wizard shows "Step 3 of 7" with no Spells step anywhere in the flow — confirming the class-only gate, not a display/data-curation issue.
- The **level-up** flow (`LevelUpPage.tsx:326`) has the identical class-only `isCaster` gate — same gap would resurface every level for a non-caster Sage character, relevant to Magic Initiate's SRD "Spell Change" swap ability. **Scoped out of this fix** — folds into #6 (Add ability to change prepared spells), which already covers spell-swapping generally.

## Scope decision: background-granted only, not Versatile-chosen
Magic Initiate can currently reach a character two ways:
1. **Background's fixed feat text** (e.g. Sage → always "Magic Initiate (Wizard)") — spell list is fixed by data, no extra player choice needed beyond the spells themselves. This is what issue #2 actually reports and is a self-contained fix.
2. **Species Versatile trait** → player freely picks any Origin feat via `originFeatId`; if they pick Magic Initiate, they'd *also* need to choose a spell list (Cleric/Druid/Wizard), and if the character also has a background-granted Magic Initiate, SRD's "must choose a different spell list each time" (feats.json's `repeatable: true` note) means the two picks can't collide.

Path 2 needs its own spell-list-picker UI and a cross-check against path 1 — genuinely separate work. **Filed as #15**, depends on this fix's data-model addition landing first. This plan covers path 1 only.

## Proposed fix

### 1. Data model (`character-wizard/types.ts`)
Add a new field, sibling to `spells`:
```ts
// Spells chosen for a spell-granting Origin feat granted by the character's
// Background (e.g. Sage's fixed "Magic Initiate (Wizard)"). Separate from
// class spellcasting `spells` above — populated only when the background
// grants such a feat. See docs/planning/issue-2-plan.md.
originFeatSpells?: { cantrips: string[]; prepared: string[] }
```
Reuses the same `{cantrips, prepared}` shape as `spells` so it can drive the existing `StepSpells` component unchanged (2 cantrips, 1 "prepared" = the level-1 spell).

### 2. Detect a background-granted spell feat (`CreateCharacterPage.tsx`)
Add a helper alongside the existing `findFeatByBackgroundFeatText`:
```ts
/** If the background's fixed feat is Magic Initiate, returns the spell list
 * class name from its parenthetical (e.g. "Wizard"); undefined otherwise.
 * Magic Initiate is currently the only Origin feat in the pack that grants
 * spells — this is a targeted check, not a generic "does this feat grant
 * spells" data field (that would need a data-pack schema change; not
 * warranted for one feat). */
function backgroundFeatSpellList(featText: string | undefined): string | undefined {
  if (!featText) return undefined
  if (findFeatByBackgroundFeatText(featText)?.id !== 'magic-initiate') return undefined
  return featText.match(/\(([^)]+)\)/)?.[1]
}
```

### 3. Wizard step gating and rendering
- Change the `spells` step filter (line 133-135) from `s !== 'spells' || isCaster` to `s !== 'spells' || isCaster || !!backgroundFeatSpellList(backgroundEntry?.feat)`, so the step appears whenever *either* condition applies.
- Inside the `spells` step JSX, render the existing class-caster `StepSpells` block conditionally on `isCaster` (as today), **and** a second `StepSpells` block conditionally on `backgroundFeatSpellList(...)` being set, with `cantripCount={2}`, `preparedCount={1}`, driving `originFeatSpells` state instead of `spells` state.
- **Duplicate-pick guard:** when both blocks are visible for the same spell list (e.g. a Sage *Wizard*, whose class list and feat list are both "Wizard"), nothing stops picking the same cantrip in both pickers — wasted but not illegal per SRD, yet it'll read as a bug to a playtester. Add an optional `excludeIds?: string[]` prop to `StepSpells` (filtering `cantripOptions`/`leveledOptions`), and pass each block the other's currently-chosen ids.
- Update `canAdvance()`'s `'spells'` case to also require `originFeatSpells` counts met when `backgroundFeatSpellList(...)` applies.
- Include `originFeatSpells` in the `handleSave()` payload when present.

### 4. Display (`CharacterSheetPage.tsx`)
Show the feat-granted cantrips/spell near where the background's feat benefit text already renders (the existing `feat.benefit` block, per the file's background-feat display logic) — same treatment as class spells get elsewhere on the sheet.

## Out of scope / follow-ups
- Versatile-trait-chosen Magic Initiate (spell-list picker + collision check) — **#15**.
- Level-up-time "Spell Change" swap and the same non-caster gap at level-up — folds into **#6**.
- No data-pack schema change (e.g. a generic `grantsSpells` field on feats) — not warranted for the one feat that currently needs it; revisit if/when more spell-granting Origin feats are curated.

## Test cases to add
- `backgroundFeatSpellList`: Sage's `"Magic Initiate (Wizard)"` → `"Wizard"`; a non-spell background feat (e.g. Soldier, no feat) → `undefined`; a background with a non-Magic-Initiate feat → `undefined`.
- Wizard flow (component/integration level): Fighter + Sage → Spells step appears with only the feat picker (no class picker); Wizard + Sage → both pickers appear, each independently gated, with cross-exclusion preventing the same spell in both.
- `canAdvance()`: Fighter + Sage can't advance past `spells` until 2 cantrips + 1 spell chosen for the feat.
- Save payload includes `originFeatSpells` when applicable, absent otherwise (mirrors existing `originFeatId` conditional-spread pattern at `handleSave()` line 206).

## Verification
- Run updated `computeSheet`/wizard test suite.
- Live: create a Fighter + Sage character, confirm the Spells step now appears and forces 2 cantrips + 1 spell choice from the Wizard list before allowing save; confirm the saved sheet displays those choices.
- Live: create a Wizard + Sage character, confirm both pickers appear and the same spell can't be picked in both.
