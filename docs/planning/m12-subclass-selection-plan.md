# M12 — Subclass Selection (closes #21)

## 0. Scope

Issue #21: subclass selection has no consumer at all today — no `subclassId` on
`CharacterClassEntry`, no engine logic, no wizard/level-up step, zero references to
"subclass" anywhere in `client/src`. This is a prerequisite feature, filed so the
M2b plan didn't silently drop the vault's 77 subclass entries.

**In scope:** wire subclass selection using the SRD subclasses already bundled in
`data/classes.json` — every one of the 12 SRD classes already carries exactly one
subclass (confirmed: `barbarian-path-of-the-berserker`, `bard-college-of-lore`, …),
each fully populated (`Subclass.features: Feature[]`, one feature-set per class
already parsed from the SRD markdown at M2). The schema (`data/schema.ts`'s
`Subclass`/`ClassEntry.subclasses`) already exists from M2 — nothing to add there.

**Out of scope:** importing the vault's 77 non-SRD subclass entries via M2b. That
needs its own parser (`data/build/parse-subclasses-import.js`, following the
Phase 2-4 pattern) and is real follow-up work, but #21's actual ask is the
*selection feature*, not the import pipe — and building the feature against the
already-bundled SRD subclasses first means it's real, testable, and demonstrable
without a second decision (namespacing, merge endpoint) blocking it. The data
model below is built so a future import parser slots into the same
`ClassEntry.subclasses` array with zero consumer-side changes, the same way
feats/backgrounds/species/equipment packs already merge into their arrays.

**Confirmed from real data (`data/classes.json`):** every SRD subclass's first
features land at **level 3** of that class (cleric `[3,3,3,6,17]`, wizard
`[3,3,6,10,14]`, fighter `[3,3,7,10,15,18]`, etc. — checked all 12). 2024 rules
unified subclass choice to level 3 across every class, so this isn't a
per-class special case; the unlock level is derived from data
(`min(subclass.features.map(f => f.level))`), not hardcoded to `3`, so it still
works correctly if a future imported subclass has a different first-feature level.

## 1. Data model

`client/src/character-wizard/types.ts` — `CharacterClassEntry` gains:

```ts
export interface CharacterClassEntry {
  classId: string
  level: number
  subclassId?: string // absent until chosen; chosen once at/after the class's
                       // subclass-unlock level, never changes after
}
```

Optional, absent-safe — same convention as every other M5/M6 field. No DB
migration: characters are a JSON blob (`characters.data`), so old saves simply
lack the field until a subclass is chosen for them.

## 2. Engine (`client/src/engine/computeSheet.ts`)

- `subclassUnlockLevel(classId: string): number` — `Math.min` over
  `getClass(classId).subclasses.flatMap(s => s.features.map(f => f.level))`;
  throws if the class has no subclasses at all (shouldn't happen for any
  bundled SRD class, but fails loud rather than silently returning `Infinity`
  and never offering the choice).
- `featuresForLevel(classId, level, subclassId?)` — extended with an optional
  third param; when given, appends that subclass's `Feature`s at this level
  (by name) to the class's own feature-table names for the level. Existing
  call sites (level-up stepper's "New Features" display, `isAsiLevel`) pass no
  third arg and are unaffected — `isAsiLevel` never needs subclass features
  since no bundled subclass grants an ASI.
- No changes to HP, proficiency bonus, spell-slot, or multiclass-prerequisite
  math — subclass is purely a feature-granting/display concern, doesn't touch
  any of the load-bearing multiclass formulas from M6.

## 3. Level-up flow (`client/src/pages/LevelUpPage.tsx`)

**As implemented, two pieces of session state, not one** (a single
`chosenSubclassId` merged at Phase 3 turns out to be broken: `resetLevelChoices()`
nulls it at every `confirmLevel`, so a session stepping past the unlock level
— e.g. target level 5 from a start of 2 — would silently discard the pick by
the time Phase 3 runs). So: `chosenSubclassId` is the in-progress pick for the
*current* level's picker (reset every level, like the other per-level
choices), and `committedSubclassId` is set once inside `confirmLevel` at the
unlock level and survives resets — that's what actually gets merged into the
saved character. In the Phase 2 per-level stepper, when
`classHasSubclasses && level === subclassUnlockLevel(classId) &&
!existingEntry?.subclassId`, render a "Choose a Subclass" section (button-grid
pattern, same shape as the existing new-class picker) listing
`classEntry.subclasses`, each showing its `flavorLine` and its unlock-level
feature names/descriptions so the player can compare before picking. Gate
`canContinue` on a choice being made when this section is showing, same
pattern as `featStepDone`/`spellStepDone`. The `classHasSubclasses` guard
matters: `subclassUnlockLevel` deliberately throws for a class with zero
subclasses (data-gap contract), so every call site must short-circuit around
it rather than let a future subclass-less imported class crash the stepper.

