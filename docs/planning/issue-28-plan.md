# Plan: Issue #28 — remaining Weapon Mastery / Fighting Style mechanical effects

## Goal
Follow-up to #3 Tier B: implement the Weapon Mastery properties (Push, Sap, Slow, Topple, Vex,
Cleave, Nick) and Fighting Styles (Great Weapon Fighting, Two-Weapon Fighting) that Tier B
deferred because the combat sandbox had no advantage/disadvantage, condition, or multi-target
state. This isn't a data gap — the rules text was already fully vendored — it's a sandbox-
capability gap.

## Scope split, per `advisor()` review and Truman's own follow-up requests in #marches
Split into two PRs so each stays reviewable (every PR this session has landed one real bug at
~200-600 lines; #28 in one diff would be 6-7 mechanics at once).

**PR A (this change):** the advantage/disadvantage primitive, a position toggle (added after
Truman explicitly asked for one), and every mastery/save mechanic that primitive unlocks —
Vex, Sap, Topple (+ Prone), Push.

**PR B (follow-up):** Cleave (needs multi-target resolution against the sandbox's existing
monster roster) and Great Weapon Fighting (needs the per-die-average math this PR's
`gwfAdjustedDieAverage` groundwork makes trivial to wire in).

**Still deferred, one-word reasons:** Nick (action-economy — the sandbox has no
attacks-per-turn model at all) and Two-Weapon Fighting (same reason, consistent with it being
out of scope since the original M11 sandbox plan). Slow (Speed reduction) is cosmetic-only
without a real turn counter to expire it against — left for a future pass alongside Nick/TWF
rather than built as a no-op display.

## The position toggle
Truman's direct request, mid-session: "Make a position toggle." Added `inMeleeRange: boolean`
to `BattleMonster` (default `true`, matching the sandbox's existing implicit "everything is
adjacent" assumption), toggled manually per monster since there's no turn/movement model to
derive it from. This single primitive does double duty:
- Determines whether a Ranged attack against a Prone target gets advantage (in range) or
  disadvantage (out of range) — the real SRD rule, not a hardcoded simplification.
- Makes Push (previously deferred for lacking exactly this) buildable: on a hit, if the target
  is Large or smaller, it sets `inMeleeRange: false`.

## New pure functions (`engine/sandbox.ts`)
- **`AttackMode`** (`'normal' | 'advantage' | 'disadvantage'`) and a widened `resolveAttackRoll`/
  `resolveSpellAttack`/`resolveMonsterAttack`/`resolveWeaponAttack` — `rollOverride` widened to
  `number | [number, number]` (a pair for advantage/disadvantage, in roll order not pre-sorted),
  `mode` added as a new LAST parameter defaulting to `'normal'` so every existing call site
  (17 in `sandbox.test.ts`, 3 in `CombatSandboxPage.tsx`) needed zero changes. SRD 2024 rule
  followed exactly: a natural 20/1 is checked only against the KEPT die, not either die
  independently. `AttackResult` gained `rolls?: [number, number]`, populated only for a
  non-`'normal'` mode, so the log can show what was actually rolled.
- **`attackModeAgainst({ vexed, prone, targetInMeleeRange, isRanged })`** — the sandbox's
  condition-flags-to-`AttackMode` translation. Multiple advantage sources don't stack; an
  advantage source and a disadvantage source cancel to `'normal'` (not "disadvantage wins").
- **`toppleSaveDc(abilityMod, proficiencyBonus)`** — `8 + abilityMod + proficiencyBonus`, the
  SRD's standard save-DC formula.
- **`savingThrow(modifier, dc, rollOverride?)`** — d20 + modifier vs. DC; no natural-20/1 special
  case (5e's ordinary saving throws don't have one, unlike attack rolls).
- **`gwfAdjustedDieAverage(sides)`** — Great Weapon Fighting's expected per-die average when 1s
  and 2s reroll as 3s, verified against the SRD's own stated d6 (3.5→4.0) and d8 (4.5→4.875)
  figures. Not wired into damage yet (that's PR B) — built now since the math is
  mastery/fighting-style-agnostic and belongs next to the other pure resolvers.
- **`isPushable(size)`** — true for every SRD size except Huge/Gargantuan.

## `engine/computeSheet.ts`
Extracted `isMasteryUnlocked(weapon, classes)` from `grazeDamage`'s inline check (was
`classes.some((c) => c.weaponMasteryIds?.includes(weapon.id))`) — now the single shared gate for
every mastery-property check, both the existing Graze (#3 Tier B) and the four new ones here.

## `pages/CombatSandboxPage.tsx`
`BattleMonster` gains `inMeleeRange`, `prone`, `vexed`, `sapped` — all non-persistent, same
treatment as `currentHp` (never saved to the server, reset by leaving the sandbox). New "In
Melee Range" toggle and a "Stand Up" button (manual, since there's no per-turn movement budget
to derive standing-up from automatically) on the selected monster. `handleAttack`'s weapon
branch now computes the real `AttackMode` before resolving, applies Vex/Sap/Topple/Push on a
hit (gated by `isMasteryUnlocked`, same as Graze), and logs the roll pair + mode when
advantage/disadvantage applied. `handleMonsterAttack` applies and consumes Sap's disadvantage.

## Tests
`sandbox.test.ts`: advantage/disadvantage keeping the correct die, the natural-20/1-on-kept-die
rule, `attackModeAgainst`'s full advantage/disadvantage/cancel matrix, `toppleSaveDc`,
`savingThrow` (including "no special nat-20 rule"), `gwfAdjustedDieAverage` against all 4 SRD
die sizes. `computeSheet.test.ts`: `isMasteryUnlocked` (extracted, same coverage `grazeDamage`
already exercised). 216 tests passing (25 new).

## Verification (PR A)
`npx tsc -b` + `vite build` clean, `vitest run` 216/216. **Not manually browser-tested this
session** — unlike the wizard-flow limitation cited on #16/#26, this repo's automation
limitation was specifically about native `<select>` dropdowns in multi-step wizard state, which
doesn't apply to the sandbox's button-driven UI (M11's original build WAS browser-verified live).
Recommend an actual browser pass — pick a weapon with each of Vex/Sap/Topple/Push, confirm the
condition flags, advantage/disadvantage, and log lines all show correctly — before relying on
this without further testing.

**PR A review (PR #32) caught 2 real bugs, both fixed before merge:** `handleMonsterAttack`
never checked the target's own `prone` flag for its own attack-roll disadvantage (Topple landed
but didn't actually hamper the monster until manually "Stood Up"); and `attackModeAgainst`
wrongly special-cased melee attacks as unconditional advantage against a Prone target instead of
applying the SRD's actual range-only rule to both weapon types (made Push a complete no-op
against melee weapons). Both fixed, `monsterAttackMode` extracted as its own tested pure
function mirroring `attackModeAgainst`. Merged and deployed 2026-09-15 (`4fb6dc2`), confirmed
live by Truman's direct "merge and deploy now."

## PR B: Cleave + Great Weapon Fighting

**Cleave.** On a hit with an unlocked Cleave weapon, resolves a SECOND full attack roll (same
attack bonus, `resolveWeaponAttack` again) against another live monster in the battle roster
(`battleMonsters.find` — the first one that isn't the primary target and has `currentHp > 0`;
the sandbox has no reach/adjacency model to pick a "closer" one from). Damage on that second hit
does NOT add the ability modifier unless it's negative — the SRD's own specific carve-out,
implemented as a new `cleaveDamageString(damage, abilityMod)` in `equipmentAttack.ts` (mirrors
`weaponDamageWithAbilityModifier`, but only fires below zero). The sandbox's one-click-per-attack
model already matches the "once per turn" limit — there's no separate action economy to abuse it
against. Logged as its own `LogEntry` (a real, separate d20 roll deserves its own log line, not a
one-word mastery note) via a new `cleaveLog` variable pushed right after the primary attack's log
entry.

**Great Weapon Fighting.** New `hasGreatWeaponFighting(classes)` / `isTwoHandedWeapon(weapon)` in
`computeSheet.ts` (prose-matched, same convention as every other Fighting Style check) gate a new
`gwf` parameter on `estimateDamage()`, which swaps the ordinary `(sides + 1) / 2` per-die average
for PR A's `gwfAdjustedDieAverage(sides)`. Applies to both the primary hit and a Cleave second
attack with the same weapon. Versatile-held-two-handed is deliberately excluded (unknowable from
current data, stated in PR A's plan) — only the Two-Handed property triggers it.

## Tests (PR B)
`computeSheet.test.ts`: `hasGreatWeaponFighting` (4 cases incl. multiclass), `isTwoHandedWeapon`
(Greatsword/Longsword/Shortsword). `equipmentAttack.test.ts`: `cleaveDamageString` (positive,
zero, negative modifier). 229 tests passing (13 new since PR A's 216).

## Verification (PR B)
`npx tsc -b` + `vite build` clean, `vitest run` 229/229. Not manually browser-tested this
session — same reasoning as PR A (button-driven UI, genuinely feasible to test live, recommended
before relying on this without further testing). Cleave specifically needs at least 2 monsters in
the battle roster to observe — worth calling out in a live test pass since a 1-monster battle
will only ever show "no second target in the battle."
