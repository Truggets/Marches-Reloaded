# Plan: Issue #3 — Weapon Mastery & Fighting Style

## Goal
"During character creation/level up there is no option to select the weapon mastery &
Fighting Style choices for martial classes." (issue's full text)

## Scope split (Tier A / Tier B), per `advisor()` review
- **Tier A (this change):** selection UI at creation, stored on `CharacterData`, shown on
  the sheet. Mastery names already appear as flavor text in the M11 combat sandbox.
- **Tier B (separate, not started):** the actual mechanical effects — Defense's +1 AC folded
  into `armorClass`, Archery's +2 folded into `weaponAttack`, individual mastery properties
  (Nick, Slow, Sap, Vex, …) implemented in the combat sandbox.
- Tier A is committed as its own change (matches how #20 was scoped), Tier B is a distinct
  follow-up, not filed as its own issue yet — flag if that's wanted separately.

## Data (verified against `data/classes.json`/`data/feats.json`/`data/equipment.json`, no gaps)
Five bundled classes have Weapon Mastery; four have Fighting Style (Barbarian and Rogue
have Weapon Mastery only, no Fighting Style at all):

| Class | Fighting Style unlock | Weapon Mastery count | Count shape |
|---|---|---|---|
| Fighter | Level 1 | 3 → 4 (L4) → 5 (L10) | `featureTable` "Weapon Mastery" column |
| Barbarian | — (none) | 2 → 3 (L4) → 4 (L10) | `featureTable` "Weapon Mastery" column |
| Paladin | Level 2 | 2 (flat) | prose only ("two kinds of weapons") |
| Ranger | Level 2 | 2 (flat) | prose only |
| Rogue | — (none) | 2 (flat) | prose only |

Fighter/Barbarian's count scaling with level and Paladin/Ranger/Rogue's flat prose-only count
are both real, verified shapes — not a data-completeness gap. Weapon Mastery pool per class:
Fighter has no restriction beyond its own `weaponProficiencies` (all weapons); Barbarian's own
Weapon Mastery prose further restricts to Melee only; Rogue's `weaponProficiencies` itself
already restricts martial weapons to Finesse/Light.

Paladin's Blessed Warrior / Ranger's Druidic Warrior: an alternative to picking a Fighting
Style feat — instead, learn two cantrips (Cleric for Paladin, Druid for Ranger) from that
class's own spell list. Since both classes' Fighting Style unlocks at level 2 (never at
creation), this alternative can only ever be offered via the level-up flow — see Tier A's
explicit exclusion below.

## New pure functions (`computeSheet.ts`, all follow the "throw on unknown class id /
unparseable prose" contract already used by `parseFeatAbilityIncrease`/`subclassUnlockLevel`)
- `fightingStyleUnlockLevel(classId)` — the featureTable level granting Fighting Style, or
  `undefined` for a class with none.
- `fightingStyleAlternateCantripClass(classId)` — the spell-list class name (lowercased) for
  a class's Blessed-Warrior-style alternate, parsed from the Fighting Style feature's own
  prose ("learn two (\w+) cantrips"). Built now (tested) for the level-up follow-up to use;
  not called anywhere in this Tier A creation-only slice — see below.
- `weaponMasteryCount(classId, level)` — count from the featureTable column if present, else
  parsed from the feature's own prose ("mastery properties of (\w+) kinds"); `undefined` for
  a class with no Weapon Mastery feature at all.
- `weaponMasteryPool(classId)` — which weapons (`listEquipment('weapon')`) a class can choose
  from: base filter from `weaponProficiencies`, further narrowed to Melee-only if the Weapon
  Mastery feature's own prose says so.

## Data model (`types.ts`) — per-class, mirroring M12's `subclassId` precedent
`CharacterClassEntry` gains `fightingStyleFeatId?: string`, `weaponMasteryIds?: string[]`
(both populated by this change), plus `fightingStyleAlternateCantrips?: string[]` (declared
now for the level-up follow-up, not yet written by anything — Fighter has no alternate, and
Paladin/Ranger's Fighting Style doesn't unlock until level 2, so this can never be reached at
creation). Per-class rather than top-level `CharacterData`, since a future multiclass
Fighter+Paladin build would need two independent Fighting Style picks.

## UI — new `StepMartial.tsx`, wired into `CreateCharacterPage.tsx`
- New `martial` wizard step, shown whenever `weaponMasteryCount(classId, 1)` is defined (true
  for all five martial classes at level 1 — a superset of "has Fighting Style", so one check
  gates the step).
- Fighting Style section only renders when `fightingStyleUnlockLevel(classId) <= level` — at
  creation (level 1) that's Fighter only. A `ContentPicker` over `listFeats('Fighting Style')`.
- Weapon Mastery section: a capped multi-select grid over `weaponMasteryPool(classId)`.
- **Deliberately does NOT render Paladin/Ranger's cantrip alternative** — it can never apply
  at creation (see above), so building untestable UI for it now would ship dead code. Lives
  in the level-up follow-up instead, alongside the rest of Paladin/Ranger's Fighting Style
  prompt.
- `handleChangeClass` (new, mirrors the existing `handleChangeOriginFeat` pattern): switching
  class clears `fightingStyleFeatId`/`weaponMasteryIds` — a different class's Weapon Mastery
  pool can exclude a previously-chosen weapon (Fighter → Barbarian drops ranged weapons
  entirely) or the new class might not have these features at all (→ Wizard). Caught by an
  Opus review before this landed; without it a stale, possibly rules-illegal pick would
  silently survive into `handleSave`.

## `CharacterSheetPage.tsx`
Displays all three fields (`fightingStyleFeatId` via `getFeat`, `fightingStyleAlternateCantrips`
via `getSpell`, `weaponMasteryIds` via `getEquipment`) inside the existing per-class Class
Features block. All three lookups guard with `?? id` so an unresolvable id degrades to
showing the raw id rather than crashing.

## Explicitly out of scope
- Fighter's "replace your Fighting Style feat" and "practice weapon drills" (change one
  Weapon Mastery choice on Long Rest) — no long-rest mechanic exists in this app at all.
