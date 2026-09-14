# Plan: Issue #26 — Weapon Mastery / Fighting Style level-up wiring

## Goal
Follow-up to #3 Tier A: a Paladin/Ranger who reaches level 2 was never prompted for their
Fighting Style choice (feat or the Blessed Warrior/Druidic Warrior cantrip alternative), and a
Fighter/Barbarian who reaches level 4 or 10 had their Weapon Mastery count grow with no prompt
for the new pick(s). Not a crash/data-loss risk (`LevelUpPage.tsx` already preserves the fields
through every level-up via its spread), but a real half-built state a player will actually hit.

## Shared logic: `martialChoiceOwed` (`computeSheet.ts`)
What a `CharacterClassEntry` currently owes — `{ fightingStyle: boolean, masteryCount: number }`
— built from a class entry's `level`/`fightingStyleFeatId`/`fightingStyleAlternateCantrips`/
`weaponMasteryIds`. Weapon Mastery is diff-based (current level's cap minus however many are
already picked), not a level check, so it's correct regardless of how many growth levels were
skipped or crossed in one session. Used by all three call sites below instead of reimplementing
the same diff logic three times — the PR #29 review flagged exactly that pattern (page-component
logic duplicating what should be one tested engine function) for Archery/Graze, so this shipped
consolidated from the start rather than needing a follow-up fix.

## Three call sites
1. **`LevelUpPage.tsx` (live path):** the stepper now renders `StepMartial` (reused from the
   creation wizard, extended — see below) whenever `martialChoiceOwed` says something's owed at
   the level currently being stepped through, built from a synthetic "as of just before this
   level" class entry that folds in whatever's already been committed earlier THIS session (not
   just what's saved on the server) — needed since Fighter/Barbarian's Weapon Mastery can grow at
   multiple levels within one level-up session (e.g. leveling 1->10 in one sitting crosses both
   4 and 10).
2. **`MartialChoicePage.tsx` (new, retroactive path):** mirrors `SubclassChoicePage.tsx`'s role
   for subclasses — a standalone page at `/characters/:id/choose-martial/:classId` for a class
   already past an owed level (from before #26 shipped, or leveled via a session that advanced a
   *different* class). No level/HP/feat/spell changes, just these fields.
3. **`CharacterSheetPage.tsx`:** a "Martial Training" link next to the existing "Choose Subclass"
   link, shown whenever `martialChoiceOwed` reports anything owed for that class (owner-only).

## `StepMartial.tsx` extended, not duplicated
Reused across creation, level-up, and the retroactive picker rather than reimplemented three
times. Two additions:
- **Fighting Style cantrip alternative** (Paladin's Blessed Warrior / Ranger's Druidic Warrior):
  a feat-vs-cantrips toggle, `useState`-backed (not derived from array length — a length-0
  alternate-cantrips array while picking is indistinguishable from "hasn't chosen the
  alternative," which would snap the toggle back mid-pick; this exact bug was caught and fixed
  during the original #3 Tier A build, now actually reachable since level-up gets past level 2).
  Deliberately excluded from creation (`onChangeFightingStyleAlternateCantrips` omitted there) —
  unreachable at level 1 for both classes, so building it would ship dead code, same reasoning
  Tier A used.
- **`lockedWeaponMasteryIds` / `hideFightingStyle` props:** needed because level-up/retroactive
  call sites, unlike creation, can have PRE-EXISTING picks from an earlier level. Without
  `lockedWeaponMasteryIds`, a Fighter reaching level 4 could click one of their level-1 mastery
  picks in the grid and silently un-pick it (the toggle grid has no other way to distinguish
  "already committed" from "new this level"). `hideFightingStyle` suppresses that section once
  chosen — it'd otherwise re-render on every subsequent level-up step since Fighting Style, once
  unlocked, stays "unlocked" at every later level too.

## Tests (`computeSheet.test.ts`)
`martialChoiceOwed`: Paladin below/at/past its Fighting Style unlock level with nothing/a
feat/the cantrip alternative chosen; Fighter's Weapon Mastery diff at level 1 (nothing owed, 3
already picked) vs. level 4 (1 more owed); Barbarian (mastery grows, no Fighting Style ever);
Wizard (owes nothing at all). 7 new tests, 194 total passing.

## Verification
`npx tsc -b` clean, `vitest run` passing (194/194). **Not manually browser-tested this
session** — this repo's established limitation with native `<select>`/multi-step SPA state under
the available browser-automation tool (documented for #19/#3 Tier A) applies here too, and this
change touches three separate multi-step flows (creation is unaffected but level-up and the new
retroactive page are exactly the kind of stateful stepper that's hit this limitation before).
Recommend a manual smoke pass — level a Paladin from 1 to 3 crossing the Fighting Style unlock,
level a Fighter from 1 to 4 crossing a mastery-growth level, and open the retroactive
`/choose-martial/:classId` link for an existing character with an owed pick — before relying on
this without further testing.
