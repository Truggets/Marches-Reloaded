// M11 combat sandbox v0: attack-roll resolution for the caster-vs-monster
// scratch space (docs/planning/m11-sandbox-v0-plan.md). Lives in its own file
// rather than computeSheet.ts because it depends on `MonsterEntry` (a
// sandbox/bestiary concept, imported as a type straight from `@data/schema`
// since only the type is needed here — `@data`'s `listMonsters()`/
// `getMonster()` are used by the sandbox page itself, not by this module)
// and because it's sandbox-specific turn resolution, not general
// character-sheet rules math like the rest of computeSheet.ts.
import type { EquipmentEntry, MonsterEntry } from '@data/schema'
import { spellDamageFor } from './spellDamage'

/** #28: whether an attack roll is made normally, with advantage (roll twice,
 * keep the higher), or with disadvantage (roll twice, keep the lower) — the
 * primitive every condition-driven mastery property (Vex, Sap, Topple's
 * Prone) rides on. SRD 2024: only the CHOSEN die matters for a natural
 * 20/natural 1, not either die independently — see `resolveAttackRoll`. */
export type AttackMode = 'normal' | 'advantage' | 'disadvantage'

/** Common shape for "one attack roll resolved": how the d20 landed, whether
 * it hit, whether it was a natural 20, and — when the attacker's damage is
 * known — how much. `damage` is undefined when the attack hit but the
 * attacker's damage isn't available (an uncurated spell, or a monster action
 * missing a parsed damage string) — that's an expected, non-error case; the
 * caller should fall back to showing prose instead of a computed number.
 * `damage` (when present) is always the BASE damage string — a critical hit
 * is never pre-doubled here; a caller that wants crit damage is responsible
 * for doubling the dice itself when `critical` is true. `rolls` (#28) is
 * present only for a non-`'normal'` mode, both dice in roll order (not
 * sorted), so the sandbox log can show what was actually rolled. */
export interface AttackResult {
  roll: number
  hit: boolean
  critical: boolean
  damage?: string
  rolls?: [number, number]
}

/**
 * Rolls a d20 (or uses `rollOverride` when supplied, so tests can pin the
 * roll and assert hit/miss/crit logic deterministically instead of relying
 * on live randomness — for `mode !== 'normal'`, `rollOverride` is the pair
 * `[first, second]` in roll order, not pre-sorted), adds `attackBonus`, and
 * compares to `targetAc`. SRD 5.2 rule: a natural 20 always hits (and is a
 * critical hit) regardless of the resulting total vs. AC; a natural 1 always
 * misses regardless of bonus — and per SRD 2024's advantage/disadvantage
 * rules, that check applies only to the die that was actually kept (the
 * higher for advantage, the lower for disadvantage), not either die
 * independently. Shared by `resolveSpellAttack`, `resolveMonsterAttack`, and
 * `resolveWeaponAttack` so the hit/crit/miss logic exists in exactly one place.
 */
function resolveAttackRoll(
  attackBonus: number,
  targetAc: number,
  mode: AttackMode = 'normal',
  rollOverride?: number | [number, number],
): { roll: number; hit: boolean; critical: boolean; rolls?: [number, number] } {
  if (mode === 'normal') {
    const roll = (typeof rollOverride === 'number' ? rollOverride : undefined) ?? Math.floor(Math.random() * 20) + 1
    if (roll === 20) return { roll, hit: true, critical: true }
    if (roll === 1) return { roll, hit: false, critical: false }
    return { roll, hit: roll + attackBonus >= targetAc, critical: false }
  }

  const rolls: [number, number] = Array.isArray(rollOverride)
    ? rollOverride
    : [Math.floor(Math.random() * 20) + 1, Math.floor(Math.random() * 20) + 1]
  const roll = mode === 'advantage' ? Math.max(...rolls) : Math.min(...rolls)
  if (roll === 20) return { roll, hit: true, critical: true, rolls }
  if (roll === 1) return { roll, hit: false, critical: false, rolls }
  return { roll, hit: roll + attackBonus >= targetAc, critical: false, rolls }
}

/**
 * Resolves one caster's spell attack against a target's AC. Damage on a hit
 * comes from the hand-curated `SPELL_DAMAGE` lookup (spellDamage.ts) — a
 * spell id not in that lookup still resolves hit/miss correctly, it just
 * comes back with `damage: undefined` (not an error; see spellDamage.ts for
 * why the lookup is intentionally partial).
 */