- Tier B's mechanical effects (see above).
- **Level-up wiring — tracked as a real gap, not silently dropped:** a Paladin/Ranger who
  reaches level 2 sees "Fighting Style" in their rendered class features and is never asked
  to choose it; a Fighter/Barbarian who reaches level 4 or 10 has their Weapon Mastery count
  grow with no prompt for the new pick(s), and the sheet gives no indication a pick is owed.
  Not a crash or data-loss risk — `LevelUpPage.tsx` already preserves these fields through
  every level-up via its `{...c, ...}` spread — but it's a real half-built state a player will
  actually hit. Filed as a follow-up issue rather than left as a dangling code comment.

## Tests (`computeSheet.test.ts`)
All four new functions, across all five martial classes: unlock levels, alternate-cantrip
class names, mastery counts at every level that changes (1/4/10 for Fighter/Barbarian; 1 for
the flat-count three), and weapon-pool membership/exclusion for Fighter (everything),
Barbarian (melee-only), and Rogue (Finesse/Light-restricted martial weapons excluded).
Unknown-class-id throws for all four.

## Verification
`npx tsc --noEmit` clean, full `vitest run` passing. Not yet manually browser-tested this
session (prior local dev-server verification for #19 hit a native-`<select>` automation
limitation unrelated to this change) — recommend a manual smoke pass through Fighter,
Barbarian, and Rogue creation before relying on this without further testing.

## Tier B (mechanical effects) — scope check before building

Before writing any Tier B code, re-checked what the combat sandbox (`engine/sandbox.ts`,
`pages/CombatSandboxPage.tsx`) actually has state for. It resolves one attack roll at a time
against one target's flat AC — no advantage/disadvantage, no conditions, no cross-turn state,
no second target, no positions/speed. That constrains what's honestly buildable right now far
more than the feat/mastery rules text itself does (the rules text for all 4 Fighting Style
feats and all 8 Weapon Mastery properties was already fully vendored in
`data/build/source/equipment.md`'s "Mastery Properties" section — no missing data, contrary to
a stray code comment elsewhere implying a `weapon_mastery_properties` reference file existed;
it was never built, and wasn't needed since 8 short property descriptions are read directly
from source rather than round-tripped through a new parse/build step).

**Built this pass (B1 — pure math, no missing state):**
- **Defense** (+1 AC while wearing body armor): folded into `armorClass()` in
  `computeSheet.ts`, checked across every class in `classes[]` (not just `classes[0]`) so a
  multiclass Fighting Style on a later class still applies — same reasoning as the existing
  Unarmored Defense multiclass check just above it. Gated on `bodyArmorProperties` being set
  (a Shield alone doesn't count, matching the SRD's "Light, Medium, or Heavy armor" wording).
  This is sheet-visible for every character with the feat, not sandbox-only.
- **Archery** (+2 on Ranged weapon attacks): folded into `CombatSandboxPage.tsx`'s
  `weaponAttackBonus`, gated on the weapon's `description` containing "Ranged Weapons" (same
  test `weaponMasteryPool`'s `isMelee` already uses for Melee).
- **Graze** (on a miss, still deal your ability modifier as damage): the one Weapon Mastery
  property that's pure math with no extra state — wired into `CombatSandboxPage.tsx`'s
  `handleAttack`, gated on the weapon's id actually being unlocked in some class's
  `weaponMasteryIds` (not just "this weapon happens to print Graze"), matching the SRD's "usable
  only by a character who has a feature that unlocks the property" text.
- Both new prose parsers (`fightingStyleAcBonus`, `fightingStyleRangedAttackBonus` in
  `computeSheet.ts`) match the feat's own `benefit` text, not its `id` — an imported pack could
  namespace Fighting Style feat ids differently, and this file's established convention is to
  trust prose over ids for exactly that reason.

**Deferred (B2 — needs state the sandbox doesn't have yet, filed as issue #28):**
- **Push, Sap, Slow, Topple, Vex** — each needs condition/cross-turn tracking (next-attack
  advantage/disadvantage, a Prone condition, a Speed value, a position) the sandbox has none of.
- **Cleave** — needs a second target; the sandbox resolves one attacker vs. one selected target.
- **Nick** — pure action-economy (an extra attack normally costing a Bonus Action instead
  folds into the Attack action); the sandbox has no action-economy model at all, and
  Two-Weapon Fighting itself was already out of scope for the same reason (M11 planning).
- **Great Weapon Fighting** (reroll 1s/2s as 3s) and **Two-Weapon Fighting** (off-hand damage
  modifier) — both left for the same follow-up: GWF needs per-die roll results (the sandbox's
  damage is a single averaged/estimated number, not individual dice) and can't reliably tell
  "Versatile held two-handed" from current data; TWF needs the off-hand/bonus-action extra
  attack the sandbox doesn't model.
