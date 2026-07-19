// Pure rules-engine functions: turn a saved CharacterData's stored *choices*
// back into computed numbers for the character sheet view (M4). No React,
// no side effects — every function here is a plain, testable transform.
import { getClass, getSpecies, listEquipment } from '@data'
import { parseEquipmentOptions } from '../character-wizard/parsing'
import type { Ability, CharacterData } from '../character-wizard/types'

/** floor((score - 10) / 2). Must use Math.floor (not truncation) so odd
 * scores below 10 round further down, e.g. 7 -> -1.5 -> -2. */
export function abilityModifier(score: number): number {
  return Math.floor((score - 10) / 2)
}

/**
 * Applies the background ability-score increase on top of the wizard's base
 * assignment. Handles both increase shapes a saved character can carry:
 *   { plusOne: [a, b, c] }              -> a, b, c each get +1
 *   { plusTwo: X, plusOne: [Y] }        -> X gets +2, Y gets +1
 * Every final score is capped at 20 (SRD: no increase can raise a score
 * above 20).
 */
export function finalAbilityScores(data: CharacterData): Record<Ability, number> {
  const result = { ...data.abilityScores.assignment }
  const increase = data.abilityScores.backgroundIncrease

  if (increase.plusTwo) {
    const ability = increase.plusTwo as Ability
    result[ability] = result[ability] + 2
  }
  if (increase.plusOne) {
    for (const name of increase.plusOne) {
      const ability = name as Ability
      result[ability] = result[ability] + 1
    }
  }

  // M5: fold in Ability Score Improvement choices recorded during leveling.
  // Absent-safe — older M3/M4 saved characters have no `levelUps` at all.
  for (const entry of data.levelUps ?? []) {
    const abilityIncreases = entry.featChoice?.abilityIncreases
    if (!abilityIncreases) continue
    for (const ability of abilityIncreases) {
      result[ability] = result[ability] + 1
    }
  }

  for (const ability of Object.keys(result) as Ability[]) {
    if (result[ability] > 20) result[ability] = 20
  }

  return result
}

/** Parses the "+N" proficiency bonus off the class's featureTable row for the
 * given target level (1-10). */
export function proficiencyBonus(classId: string, level: number): number {
  const classEntry = getClass(classId)
  if (!classEntry) throw new Error(`Unknown class: ${classId}`)
  const row = classEntry.featureTable.find((r) => r.level === level)
  if (!row) throw new Error(`No level-${level} feature row for class: ${classId}`)
  const match = row.proficiencyBonus.match(/\+(\d+)/)
  if (!match) throw new Error(`Unparseable proficiencyBonus for class: ${classId}`)
  return parseInt(match[1], 10)
}

/**
 * Total HP at the given level. Level 1 = hit-die max + Con modifier (minimum
 * 1), unchanged from M4. Levels 2..N each add a fixed per-level amount
 * (derived from hitPointDie as floor(dieMax/2)+1, e.g. d6->4, d8->5, d10->6,
 * d12->7) + Con modifier, minimum 1 per level (SRD fixed-HP-per-level rule;
 * no die-roll option in scope). Dwarven Toughness (speciesId "dwarf") adds
 * +1 at level 1 and +1 more at every level gained thereafter.
 */
export function hitPoints(classId: string, level: number, conModifier: number, speciesId: string): number {
  const classEntry = getClass(classId)
  if (!classEntry) throw new Error(`Unknown class: ${classId}`)
  const match = classEntry.hitPointDie.match(/D(\d+)/i)
  if (!match) throw new Error(`Unparseable hitPointDie for class: ${classId}`)
  const dieMax = parseInt(match[1], 10)
  const fixedPerLevel = Math.floor(dieMax / 2) + 1

  const species = getSpecies(speciesId)
  const isDwarf = species?.name === 'Dwarf'

  let total = Math.max(1, dieMax + conModifier) + (isDwarf ? 1 : 0)

  for (let lvl = 2; lvl <= level; lvl++) {
    total += Math.max(1, fixedPerLevel + conModifier) + (isDwarf ? 1 : 0)
  }

  return total
}

/** Strips a leading quantity ("8 Javelins" -> "Javelins") and a leading
 * "and " conjunction, and trims trailing punctuation. */
function cleanItemToken(raw: string): string {
  return raw
    .trim()
    .replace(/^and\s+/i, '')
    .replace(/^\d+\s+/, '')
    .replace(/\.$/, '')
    .trim()
}

/**
 * Computes AC for a class/equipment-choice/Dex-modifier combination.
 *
 * Known, accepted gap: this does not special-case Barbarian/Monk Unarmored
 * Defense (which use Con or Wis in place of a flat 10) — every class that
 * ends up with no matched armor falls back to the plain 10 + dexModifier
 * unarmored formula.
 */