export function resolveSpellAttack(
  spellId: string,
  attackBonus: number,
  targetAc: number,
  rollOverride?: number | [number, number],
  mode: AttackMode = 'normal',
): AttackResult {
  const { roll, hit, critical, rolls } = resolveAttackRoll(attackBonus, targetAc, mode, rollOverride)
  if (!hit) return { roll, hit, critical, damage: undefined, rolls }
  return { roll, hit, critical, damage: spellDamageFor(spellId), rolls }
}

/**
 * Resolves one monster's basic attack against the player's already-computed
 * AC (from `armorClass()`/`armorClassMulticlass` call sites, e.g.
 * CharacterSheetPage.tsx — this function doesn't recompute AC itself). No
 * monster "AI": per the plan's explicit v0 scope, this always uses the
 * monster's first action that has both `attackBonus` and `damage` populated
 * (an action missing either — e.g. a non-attack trait/action like a
 * Multiattack summary or a save-based breath weapon — is skipped). Returns
 * `undefined` if the monster has no such action at all, so the caller can
 * show "this monster has no basic attack" rather than a fabricated result.
 */
export function resolveMonsterAttack(
  monster: MonsterEntry,
  playerAc: number,
  rollOverride?: number | [number, number],
  mode: AttackMode = 'normal',
): (AttackResult & { actionName: string }) | undefined {
  const action = monster.actions.find((a) => a.attackBonus !== undefined && a.damage !== undefined)
  if (!action) return undefined

  // parse-monsters.js is expected to guarantee attackBonus is a "+N"/"-N"
  // string whenever it's populated (docs/planning/m11-sandbox-v0-plan.md);
  // this should be unreachable. Throw rather than silently defaulting to 0
  // (matching computeSheet.ts's "reject rather than silently emit wrong
  // data" convention for every other parsed-from-prose value) — a silent 0
  // attack bonus would resolve every attack as if the monster were far
  // weaker than it actually is, which is worse than crashing loudly.
  const bonusMatch = action.attackBonus!.match(/([+-]?\d+)/)
  if (!bonusMatch) {
    throw new Error(`Unparseable attackBonus for monster "${monster.id}" action "${action.name}": "${action.attackBonus}"`)
  }
  const attackBonus = parseInt(bonusMatch[1], 10)

  const { roll, hit, critical, rolls } = resolveAttackRoll(attackBonus, playerAc, mode, rollOverride)
  return { roll, hit, critical, rolls, actionName: action.name, damage: hit ? action.damage : undefined }
}

/**
 * Resolves one player weapon attack against a target's AC. Damage on a hit
 * comes straight from `weapon.damage` (e.g. "1d8 Piercing") — unlike
 * `resolveSpellAttack`'s curated lookup, this never has to fall back to
 * `undefined` in practice, since the caller (the sandbox's weapon picker) is
 * expected to have already filtered to weapons with `damage !== undefined`
 * (docs/planning/m11-phase2-weapon-attack-plan.md). The type stays honest
 * about it anyway since `AttackResult.damage` is optional. As with the other
 * two resolvers, a crit is never pre-doubled here.
 */
export function resolveWeaponAttack(
  weapon: EquipmentEntry,
  attackBonus: number,
  targetAc: number,
  rollOverride?: number | [number, number],
  mode: AttackMode = 'normal',
): AttackResult {
  const { roll, hit, critical, rolls } = resolveAttackRoll(attackBonus, targetAc, mode, rollOverride)
  if (!hit) return { roll, hit, critical, damage: undefined, rolls }
  return { roll, hit, critical, damage: weapon.damage, rolls }
}

/** #28: Push weapon mastery only affects a creature "Large or smaller" —
 * true for every SRD size except Huge and Gargantuan. */
export function isPushable(size: string): boolean {
  return size !== 'Huge' && size !== 'Gargantuan'
}

