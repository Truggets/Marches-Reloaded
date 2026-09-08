// Pure rules-engine functions: turn a saved CharacterData's stored *choices*
// back into computed numbers for the character sheet view (M4). No React,
// no side effects — every function here is a plain, testable transform.
import { getClass, getSpecies, listEquipment } from '@data'
import { parseEquipmentOptions } from '../character-wizard/parsing'
import { ABILITIES } from '../character-wizard/types'
import type { Ability, CharacterClassEntry, CharacterData } from '../character-wizard/types'

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
 * Parses the ability named in an "Unarmored Defense"-style feature
 * description ("...10 plus your Dexterity and X modifiers...") and returns
 * it, or undefined if the feature text doesn't match that shape at all
 * (i.e. the class has no such feature). Throws if a match is found but the
 * captured ability name isn't one of the six real abilities — a homebrew
 * pack phrasing this differently should fail loudly, not silently produce
 * NaN downstream.
 */
function parseUnarmoredDefenseAbility(classEntry: ReturnType<typeof getClass>): Ability | undefined {
  const feature = classEntry?.features.find((f) => f.name === 'Unarmored Defense')
  if (!feature) return undefined
  const match = feature.description.match(/Dexterity and (\w+) modifiers?/i)
  if (!match) return undefined
  const ability = ABILITIES.find((a) => a.toLowerCase() === match[1].toLowerCase())
  if (!ability) {
    throw new Error(`Unparseable Unarmored Defense ability for class: ${classEntry?.id} ("${match[1]}")`)
  }
  return ability
}

/**
 * Whether a class's Unarmored Defense feature text says a Shield voids the
 * benefit entirely (Monk: "...aren't wearing armor or wielding a Shield...")
 * vs. explicitly allows it (Barbarian: "You can use a Shield and still gain
 * this benefit."). Tests for the two known SRD phrasings positively rather
 * than a loose substring match (both phrasings mention "Shield") and throws
 * on neither matching, so a reworded pack fails loudly instead of silently
 * picking the wrong behavior.
 */
export function unarmoredDefenseVoidedByShield(description: string): boolean {
  if (/aren't wearing armor or wielding a Shield/i.test(description)) return true
  if (/can use a Shield and still gain this benefit/i.test(description)) return false
  throw new Error(`Unparseable Shield interaction in Unarmored Defense text: "${description}"`)
}

/**
 * Computes AC for a character's classes/equipment-choice/ability-scores.
 * `classes[0]` supplies equipment/armor training (multiclassing grants no
 * new equipment — unchanged existing rule). When no matched body armor is
 * worn, checks every class for an "Unarmored Defense"-style feature
 * (SRD: Barbarian uses Con, Monk uses Wisdom in place of a flat 10) and
 * uses whichever grants the highest AC — SRD 5.2 multiclassing rule: "If
 * you have multiple ways to calculate your Armor Class, you can benefit
 * from only one at a time." Monk's own feature text voids the benefit
 * while wielding a Shield; Barbarian's does not.
 */
export function armorClass(
  classes: CharacterClassEntry[],
  equipmentChoiceLetter: string,
  abilityScores: Record<Ability, number>,
): number {
  if (classes.length === 0) throw new Error('No classes')
  const primaryClassId = classes[0].classId
  const classEntry = getClass(primaryClassId)
  if (!classEntry) throw new Error(`Unknown class: ${primaryClassId}`)

  const dexModifier = abilityModifier(abilityScores.Dexterity)

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
    // Unarmored: default 10 + Dex, unless a class grants Unarmored Defense.
    base = 10 + dexModifier
    for (const c of classes) {
      const entry = getClass(c.classId)
      const secondaryAbility = parseUnarmoredDefenseAbility(entry)
      if (!secondaryAbility) continue
      // Monk's Unarmored Defense text explicitly voids the benefit while
      // wielding a Shield; Barbarian's explicitly doesn't.
      const featureText = entry?.features.find((f) => f.name === 'Unarmored Defense')?.description ?? ''
      if (hasShield && unarmoredDefenseVoidedByShield(featureText)) {
        continue
      }
      const candidate = 10 + dexModifier + abilityModifier(abilityScores[secondaryAbility])
      if (candidate > base) base = candidate
    }
  }

  if (hasShield) {
    base += 2
  }

  return base
}

