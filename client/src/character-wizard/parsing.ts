// Parsers for the raw SRD prose fields on ClassEntry — skillProficiencies
// and startingEquipment are both free text ("Choose N: A, B, or C") rather
// than structured data, so the wizard has to parse them at render time.
import { ALL_SKILLS } from './types'

export interface SkillChoice {
  count: number
  options: string[]
}

/**
 * Parses strings like:
 *   "Choose 2: Acrobatics, Animal Handling, Athletics, ..., Perception, or Survival"
 *   "Choose any 3 skills (see Playing the Game)"   <- Bard: no explicit list
 * into a pick-count and an option list. When no list is present (colon
 * missing), falls back to the full SRD skill list — this is the Bard's
 * "choose any 3 skills" wording, a structural outlier among the classes.
 */
export function parseSkillChoice(raw: string): SkillChoice {
  const countMatch = raw.match(/Choose\s+(?:any\s+)?(\d+)/i)
  const count = countMatch ? parseInt(countMatch[1], 10) : 1

  const colonIdx = raw.indexOf(':')
  if (colonIdx === -1) {
    return { count, options: ALL_SKILLS }
  }

  const listText = raw.slice(colonIdx + 1)
  const options = listText
    .split(',')
    .map((s) => s.replace(/^\s*or\s+/i, '').trim())
    .filter((s) => s.length > 0)

  return { count, options }
}

export interface EquipmentOption {
  letter: string
  text: string
}

/**
 * Parses strings like:
 *   "Choose A or B: (A) Greataxe, ...; or (B) 75 GP"
 *   "Choose A, B, or C: (A) ...; (B) ...; or (C) 155 GP"   <- Fighter: 3 options
 * into a list of lettered options, without assuming the count is always 2.
 */
export function parseEquipmentOptions(raw: string): EquipmentOption[] {
  const segments = raw.split(';')
  const options: EquipmentOption[] = []

  for (const segment of segments) {
    const match = segment.match(/\(([A-Z])\)\s*(.+)/)
    if (match) {
      options.push({
        letter: match[1],
        text: match[2].trim().replace(/\.$/, ''),
      })
    }
  }

  return options
}

/** Level-1 caster counts, unifying the two shapes ClassEntry can use. */
export interface CasterCounts {
  cantrips: number
  preparedOrKnown: number
}

interface ClassEntryLike {
  spellSlotTable?: Array<{ level: number; cantrips?: number; preparedOrKnown?: number }>
  featureTable: Array<{ level: number; extraColumns: Record<string, string> }>
}

/**
 * Returns level-1 cantrip/prepared-or-known counts for a caster class, or
 * null if the class isn't a caster. Most classes expose spellSlotTable;
 * Warlock has none and instead carries these counts as string columns on
 * its level-1 featureTable row ("Cantrips", "Prepared Spells").
 */
export function getCasterCounts(classEntry: ClassEntryLike): CasterCounts | null {
  if (classEntry.spellSlotTable) {
    const row = classEntry.spellSlotTable.find((r) => r.level === 1)
    if (!row) return null
    return {
      cantrips: row.cantrips ?? 0,
      preparedOrKnown: row.preparedOrKnown ?? 0,
    }
  }

  const featureRow = classEntry.featureTable.find((r) => r.level === 1)
  const cols = featureRow?.extraColumns
  if (cols && ('Cantrips' in cols || 'Prepared Spells' in cols)) {
    return {
      cantrips: parseInt(cols['Cantrips'] ?? '0', 10) || 0,
      preparedOrKnown: parseInt(cols['Prepared Spells'] ?? '0', 10) || 0,
    }
  }

  return null
}
