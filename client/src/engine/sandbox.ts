// M11 combat sandbox v0: attack-roll resolution for the caster-vs-monster
// scratch space (docs/planning/m11-sandbox-v0-plan.md). Lives in its own file
// rather than computeSheet.ts because it depends on `MonsterEntry` (a
// sandbox/bestiary concept, imported straight from `@data/schema` rather than
// `@data` itself since `listMonsters`/`getMonster` aren't wired into
// data/index.ts yet — see this file's consumers for that caveat) and because
// it's sandbox-specific turn resolution, not general character-sheet rules
// math like the rest of computeSheet.ts.
import type { MonsterEntry } from '@data/schema'
import { spellDamageFor } from './spellDamage'

/** Common shape for "one attack roll resolved": how the d20 landed, whether
 * it hit, whether it was a natural 20, and — when the attacker's damage is
 * known — how much. `damage` is undefined when the attack hit but the
 * attacker's damage isn't available (an uncurated spell, or a monster action
 * missing a parsed damage string) — that's an expected, non-error case; the
 * caller should fall back to showing prose instead of a computed number.
 * `damage` (when present) is always the BASE damage string — a critical hit
 * is never pre-doubled here; a caller that wants crit damage is responsible
 * for doubling the dice itself when `critical` is true. */
export interface AttackResult {
  roll: number
  hit: boolean
  critical: boolean
  damage?: string
}

/**
 * Rolls a d20 (or uses `rollOverride` when supplied, so tests can pin the
 * roll and assert hit/miss/crit logic deterministically instead of relying
 * on live randomness), adds `attackBonus`, and compares to `targetAc`.
 * SRD 5.2 rule: a natural 20 always hits (and is a critical hit) regardless
 * of the resulting total vs. AC; a natural 1 always misses regardless of
 * bonus. Shared by both `resolveSpellAttack` and `resolveMonsterAttack` so
 * the hit/crit/miss logic exists in exactly one place.
 */
function resolveAttackRoll(attackBonus: number, targetAc: number, rollOverride?: number): { roll: number; hit: boolean; critical: boolean } {
  const roll = rollOverride ?? Math.floor(Math.random() * 20) + 1
  if (roll === 20) return { roll, hit: true, critical: true }
  if (roll === 1) return { roll, hit: false, critical: false }
  return { roll, hit: roll + attackBonus >= targetAc, critical: false }
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
  rollOverride?: number,
): AttackResult {
  const { roll, hit, critical } = resolveAttackRoll(attackBonus, targetAc, rollOverride)
  if (!hit) return { roll, hit, critical, damage: undefined }
  return { roll, hit, critical, damage: spellDamageFor(spellId) }
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
  rollOverride?: number,
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

  const { roll, hit, critical } = resolveAttackRoll(attackBonus, playerAc, rollOverride)
  return { roll, hit, critical, actionName: action.name, damage: hit ? action.damage : undefined }
}