At the Phase 3 confirm-and-save step, merge the committed id onto the final
class entry: `withClassLevel(...)` already preserves unrelated fields via
`{...c, level}` spread, so the merge is `finalClasses.map(c => c.classId ===
classId && committedSubclassId ? {...c, subclassId: committedSubclassId} : c)`.

**Retroactive path (existing characters already at/above unlock level with no
subclass chosen — this ships today for the first time, so plenty of saved
characters qualify immediately, e.g. `Brondra Stonefaith`):** the normal
level-up flow can't reach these players since it requires `targetLevel >
currentClassLevel`. New minimal page `SubclassChoicePage.tsx` at
`/characters/:id/choose-subclass/:classId` — loads the character, shows the
same subclass picker for that one class, PUTs `data.classes` with the entry's
`subclassId` set, no level change, no HP/feat/spell steps. Linked from the
character sheet (see §4) whenever a class qualifies but lacks a choice.

## 4. Character sheet (`client/src/pages/CharacterSheetPage.tsx`)

- Header `classLine` gains the subclass name when set:
  `${className} ${level}${subclassName ? ` (${subclassName})` : ''}`.
- `allFeaturesForClass(classId, level)` gains a `subclassId?` param, passed
  from `data.classes.map(...)` in the Class Features section, so subclass
  features appear inline with the class's own, in level order.
- For any class where `c.level >= subclassUnlockLevel(c.classId) &&
  !c.subclassId`, render a small "Choose Subclass" link to
  `/characters/:id/choose-subclass/:classId` next to that class's features
  heading — covers the retroactive case from §3 without a separate nag banner.
  Gated on `user?.id === character.ownerId`, same as the existing "Level Up"
  button — choosing a subclass mutates the character, so an admin browsing via
  the party view gets the same read-only treatment M8 already established.
- `c.subclassId` is validated against `getClass(c.classId)?.subclasses` before
  ever being passed to `featuresForLevel`/`allFeaturesForClass` — the engine
  deliberately throws on an unknown subclass id, and this is reachable in
  practice (an admin hand-editing a character's JSON via
  `AdminEditJsonPage`, or a future pack re-import renaming subclass ids), so
  the sheet must degrade to an "unknown subclass" note instead of taking down
  the whole page via the root `ErrorBoundary`.

## 5. Tests

`computeSheet.test.ts` additions: `subclassUnlockLevel` returns 3 for a sample
of classes; `featuresForLevel` with a `subclassId` arg includes the subclass's
level-3 features and excludes them below the unlock level; no existing test's
expected output changes (new param is optional, defaults preserve old
behavior).

## 6. Sequencing / delegation

Small, sequential dependency chain (types → engine → level-up UI → sheet UI →
new retroactive-choice page) — not a genuine multi-track parallel job, same
call as the M2b Phase 1 plan made for a similarly-shaped short chain. Building
directly rather than splitting into artificial parallel tracks. Code review
before commit: `feature-dev:code-reviewer` (Opus), builder is this session
(Sonnet) — reviewer ≠ builder per the standing rule.

No DB migration, no server changes (subclass lives entirely in the client-side
`data` JSON blob, already exercised by M6's `classes[]` array). No VPS deploy
this session — commit to `Truggets/marches-reloaded-management` only, per
tonight's explicit instruction.
