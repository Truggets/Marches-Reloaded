import { describe, expect, it } from 'vitest'
import type { CharacterData } from '../character-wizard/types'
import { spellbookForClass, spellbookPicksOwed, spellbookRule } from './spellbook'

function character(overrides: Partial<CharacterData>): CharacterData {
  return {
    speciesId: 'human',
    backgroundId: 'sage',
    classes: [{ classId: 'wizard', level: 1 }],
    abilityScores: {
      rolls: [15, 14, 13, 12, 10, 8],
      assignment: { Strength: 10, Dexterity: 12, Constitution: 13, Intelligence: 14, Wisdom: 10, Charisma: 8 },
      backgroundIncrease: {},
    },
    skillProficiencies: [],
    equipmentChoice: 'A',
    ...overrides,
  }
}

describe('spellbookRule', () => {
  it('parses the Wizard rule from its own Spellcasting prose', () => {
    expect(spellbookRule('wizard')).toEqual({ initial: 6, perLevel: 2 })
  })

  it('is undefined for classes without a spellbook', () => {
    expect(spellbookRule('cleric')).toBeUndefined()
    expect(spellbookRule('fighter')).toBeUndefined()
  })
})

describe('spellbookPicksOwed', () => {
  it('owes the starting book at class level 1, then perLevel', () => {
    expect(spellbookPicksOwed('wizard', 1)).toBe(6)
    expect(spellbookPicksOwed('wizard', 2)).toBe(2)
    expect(spellbookPicksOwed('wizard', 10)).toBe(2)
  })

  it('owes nothing for non-spellbook classes', () => {
    expect(spellbookPicksOwed('cleric', 1)).toBe(0)
  })
})

describe('spellbookForClass', () => {
  it('returns the creation spellbook plus each level-up addition', () => {
    const data = character({
      spells: { cantrips: [], prepared: ['a'], spellbook: ['a', 'b', 'c', 'd', 'e', 'f'] },
      levelUps: [
        { classId: 'wizard', level: 2, hitPointGain: 4, spellsAdded: { cantrips: [], prepared: ['g'], spellbook: ['g', 'h'] } },
      ],
    })
    expect(spellbookForClass(data, 'wizard')).toEqual(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'])
  })

  it('treats a pre-spellbook save (no spellbook field) as its prepared spells being in the book', () => {
    const data = character({
      spells: { cantrips: [], prepared: ['a', 'b', 'c', 'd'] },
      levelUps: [{ classId: 'wizard', level: 2, hitPointGain: 4, spellsAdded: { cantrips: [], prepared: ['e'] } }],
    })
    expect(spellbookForClass(data, 'wizard')).toEqual(['a', 'b', 'c', 'd', 'e'])
  })

  it('mixes legacy and new-format sources without losing either', () => {
    const data = character({
      spells: { cantrips: [], prepared: ['a', 'b'] },
      levelUps: [
        { classId: 'wizard', level: 2, hitPointGain: 4, spellsAdded: { cantrips: [], prepared: ['c'], spellbook: ['c', 'd'] } },
      ],
    })
    expect(spellbookForClass(data, 'wizard')).toEqual(['a', 'b', 'c', 'd'])
  })

  it('reads a multiclass Wizard book only from that class\'s own level-ups', () => {
    const data = character({
      classes: [
        { classId: 'fighter', level: 1 },
        { classId: 'wizard', level: 1 },
      ],
      spells: { cantrips: [], prepared: ['fighter-thing'] },
      levelUps: [
        { classId: 'wizard', level: 1, hitPointGain: 4, spellsAdded: { cantrips: [], prepared: ['x'], spellbook: ['x', 'y'] } },
      ],
    })
    expect(spellbookForClass(data, 'wizard')).toEqual(['x', 'y'])
  })

  it('is empty for a non-spellbook class even if it has prepared spells', () => {
    const data = character({ classes: [{ classId: 'cleric', level: 1 }], spells: { cantrips: [], prepared: ['a'] } })
    expect(spellbookForClass(data, 'cleric')).toEqual([])
  })

  it('deduplicates repeated ids', () => {
    const data = character({ spells: { cantrips: [], prepared: ['a'], spellbook: ['a', 'a'] } })
    expect(spellbookForClass(data, 'wizard')).toEqual(['a'])
  })
})