export function armorClass(classId: string, equipmentChoiceLetter: string, dexModifier: number): number {
  const classEntry = getClass(classId)
  if (!classEntry) throw new Error(`Unknown class: ${classId}`)

  const options = parseEquipmentOptions(classEntry.startingEquipment)
  const chosen = options.find((o) => o.letter.toUpperCase() === equipmentChoiceLetter.toUpperCase())

  const armorList = listEquipment('armor')
  let bodyArmorProperties: string | undefined
  let hasShield = false

  if (chosen) {
    const tokens = chosen.text.split(',').map(cleanItemToken).filter((t) => t.length > 0)
    for (const token of tokens) {
      const match = armorList.find((a) => a.name.toLowerCase() === token.toLowerCase())
      if (!match || !match.properties) continue
      if (match.name === 'Shield') {
        hasShield = true
      } else {
        bodyArmorProperties = match.properties
      }
    }
  }

  let base: number
  if (bodyArmorProperties) {
    const capMatch = bodyArmorProperties.match(/AC:\s*(\d+)\s*\+\s*Dex modifier(?:\s*\(max\s*(\d+)\))?/i)
    if (capMatch) {
      const flatPart = parseInt(capMatch[1], 10)
      const cap = capMatch[2] ? parseInt(capMatch[2], 10) : undefined
      const dexBonus = cap !== undefined ? Math.min(dexModifier, cap) : dexModifier
      base = flatPart + dexBonus
    } else {
      const flatMatch = bodyArmorProperties.match(/AC:\s*(\d+)/)
      base = flatMatch ? parseInt(flatMatch[1], 10) : 10 + dexModifier
    }
  } else {
    // Unarmored fallback (gap noted above: doesn't handle Unarmored Defense).
    base = 10 + dexModifier
  }

  if (hasShield) {
    base += 2
  }

  return base
}

export interface SpellSlotInfo {
  cantrips: number
  slotsByLevel: Record<number, number>
}

/**
 * Spellcasting numbers for a class at the given target level, or undefined
 * for non-casters. Most casters expose spellSlotTable directly; Warlock has
 * none and instead carries its Pact Magic counts as string columns on that
 * level's featureTable row (Cantrips / Spell Slots / Slot Level).
 */
export function spellSlots(classId: string, level: number): SpellSlotInfo | undefined {
  const classEntry = getClass(classId)
  if (!classEntry) throw new Error(`Unknown class: ${classId}`)

  if (classEntry.spellSlotTable) {
    const row = classEntry.spellSlotTable.find((r) => r.level === level)
    if (!row) return undefined
    return { cantrips: row.cantrips ?? 0, slotsByLevel: row.slotsByLevel }
  }

  const featureRow = classEntry.featureTable.find((r) => r.level === level)
  const cols = featureRow?.extraColumns
  if (cols && 'Cantrips' in cols && 'Spell Slots' in cols && 'Slot Level' in cols) {
    const cantrips = parseInt(cols['Cantrips'], 10) || 0
    const slotLevel = parseInt(cols['Slot Level'], 10) || 1
    const slotCount = parseInt(cols['Spell Slots'], 10) || 0
    return { cantrips, slotsByLevel: { [slotLevel]: slotCount } }
  }

  return undefined
}

/** Feature names granted exactly at the given level (that level's
 * featureTable row's feature list). Returns [] if the class has no row for
 * that level. */
export function featuresForLevel(classId: string, level: number): string[] {
  const classEntry = getClass(classId)
  if (!classEntry) throw new Error(`Unknown class: ${classId}`)
  const row = classEntry.featureTable.find((r) => r.level === level)
  return row ? row.features : []
}

/** True if the class gains "Ability Score Improvement" at the given level. */
export function isAsiLevel(classId: string, level: number): boolean {
  return featuresForLevel(classId, level).includes('Ability Score Improvement')
}

/** Standard SRD 5e skill -> governing-ability mapping (not present in the
 * content pack, hardcoded here same as ALL_SKILLS in character-wizard/types.ts). */
const SKILL_ABILITIES: Record<string, Ability> = {
  Acrobatics: 'Dexterity',
  'Animal Handling': 'Wisdom',
  Arcana: 'Intelligence',
  Athletics: 'Strength',
  Deception: 'Charisma',
  History: 'Intelligence',
  Insight: 'Wisdom',
  Intimidation: 'Charisma',
  Investigation: 'Intelligence',
  Medicine: 'Wisdom',
  Nature: 'Intelligence',
  Perception: 'Wisdom',
  Performance: 'Charisma',
  Persuasion: 'Charisma',
  Religion: 'Intelligence',
  'Sleight of Hand': 'Dexterity',
  Stealth: 'Dexterity',
  Survival: 'Wisdom',
}

export function skillBonus(
  skillName: string,
  abilityScores: Record<Ability, number>,
  skillProficiencies: string[],
  profBonus: number,
): number {
  const ability = SKILL_ABILITIES[skillName]
  if (!ability) throw new Error(`Unknown skill: ${skillName}`)
  const mod = abilityModifier(abilityScores[ability])
  return mod + (skillProficiencies.includes(skillName) ? profBonus : 0)
}
