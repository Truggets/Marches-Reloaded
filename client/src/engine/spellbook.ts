import { getClass } from '@data'
import type { CharacterData } from '../character-wizard/types'

// #5: some casters (SRD: Wizard) keep a spellbook — a list of spells they know
// — and prepare from it. Detected from the class's own Spellcasting prose
// (a "_Spellbook._" paragraph), not a hardcoded class id, matching the
// data-driven convention. Throws if the marker is present but the counts
// can't be parsed, like every other prose parser here.

const NUMBER_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
}

export interface SpellbookRule {
  initial: number // level-1 spells the book starts with
  perLevel: number // spells added per class level after 1
}

const ruleCache = new Map<string, SpellbookRule | null>()

function wordToNumber(word: string, classId: string): number {
  const n = NUMBER_WORDS[word.toLowerCase()] ?? parseInt(word, 10)
  if (!Number.isFinite(n)) throw new Error(`Spellbook rule for ${classId}: can't read count "${word}"`)
  return n
}

export function spellbookRule(classId: string): SpellbookRule | undefined {
  const cached = ruleCache.get(classId)
  if (cached !== undefined) return cached ?? undefined

  const feature = getClass(classId)?.features.find((f) => f.name === 'Spellcasting')
  if (!feature || !feature.description.includes('_Spellbook._')) {
    ruleCache.set(classId, null)
    return undefined
  }
  const start = feature.description.match(/starts with (\w+) level 1/i)
  const perLevel = feature.description.match(/add (\w+) [\w ]*spells of your choice to your spellbook/i)
  if (!start || !perLevel) {
    throw new Error(`Class ${classId} has a Spellbook paragraph but its spell counts couldn't be parsed`)
  }
  const rule = { initial: wordToNumber(start[1], classId), perLevel: wordToNumber(perLevel[1], classId) }
  ruleCache.set(classId, rule)
  return rule
}

/** Spellbook spells the class owes at a given class level (a brand-new class
 * entry at level 1 gets the starting book; later levels add `perLevel`). */
export function spellbookPicksOwed(classId: string, classLevel: number): number {
  const rule = spellbookRule(classId)
  if (!rule) return 0
  return classLevel === 1 ? rule.initial : rule.perLevel
}

/** Every spell in this class's spellbook. A source (creation picks or a
 * level-up entry) with no `spellbook` field predates this feature — its
 * prepared spells were chosen from the whole class list, so they count as
 * book contents (no-loss migration for existing characters). Empty for
 * classes without a spellbook. */
export function spellbookForClass(data: CharacterData, classId: string): string[] {
  if (!spellbookRule(classId)) return []
  const isFirstClass = data.classes[0]?.classId === classId
  const own = (data.levelUps ?? []).filter((lu) => (lu.classId ?? data.classes[0]?.classId) === classId)
  const ids = [
    ...(isFirstClass && data.spells ? data.spells.spellbook ?? data.spells.prepared : []),
    ...own.flatMap((lu) => (lu.spellsAdded ? lu.spellsAdded.spellbook ?? lu.spellsAdded.prepared : [])),
  ]
  return [...new Set(ids)]
}