export interface SpellSlotInfo {
  cantrips: number
  preparedOrKnown: number
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
    return { cantrips: row.cantrips ?? 0, preparedOrKnown: row.preparedOrKnown ?? 0, slotsByLevel: row.slotsByLevel }
  }

  const featureRow = classEntry.featureTable.find((r) => r.level === level)
  const cols = featureRow?.extraColumns
  if (cols && 'Cantrips' in cols && 'Spell Slots' in cols && 'Slot Level' in cols) {
    const cantrips = parseInt(cols['Cantrips'], 10) || 0
    const preparedOrKnown = parseInt(cols['Prepared Spells'] ?? '0', 10) || 0
    const slotLevel = parseInt(cols['Slot Level'], 10) || 1
    const slotCount = parseInt(cols['Spell Slots'], 10) || 0
    return { cantrips, preparedOrKnown, slotsByLevel: { [slotLevel]: slotCount } }
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

// ---- M6: multiclassing ----
// SRD 5.2 "Multiclassing" (character-creation.md): proficiency bonus and
// spell slots are governed by *combined* levels; HP and ASI/features are
// governed by *per-class* levels (see functions below for exactly which).

/** Sum of every class's level — "total character level" as used by
 * proficiency bonus and XP-to-next-level (not by HP or ASI timing). */
export function totalCharacterLevel(classes: CharacterClassEntry[]): number {
  return classes.reduce((sum, c) => sum + c.level, 0)
}

/**
 * Proficiency bonus is keyed off *total* character level, not any single
 * class's level (SRD: "based on your total character level"). Any class's
 * featureTable row for that total level gives the same value — the
 * progression is universal across all 12 classes (asserted in tests) — so
 * this just delegates to the single-class `proficiencyBonus` using the
 * first class as a lookup vehicle and the combined level as the target.
 */
export function proficiencyBonusMulticlass(classes: CharacterClassEntry[]): number {
  if (classes.length === 0) throw new Error('No classes')
  return proficiencyBonus(classes[0].classId, totalCharacterLevel(classes))
}

/** floor(dieMax/2)+1, the same fixed-per-level HP formula used by the
 * single-class `hitPoints`, exposed per-class for the multiclass HP sum. */
function fixedHpPerLevel(classId: string): number {
  const classEntry = getClass(classId)
  if (!classEntry) throw new Error(`Unknown class: ${classId}`)
  const match = classEntry.hitPointDie.match(/D(\d+)/i)
  if (!match) throw new Error(`Unparseable hitPointDie for class: ${classId}`)
  return Math.floor(parseInt(match[1], 10) / 2) + 1
}

/**
 * Multiclass HP total. SRD rule: "You gain the level 1 Hit Points for a
 * class only when your total character level is 1" — i.e. the hit-die-max
 * bonus applies exactly once, at level 1 of the character's very first
 * class. Every other level — including level 1 of every class added later
 * via multiclassing — uses the fixed per-level value. `classes[0]` is
 * always the original level-1 class (new classes are appended, never
 * unshifted), so this is safe without tracking an explicit "first class"
 * flag.
 */
export function hitPointsMulticlass(
  classes: CharacterClassEntry[],
  conModifier: number,
  speciesId: string,
): number {
  if (classes.length === 0) throw new Error('No classes')
  const species = getSpecies(speciesId)
  const isDwarf = species?.name === 'Dwarf'
  const perLevel = (fixed: number) => Math.max(1, fixed + conModifier) + (isDwarf ? 1 : 0)

  const [first, ...rest] = classes
  const firstClassEntry = getClass(first.classId)
  if (!firstClassEntry) throw new Error(`Unknown class: ${first.classId}`)
  const firstDieMatch = firstClassEntry.hitPointDie.match(/D(\d+)/i)
  if (!firstDieMatch) throw new Error(`Unparseable hitPointDie for class: ${first.classId}`)
  const firstDieMax = parseInt(firstDieMatch[1], 10)

  let total = Math.max(1, firstDieMax + conModifier) + (isDwarf ? 1 : 0) // level 1 of the first class
  for (let lvl = 2; lvl <= first.level; lvl++) {
    total += perLevel(fixedHpPerLevel(first.classId))
  }
  for (const c of rest) {
    for (let lvl = 1; lvl <= c.level; lvl++) {
      total += perLevel(fixedHpPerLevel(c.classId))
    }
  }
  return total
}

const FULL_CASTER_CLASS_IDS = ['bard', 'cleric', 'druid', 'sorcerer', 'wizard']
const HALF_CASTER_CLASS_IDS = ['paladin', 'ranger']

/**
 * Combined caster level per SRD: all levels in full-caster classes, plus
 * half your COMBINED levels in Paladin/Ranger (rounded UP once, after
 * summing) — the SRD phrasing "half your levels ... in the Paladin and
 * Ranger classes" refers to the total of both, not each rounded
 * independently. This matters when a character has levels in BOTH:
 * Paladin 1 / Ranger 1 must be half of 2 = 1, not ceil(1/2)+ceil(1/2) = 2.
 * Warlock is deliberately excluded — its Pact Magic is a wholly separate
 * slot pool (see `warlockPactMagic`), never folded into this total.
 */
export function combinedCasterLevel(classes: CharacterClassEntry[]): number {
  let fullLevels = 0
  let halfLevels = 0
  for (const c of classes) {
    if (FULL_CASTER_CLASS_IDS.includes(c.classId)) {
      fullLevels += c.level
    } else if (HALF_CASTER_CLASS_IDS.includes(c.classId)) {
      halfLevels += c.level
    }
  }
  return fullLevels + Math.ceil(halfLevels / 2)
}

/**
 * Combined multiclass spell slots, looked up against the standard
 * "Multiclass Spellcaster" table — which has the identical shape/values as
 * any single full-caster's own `spellSlotTable` (verified in tests), so no
 * separate table is bundled; this reuses Wizard's as the lookup vehicle.
 * Returns undefined if the combined caster level is 0 (no full/half caster
 * levels at all).
 */
export function combinedSpellSlots(classes: CharacterClassEntry[]): Record<number, number> | undefined {
  const level = combinedCasterLevel(classes)
  if (level === 0) return undefined
  const wizardEntry = getClass('wizard')
  const row = wizardEntry?.spellSlotTable?.find((r) => r.level === level)
  return row?.slotsByLevel
}

/** Warlock Pact Magic slots — always separate from the combined table above,
 * per SRD ("If you have the Pact Magic feature ... and the Spellcasting
 * feature, you can use the spell slots you gain from Pact Magic..."
 * describing two distinct pools). Undefined if the character has no
 * Warlock levels. */
export function warlockPactMagic(classes: CharacterClassEntry[]): SpellSlotInfo | undefined {
  const warlock = classes.find((c) => c.classId === 'warlock')
  if (!warlock) return undefined
  return spellSlots('warlock', warlock.level)
}

/** Splits a class's raw `primaryAbility` string ("Strength", "Strength or
 * Dexterity", "Dexterity and Wisdom") into the abilities involved and
 * whether satisfying ANY (or) or ALL (and) of them meets the multiclass
 * prerequisite. */
function parsePrimaryAbility(primaryAbility: string): { abilities: Ability[]; mode: 'AND' | 'OR' } {
  if (primaryAbility.includes(' or ')) {
    return { abilities: primaryAbility.split(' or ').map((s) => s.trim()) as Ability[], mode: 'OR' }
  }
  if (primaryAbility.includes(' and ')) {
    return { abilities: primaryAbility.split(' and ').map((s) => s.trim()) as Ability[], mode: 'AND' }
  }
  return { abilities: [primaryAbility.trim() as Ability], mode: 'AND' }
}

/**
 * SRD multiclass prerequisite: to add a new class, ability scores must be
 * >=13 in the new class's primary ability AND in every current class's
 * primary ability (compound abilities resolved via `parsePrimaryAbility`).
 * Levelling a class the character is already in doesn't re-check the
 * prerequisite (only *adding* a new class does).
 */
export function canMulticlassInto(
  classes: CharacterClassEntry[],
  abilityScores: Record<Ability, number>,
  targetClassId: string,
): boolean {
  if (classes.some((c) => c.classId === targetClassId)) return true

  const targetClass = getClass(targetClassId)
  if (!targetClass) return false

  const classIdsToCheck = [...new Set([...classes.map((c) => c.classId), targetClassId])]
  return classIdsToCheck.every((id) => {
    const entry = getClass(id)
    if (!entry) return false
    const { abilities, mode } = parsePrimaryAbility(entry.primaryAbility)
    return mode === 'OR'
      ? abilities.some((a) => abilityScores[a] >= 13)
      : abilities.every((a) => abilityScores[a] >= 13)
  })
}
