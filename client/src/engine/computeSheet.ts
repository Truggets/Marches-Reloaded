// Pure rules-engine functions: turn a saved CharacterData's stored *choices*
// back into computed numbers for the character sheet view (M4). No React,
// no side effects — every function here is a plain, testable transform.
import { getClass, getFeat, getSpecies, listEquipment } from '@data'
import { parseEquipmentOptions } from '../character-wizard/parsing'
import { ABILITIES } from '../character-wizard/types'
import type { Ability, CharacterClassEntry, CharacterData } from '../character-wizard/types'
import type { EquipmentEntry } from '@data/schema'

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

  // Defense Fighting Style: +1 AC while wearing body armor (Light/Medium/
  // Heavy) — checked against EVERY class, not just classes[0], since a
  // multiclass character can hold a Fighting Style feat on a later class
  // (e.g. Fighter 1/Paladin 2, Defense picked at the Paladin level). A
  // Shield alone doesn't count; the SRD text is explicit about body armor.
  if (bodyArmorProperties) {
    for (const c of classes) {
      if (!c.fightingStyleFeatId) continue
      const feat = getFeat(c.fightingStyleFeatId)
      if (!feat) continue
      const bonus = fightingStyleAcBonus(feat)
      if (bonus !== undefined) {
        base += bonus
        break // SRD: you can only have one Fighting Style feat active benefit of this kind; no stacking multiple Defense picks
      }
    }
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

/**
 * Parses a class's spellcasting ability from its own feature text — scans
 * every feature (not just one named "Spellcasting", since Warlock's
 * equivalent feature is named "Pact Magic") for the SRD's standard
 * "<Ability> is your/the spellcasting ability" phrasing. Returns undefined
 * for a non-caster class (no feature matches). Throws if a match is found
 * but the captured word isn't one of the six real abilities, matching this
 * file's established convention for parsed-from-prose values.
 *
 * Exported for reuse by StepSpeciesBonus: a PHB-2024-style Magic Initiate
 * derives its spellcasting ability from whichever class's spell list the
 * player picked, rather than offering a free Int/Wis/Cha choice like the
 * SRD 5.2 version — reusing this trusted per-class parser avoids relying on
 * the feat's own prose to state the mapping (which, checked against the
 * real text, is incomplete/example-only, not a clean list). See
 * docs/planning/m2b-phase1-feats-plan.md.
 */
export function parseSpellcastingAbility(classEntry: ReturnType<typeof getClass>): Ability | undefined {
  for (const feature of classEntry?.features ?? []) {
    const match = feature.description.match(/(\w+) is (?:your|the) spellcasting ability/i)
    if (!match) continue
    const ability = ABILITIES.find((a) => a.toLowerCase() === match[1].toLowerCase())
    if (!ability) {
      throw new Error(`Unparseable spellcasting ability for class: ${classEntry?.id} ("${match[1]}")`)
    }
    return ability
  }
  return undefined
}

/**
 * Spell lists a feat lets the player choose from. Two known SRD phrasings:
 * the SRD 5.2 bundled Magic Initiate ("learn two cantrips of your choice
 * from the Cleric, Druid, or Wizard spell list" -> ['Cleric', 'Druid',
 * 'Wizard']), and the PHB-2024 imported-pack phrasing ("Choose one
 * spellcasting class: Bard, Cleric, Druid, Sorcerer, Warlock, or Wizard" ->
 * the same shape, one entry per class). Returns [] for a feat with no such
 * text (most Origin feats don't grant spells) — that's expected, not an
 * error. Throws only if a matching sentence is present but doesn't parse
 * into names, matching this file's parsed-from-prose convention. See
 * docs/planning/issue-15-plan.md and docs/planning/m2b-phase1-feats-plan.md.
 */
export function parseFeatSpellLists(feat: { id: string; benefit: string }): string[] {
  const match =
    feat.benefit.match(/from the ([^.]+) spell list/i) ??
    feat.benefit.match(/[Cc]hoose one spellcasting class:\s*([^.]+)/)
  if (!match) return []
  const lists = match[1]
    .replace(/,? or /i, ', ')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  if (lists.length === 0) {
    throw new Error(`Unparseable feat spell list for feat: ${feat.id} ("${match[1]}")`)
  }
  return lists
}

/**
 * Spellcasting abilities a feat lets the player choose between for its
 * spells (e.g. Magic Initiate: "Intelligence, Wisdom, or Charisma is your
 * spellcasting ability for this feat's spells" -> ['Intelligence', 'Wisdom',
 * 'Charisma']). Returns [] for a feat with no such text. Throws if the
 * sentence is present but a captured word isn't a real ability.
 */
export function parseFeatSpellAbilities(feat: { id: string; benefit: string }): Ability[] {
  const match = feat.benefit.match(/([\w, ]+?) is your spellcasting ability for this feat/i)
  if (!match) return []
  return parseAbilityList(match[1], `feat spellcasting ability for ${feat.id}`)
}

/**
 * True if a feat's own prose says its spellcasting ability is tied to
 * whichever class was chosen, rather than freely picked (PHB-2024's Magic
 * Initiate: "the one associated with the chosen class", vs SRD's free
 * Int/Wis/Cha choice). A *positive* text match, not "parseFeatSpellAbilities
 * returned []" — inferring this mechanic from the absence of the free-choice
 * sentence would misclassify any spell-granting feat whose prose simply
 * phrases the free choice differently (e.g. "Your spellcasting ability for
 * this feat's spells is Wisdom" doesn't match parseFeatSpellAbilities'
 * regex either, but isn't derived-from-class) as silently, confidently
 * derived instead of degrading to a safe fallback.
 */
export function featAbilityDerivedFromChosenClass(feat: { benefit: string }): boolean {
  return /associated with the chosen class/i.test(feat.benefit)
}

/** Splits an "X, Y, or Z" (or bare "X") ability list into real Ability
 * values, throwing if any captured word isn't a real ability — shared by
 * every feat-prose parser that captures this shape (see
 * parseFeatSpellAbilities above and parseFeatAbilityIncrease below). */
function parseAbilityList(raw: string, context: string): Ability[] {
  const words = raw
    .replace(/,? or /i, ', ')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  const abilities = words.map((w) => ABILITIES.find((a) => a.toLowerCase() === w.toLowerCase()))
  if (abilities.length === 0 || abilities.some((a) => !a)) {
    throw new Error(`Unparseable ability list in ${context} ("${raw}")`)
  }
  return abilities as Ability[]
}

export type FeatAbilityIncrease =
  | { mode: 'free-choice' } // "+2 to one ability, or +1 to two abilities" — any of the 6 (ASI's own shape)
  | { mode: 'fixed-list'; abilities: Ability[] } // "+1 to one of these N abilities" (Grappler, and every PHB-2024 half-feat)

/** What ability increase (if any) a General/Origin feat's own prose grants,
 * independent of its id — #24: `LevelUpPage.tsx` used to special-case exactly
 * two hardcoded ids (`ability-score-improvement`, `grappler`), which silently
 * dropped the ability increase for every other General feat once a content
 * pack was imported (M2b) and offered them at level-up too. Matches both the
 * SRD's and PHB-2024's phrasings for the free-choice ASI shape, and the
 * "Increase your A[, B[, or C]] score by 1" half-feat shape most PHB-2024
 * General feats use (markdown emphasis markers stripped first, since PHB's
 * source wraps the whole clause in `**…**` while SRD uses `_…_`). Returns
 * undefined for a feat with no ability-increase clause at all (most General
 * feats also grant something else instead/in addition — that's #24's
 * remaining, explicitly out-of-scope-for-tonight gap, not this function's
 * job). Throws only on a matched-but-malformed ability list, same "data gap
 * fails loud" contract as every other feat-prose parser in this file. */
export function parseFeatAbilityIncrease(feat: { id: string; benefit: string }): FeatAbilityIncrease | undefined {
  const stripped = feat.benefit.replace(/[*_]/g, '')
  if (/increase one ability score[^.]*?by 2,?\s*or increase two[^.]*?by 1/i.test(stripped)) {
    return { mode: 'free-choice' }
  }
  const match = stripped.match(/increase your ([\w, ]+?) score by 1\b/i)
  if (!match) return undefined
  return { mode: 'fixed-list', abilities: parseAbilityList(match[1], `feat ability increase for ${feat.id}`) }
}

export interface SpellcastingInfo {
  ability: Ability
  attackBonus: number
  saveDC: number
}

/**
 * Spell attack bonus and spell save DC for one of a character's classes, or
 * undefined for a non-caster class. Proficiency bonus is keyed off *total*
 * character level (via proficiencyBonusMulticlass), matching how a
 * multiclass character's proficiency bonus works everywhere else on the
 * sheet — each caster class still uses its own spellcasting ability.
 */
export function spellcastingInfo(
  classId: string,
  classes: CharacterClassEntry[],
  abilityScores: Record<Ability, number>,
): SpellcastingInfo | undefined {
  const classEntry = getClass(classId)
  if (!classEntry) throw new Error(`Unknown class: ${classId}`)
  const ability = parseSpellcastingAbility(classEntry)
  if (!ability) return undefined

  const profBonus = proficiencyBonusMulticlass(classes)
  const abilityMod = abilityModifier(abilityScores[ability])
  return {
    ability,
    attackBonus: profBonus + abilityMod,
    saveDC: 8 + profBonus + abilityMod,
  }
}

/** The earliest level at which any of a class's subclasses grants a feature —
 * derived from data, not hardcoded, though every bundled SRD subclass grants
 * its first feature at level 3 (2024 rules unified subclass choice to level
 * 3 across every class). Throws if the class has no subclasses at all, so a
 * data gap fails loud instead of silently never offering the choice. */
export function subclassUnlockLevel(classId: string): number {
  const classEntry = getClass(classId)
  if (!classEntry) throw new Error(`Unknown class: ${classId}`)
  if (classEntry.subclasses.length === 0) throw new Error(`Class has no subclasses: ${classId}`)
  return Math.min(...classEntry.subclasses.flatMap((s) => s.features.map((f) => f.level)))
}

/** Feature names granted exactly at the given level (that level's
 * featureTable row's feature list, plus the chosen subclass's own features at
 * this level, if a subclassId is given). Returns [] if the class has no row
 * for that level and the subclass grants nothing here either. */
export function featuresForLevel(classId: string, level: number, subclassId?: string): string[] {
  const classEntry = getClass(classId)
  if (!classEntry) throw new Error(`Unknown class: ${classId}`)
  const row = classEntry.featureTable.find((r) => r.level === level)
  const classFeatures = row ? row.features : []
  if (!subclassId) return classFeatures
  const subclass = classEntry.subclasses.find((s) => s.id === subclassId)
  if (!subclass) throw new Error(`Unknown subclass: ${subclassId} for class ${classId}`)
  const subclassFeatures = subclass.features.filter((f) => f.level === level).map((f) => f.name)
  return [...classFeatures, ...subclassFeatures]
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

// ---- #19: mid-wizard stat-delta preview ----

export interface QuickStats {
  ac?: number
  hp?: number
  saveDc?: number
  skillBonuses?: Record<string, number>
}

/**
 * Best-effort snapshot of a few player-visible derived stats for a
 * provisional (mid-wizard) `CharacterData`, so `CreateCharacterPage` can show
 * a before/after delta as the player makes each choice (#19). Each stat is
 * computed independently and simply omitted (never thrown) if its inputs
 * aren't resolvable yet — e.g. `armorClass` on an equipment letter that
 * doesn't match any of the class's real options, or `hitPoints`/
 * `spellcastingInfo` on a not-yet-real classId. This is intentionally
 * narrower than a general "diff any two characters" API: level is always 1
 * (the wizard only ever builds a level-1 character) and only the first
 * class entry is used (the wizard has no multiclass step).
 */
export function quickStats(data: CharacterData, skillsOfInterest?: string[]): QuickStats {
  const scores = finalAbilityScores(data)
  const classId = data.classes[0]?.classId
  if (!classId) return {}
  const stats: QuickStats = {}

  try {
    stats.ac = armorClass(data.classes, data.equipmentChoice, scores)
  } catch {
    // equipment choice doesn't resolve against this class's real options yet
  }

  try {
    stats.hp = hitPoints(classId, 1, abilityModifier(scores.Constitution), data.speciesId)
  } catch {
    // unknown class/species this early in the wizard
  }

  try {
    const info = spellcastingInfo(classId, data.classes, scores)
    if (info) stats.saveDc = info.saveDC
  } catch {
    // unknown class, or not a caster (spellcastingInfo already returns
    // undefined for that case rather than throwing)
  }

  // Which skills to report a bonus for — defaults to the character's real
  // proficiencies, but a caller diffing "before this pick" vs "after" needs
  // both snapshots to report the SAME skill (e.g. one just-chosen skill the
  // "before" data doesn't have proficiency in yet), so it can pass that
  // skill explicitly rather than relying on `data.skillProficiencies`.
  const skillsToReport = skillsOfInterest ?? data.skillProficiencies
  if (skillsToReport.length > 0) {
    try {
      const profBonus = proficiencyBonusMulticlass(data.classes)
      const skillBonuses: Record<string, number> = {}
      for (const skill of skillsToReport) {
        try {
          skillBonuses[skill] = skillBonus(skill, scores, data.skillProficiencies, profBonus)
        } catch {
          // unrecognized skill name
        }
      }
      stats.skillBonuses = skillBonuses
    } catch {
      // unknown class
    }
  }

  return stats
}

/** Renders only the stats present (and different) in both snapshots as
 * "Label X → Y" lines, e.g. "AC 12 → 16". Skill bonuses are formatted with
 * an explicit sign since a negative bonus reads ambiguously without one. */
export function diffQuickStats(before: QuickStats, after: QuickStats): string[] {
  const lines: string[] = []
  const signed = (n: number) => (n >= 0 ? `+${n}` : `${n}`)

  if (before.ac !== undefined && after.ac !== undefined && before.ac !== after.ac) {
    lines.push(`AC ${before.ac} → ${after.ac}`)
  }
  if (before.hp !== undefined && after.hp !== undefined && before.hp !== after.hp) {
    lines.push(`HP ${before.hp} → ${after.hp}`)
  }
  if (before.saveDc !== undefined && after.saveDc !== undefined && before.saveDc !== after.saveDc) {
    lines.push(`Save DC ${before.saveDc} → ${after.saveDc}`)
  }
  if (before.skillBonuses && after.skillBonuses) {
    for (const [skill, afterBonus] of Object.entries(after.skillBonuses)) {
      const beforeBonus = before.skillBonuses[skill]
      if (beforeBonus !== undefined && beforeBonus !== afterBonus) {
        lines.push(`${skill} ${signed(beforeBonus)} → ${signed(afterBonus)}`)
      }
    }
  }
  return lines
}

// ---- #3: Fighting Style & Weapon Mastery ----

/** The level at which a class grants its Fighting Style choice (Fighter: 1;
 * Paladin/Ranger: 2), or undefined if the class has no Fighting Style
 * feature at all (Barbarian, Rogue). Mirrors `subclassUnlockLevel`'s shape:
 * derived from the class's own featureTable row, not hardcoded per class. */
export function fightingStyleUnlockLevel(classId: string): number | undefined {
  const classEntry = getClass(classId)
  if (!classEntry) throw new Error(`Unknown class: ${classId}`)
  if (!classEntry.features.some((f) => f.name === 'Fighting Style')) return undefined
  const row = classEntry.featureTable.find((r) => r.features.includes('Fighting Style'))
  if (!row) throw new Error(`Class ${classId} has a Fighting Style feature but no featureTable row grants it`)
  return row.level
}

/** If a class's Fighting Style can be replaced by a non-feat cantrip option
 * (Paladin's Blessed Warrior, Ranger's Druidic Warrior — "instead of choosing
 * one of those feats, you can choose the option below"), the spell-list class
 * name those cantrips are learned from ("Cleric", "Druid"), lowercased to
 * match `getClass`'s id convention. Undefined for a class with no such
 * alternate (Fighter has none; Barbarian/Rogue have no Fighting Style at
 * all). */
export function fightingStyleAlternateCantripClass(classId: string): string | undefined {
  const classEntry = getClass(classId)
  if (!classEntry) throw new Error(`Unknown class: ${classId}`)
  const feature = classEntry.features.find((f) => f.name === 'Fighting Style')
  if (!feature) return undefined
  const match = feature.description.match(/learn two (\w+) cantrips/i)
  return match ? match[1].toLowerCase() : undefined
}

/** +N Armor Class bonus granted by the Defense Fighting Style feat while
 * wearing body armor, parsed from the feat's own `benefit` text rather than
 * matched by id — an imported pack could namespace Fighting Style feat ids
 * differently (e.g. "phb-2024:defense"), and this file's convention is to
 * trust prose over ids for exactly that reason. Undefined for a feat that
 * isn't Defense (or any feat with no such bonus). Throws if the phrase
 * matches but the captured number doesn't parse — should be unreachable on
 * real data, matching this file's parsed-from-prose convention. */
export function fightingStyleAcBonus(feat: { id: string; benefit: string }): number | undefined {
  const match = feat.benefit.match(/\+(\d+) bonus to Armor Class/i)
  if (!match) return undefined
  const n = parseInt(match[1], 10)
  if (Number.isNaN(n)) {
    throw new Error(`Unparseable Fighting Style AC bonus for feat ${feat.id}: "${feat.benefit}"`)
  }
  return n
}

/** +N attack-roll bonus granted by the Archery Fighting Style feat for
 * Ranged weapon attacks, parsed from the feat's own `benefit` text (same
 * prose-over-id reasoning as `fightingStyleAcBonus`). Undefined for a feat
 * that isn't Archery. */
export function fightingStyleRangedAttackBonus(feat: { id: string; benefit: string }): number | undefined {
  const match = feat.benefit.match(/\+(\d+) bonus to attack rolls you make with Ranged weapons/i)
  if (!match) return undefined
  const n = parseInt(match[1], 10)
  if (Number.isNaN(n)) {
    throw new Error(`Unparseable Fighting Style ranged attack bonus for feat ${feat.id}: "${feat.benefit}"`)
  }
  return n
}

/** True for a weapon whose `description` marks it "Simple/Martial Ranged
 * Weapons" — same style of check as `weaponMasteryPool`'s `isMelee` helper
 * below, verified against all 38 bundled SRD weapons with zero exceptions
 * (every ranged weapon's description starts "Simple Ranged Weapons." or
 * "Martial Ranged Weapons."). A Thrown melee weapon like Javelin is
 * correctly excluded — it's a Melee weapon usable at range, not a Ranged
 * weapon, and Archery's own SRD text is specific to "Ranged weapons". */
export function isRangedWeapon(weapon: EquipmentEntry): boolean {
  return /Ranged Weapons/.test(weapon.description ?? '')
}

/** The Archery Fighting Style's +N attack-roll bonus for a given weapon —
 * `undefined` (no bonus) unless the weapon is Ranged AND some class in
 * `classes` actually has Archery (checked across every class, not just
 * `classes[0]`, matching `armorClass()`'s Defense handling — a multiclass
 * character can hold a Fighting Style feat on any class). */
export function archeryAttackBonus(weapon: EquipmentEntry, classes: CharacterClassEntry[]): number | undefined {
  if (!isRangedWeapon(weapon)) return undefined
  for (const c of classes) {
    if (!c.fightingStyleFeatId) continue
    const feat = getFeat(c.fightingStyleFeatId)
    if (!feat) continue
    const bonus = fightingStyleRangedAttackBonus(feat)
    if (bonus !== undefined) return bonus
  }
  return undefined
}

/** #28: whether `weapon`'s mastery property is actually usable for `classes`
 * — the SRD's real gate ("usable only by a character who has a feature that
 * unlocks the property"), not just "the weapon happens to print this
 * mastery." Having `mastery: 'X'` on the weapon entry is not, by itself,
 * sufficient — a character who hasn't picked this weapon for their Weapon
 * Mastery can't use its property yet. Shared by every per-property mastery
 * check (`grazeDamage` here, and Vex/Sap/Topple/Cleave/Push in
 * `sandbox.ts`/`CombatSandboxPage.tsx`) so the gate exists in exactly one
 * place. */
export function isMasteryUnlocked(weapon: EquipmentEntry, classes: CharacterClassEntry[]): boolean {
  return classes.some((c) => c.weaponMasteryIds?.includes(weapon.id))
}

/** Graze weapon mastery: the ability modifier a miss with `weapon` still
 * deals as damage, or `undefined` if Graze doesn't apply — either the
 * weapon's mastery property isn't Graze, or it isn't unlocked yet
 * (`isMasteryUnlocked`). */
export function grazeDamage(
  weapon: EquipmentEntry,
  classes: CharacterClassEntry[],
  abilityMod: number,
): number | undefined {
  if (weapon.mastery !== 'Graze') return undefined
  if (!isMasteryUnlocked(weapon, classes)) return undefined
  return abilityMod
}

const WEAPON_MASTERY_COUNT_WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5 }

/** How many kinds of weapons' mastery properties a class can use at the
 * given level, or undefined if the class has no Weapon Mastery feature at
 * all (every other bundled class). Fighter/Barbarian scale with level and
 * carry it as a "Weapon Mastery" featureTable column; Paladin/Ranger/Rogue
 * are a flat count stated only in the feature's own prose ("two kinds of
 * weapons") with no table column — both are real, data-driven shapes, not a
 * data gap (verified against each class's own feature text). Throws if the
 * class has the feature but neither shape parses, so a differently-worded
 * pack feature fails loud instead of silently granting zero masteries. */
export function weaponMasteryCount(classId: string, level: number): number | undefined {
  const classEntry = getClass(classId)
  if (!classEntry) throw new Error(`Unknown class: ${classId}`)
  const feature = classEntry.features.find((f) => f.name === 'Weapon Mastery')
  if (!feature) return undefined

  const row = classEntry.featureTable.find((r) => r.level === level)
  const column = row?.extraColumns?.['Weapon Mastery']
  if (column !== undefined) {
    const n = parseInt(column, 10)
    if (Number.isNaN(n)) {
      throw new Error(`Unparseable Weapon Mastery column value for class ${classId}: "${column}"`)
    }
    return n
  }

  const match = feature.description.match(/mastery properties of (\w+) kinds/i)
  if (!match) throw new Error(`Unparseable Weapon Mastery count for class: ${classId}`)
  const n = WEAPON_MASTERY_COUNT_WORDS[match[1].toLowerCase()]
  if (n === undefined) {
    throw new Error(`Unrecognized Weapon Mastery count word for class ${classId}: "${match[1]}"`)
  }
  return n
}

/** Which weapons a class can choose for its Weapon Mastery picks — the
 * class's own `weaponProficiencies` text, further narrowed to Melee-only
 * when the Weapon Mastery feature's own prose says so (Barbarian: "...Melee
 * weapons of your choice..."; Fighter's otherwise near-identical prose omits
 * "Melee", so it isn't narrowed). Throws for an unrecognized
 * `weaponProficiencies` shape rather than silently returning an empty or
 * wrong list — a future homebrew class needing a new pattern should fail
 * loud here, not offer a subtly incomplete picker. */
export function weaponMasteryPool(classId: string): EquipmentEntry[] {
  const classEntry = getClass(classId)
  if (!classEntry) throw new Error(`Unknown class: ${classId}`)
  const weapons = listEquipment('weapon')
  const isSimple = (w: EquipmentEntry) => /^Simple /.test(w.description ?? '')
  const isMelee = (w: EquipmentEntry) => /Melee Weapons/.test(w.description ?? '')

  const prof = classEntry.weaponProficiencies.trim()
  let pool: EquipmentEntry[]
  if (/^Simple and Martial weapons$/i.test(prof)) {
    pool = weapons
  } else {
    const match = prof.match(/Martial weapons that have the ([\w, ]+?) property/i)
    if (!match) throw new Error(`Unparseable weaponProficiencies for class ${classId}: "${prof}"`)
    const allowedProps = match[1].split(/,?\s+or\s+/i).map((s) => s.trim())
    pool = weapons.filter((w) => isSimple(w) || allowedProps.some((p) => (w.properties ?? '').includes(p)))
  }

  const masteryFeature = classEntry.features.find((f) => f.name === 'Weapon Mastery')
  if (masteryFeature && /Melee weapons/i.test(masteryFeature.description)) {
    pool = pool.filter(isMelee)
  }

  return pool
}

export interface MartialChoiceOwed {
  fightingStyle: boolean
  masteryCount: number
}

/** #26: what Fighting Style / Weapon Mastery choices a class entry currently
 * owes, for a class/level already reached with the field(s) left unset —
 * shared by LevelUpPage.tsx (live, mid-session), MartialChoicePage.tsx (the
 * retroactive picker), and CharacterSheetPage.tsx (the "owed" banner/link),
 * so the same diff logic isn't independently reimplemented three times (the
 * PR #29 review flagged exactly that pattern for Archery/Graze — logic
 * living only as page-component duplication, untestable at the engine
 * level). `fightingStyle` is true iff the class has a Fighting Style feature
 * whose unlock level has been reached and NEITHER the feat nor the
 * cantrip-alternative has been recorded yet. `masteryCount` is diff-based
 * (current level's cap minus however many are already picked) rather than a
 * level check, so it stays correct however many growth levels a level-up
 * session crosses in one sitting, or however many were skipped before this
 * character was ever checked. */
export function martialChoiceOwed(classEntry: CharacterClassEntry): MartialChoiceOwed {
  const fightingStyleLevel = fightingStyleUnlockLevel(classEntry.classId)
  const fightingStyle =
    fightingStyleLevel !== undefined &&
    classEntry.level >= fightingStyleLevel &&
    !classEntry.fightingStyleFeatId &&
    !(classEntry.fightingStyleAlternateCantrips && classEntry.fightingStyleAlternateCantrips.length > 0)

  const masteryCap = weaponMasteryCount(classEntry.classId, classEntry.level)
  const masteryCount = masteryCap !== undefined ? Math.max(0, masteryCap - (classEntry.weaponMasteryIds?.length ?? 0)) : 0

  return { fightingStyle, masteryCount }
}