/**
 * #28: what `AttackMode` a player's attack against a target should use,
 * given the target's condition flags — the sandbox's stand-in for the SRD's
 * real advantage/disadvantage-source bookkeeping. Multiple advantage
 * sources don't stack (still just `'advantage'`); an advantage source and a
 * disadvantage source together cancel out to `'normal'`, per the SRD 2024
 * rule (not "disadvantage wins," and not "first one applied wins").
 *  - `vexed` (Vex weapon mastery): advantage, unconditionally.
 *  - `prone` + `targetInMeleeRange`: advantage — SRD's Prone condition: "an
 *    attack roll against [a Prone creature] has Advantage if the attacker
 *    is within 5 feet of it, disadvantage otherwise." This is purely about
 *    the ATTACKER'S DISTANCE, not the weapon type — PR #32's review caught
 *    an earlier version of this function that special-cased melee as
 *    unconditional advantage regardless of `targetInMeleeRange`, which both
 *    contradicted this doc comment's own quoted rule and made Push (which
 *    sets `targetInMeleeRange: false`) a complete no-op against melee
 *    weapons. Fixed to apply the same range-only rule to both weapon types.
 *  - `prone` + NOT `targetInMeleeRange`: disadvantage.
 */
export function attackModeAgainst(target: { vexed: boolean; prone: boolean; targetInMeleeRange: boolean }): AttackMode {
  const hasAdvantage = target.vexed || (target.prone && target.targetInMeleeRange)
  const hasDisadvantage = target.prone && !target.targetInMeleeRange
  if (hasAdvantage && hasDisadvantage) return 'normal'
  if (hasAdvantage) return 'advantage'
  if (hasDisadvantage) return 'disadvantage'
  return 'normal'
}

/**
 * #28: what `AttackMode` a MONSTER's own attack should use, given its own
 * condition flags — the mirror of `attackModeAgainst` for the other
 * direction of combat. Sap (disadvantage on the target's next attack) and
 * Prone's own "Disadvantage on attack rolls" are two independent
 * disadvantage sources; either alone (or both together, which still
 * doesn't stack past plain disadvantage) yields `'disadvantage'`. Pulled
 * out as its own pure function (PR #32 review) rather than left as
 * unexported page-component glue, matching this file's Archery/Graze
 * precedent (#3 Tier B PR #29's review) of keeping condition-to-mode logic
 * testable at the engine level, not just inline in `CombatSandboxPage.tsx`.
 */
export function monsterAttackMode(monster: { sapped: boolean; prone: boolean }): AttackMode {
  return monster.sapped || monster.prone ? 'disadvantage' : 'normal'
}

/**
 * #28: Topple weapon mastery's save DC — 8 + the ability modifier used for
 * the attack roll + the attacker's proficiency bonus, the SRD's standard
 * "save DC" formula (same shape as a spell save DC, just keyed off the
 * weapon's ability instead of a spellcasting ability).
 */
export function toppleSaveDc(abilityMod: number, proficiencyBonus: number): number {
  return 8 + abilityMod + proficiencyBonus
}

/**
 * #28: resolves a saving throw — d20 + `modifier` vs `dc`. No advantage/
 * disadvantage modeled (the sandbox has no source of SAVE advantage/
 * disadvantage yet, only attack-roll advantage/disadvantage via `AttackMode`
 * above); `rollOverride` pins the roll for deterministic tests, same
 * convention as `resolveAttackRoll`. Unlike an attack roll, a natural 20/1
 * has no special rule for an ordinary saving throw in 5e — success is
 * purely total-vs-DC.
 */
export function savingThrow(modifier: number, dc: number, rollOverride?: number): { roll: number; success: boolean } {
  const roll = rollOverride ?? Math.floor(Math.random() * 20) + 1
  return { roll, success: roll + modifier >= dc }
}

/**
 * #28: Great Weapon Fighting's expected per-die damage average when a
 * result of 1 or 2 is rerolled as a 3, for a die with `sides` faces — used
 * in place of the ordinary `(sides + 1) / 2` average. Only the two lowest
 * faces change value (1->3, 2->3); every other face keeps its own. New sum
 * = 3 + 3 + (3 + 4 + ... + sides) = `sides*(sides+1)/2 + 3` (the ordinary
 * sum, plus 3, since faces 1 and 2 each gain +2 versus their own value:
 * (3-1)+(3-2)=3). Verified against the SRD's stated effect for d6 (average
 * 4.0, up from 3.5) and d8 (4.875, up from 4.5).
 */
export function gwfAdjustedDieAverage(sides: number): number {
  return (sides * (sides + 1)) / 2 / sides + 3 / sides
}
