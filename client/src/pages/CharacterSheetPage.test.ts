import { describe, expect, it } from 'vitest'
import { formatAbilityIncreases, levelUpFeats } from './CharacterSheetPage'
import type { CharacterData } from '../character-wizard/types'

function baseData(overrides: Partial<CharacterData> = {}): CharacterData {
  return {
    speciesId: 'human',
    backgroundId: 'sage',
    classes: [{ classId: 'fighter', level: 5 }],
    abilityScores: {
      rolls: [15, 14, 13, 12, 10, 8],
      assignment: { Strength: 15, Dexterity: 12, Constitution: 14, Intelligence: 10, Wisdom: 10, Charisma: 8 },
      backgroundIncrease: {},
    },
    skillProficiencies: [],
    equipmentChoice: 'A',
    ...overrides,
  }
}

describe('levelUpFeats (#20: level-up feat choices were persisted but never rendered)', () => {
  it('returns [] for a character with no levelUps at all (old M5 saves)', () => {
    expect(levelUpFeats(baseData())).toEqual([])
  })

  it('returns [] when levelUps exist but none carry a featChoice', () => {
    const data = baseData({ levelUps: [{ classId: 'fighter', level: 2, hitPointGain: 6 }] })
    expect(levelUpFeats(data)).toEqual([])
  })

  it('resolves an ASI-mode feat choice, attributing it to the right class and level', () => {
    const data = baseData({
      levelUps: [
        {
          classId: 'fighter',
          level: 4,
          hitPointGain: 6,
          featChoice: { featId: 'ability-score-improvement', abilityIncreases: ['Strength', 'Strength'] },
        },
      ],
    })
    const result = levelUpFeats(data)
    expect(result).toHaveLength(1)
    expect(result[0].classId).toBe('fighter')
    expect(result[0].level).toBe(4)
    expect(result[0].featId).toBe('ability-score-improvement')
    expect(result[0].featName).toBe('Ability Score Improvement')
    expect(result[0].abilityIncreases).toEqual(['Strength', 'Strength'])
  })

  it('resolves a bare feat choice (no ability increases) and its benefit text', () => {
    const data = baseData({
      levelUps: [{ classId: 'fighter', level: 4, hitPointGain: 6, featChoice: { featId: 'grappler', abilityIncreases: ['Strength'] } }],
    })
    const result = levelUpFeats(data)
    expect(result[0].featName).toBe('Grappler')
    expect(result[0].benefit).toBeTruthy()
  })

  it('falls back to the raw id if the feat is unknown (removed pack, hand-edited JSON) rather than throwing', () => {
    const data = baseData({
      levelUps: [{ classId: 'fighter', level: 4, hitPointGain: 6, featChoice: { featId: 'not-a-real-feat' } }],
    })
    const result = levelUpFeats(data)
    expect(result[0].featName).toBe('not-a-real-feat')
    expect(result[0].benefit).toBeUndefined()
  })

  it('a levelUps entry missing classId (pre-M6) is attributed to the character\'s first class', () => {
    const data = baseData({
      levelUps: [{ level: 4, hitPointGain: 6, featChoice: { featId: 'grappler', abilityIncreases: ['Strength'] } }],
    })
    expect(levelUpFeats(data)[0].classId).toBe('fighter')
  })

  it('a multiclass character attributes each levelUps entry to its own classId, not just classes[0]', () => {
    const data = baseData({
      classes: [
        { classId: 'fighter', level: 4 },
        { classId: 'wizard', level: 1 },
      ],
      levelUps: [
        { classId: 'fighter', level: 4, hitPointGain: 6, featChoice: { featId: 'grappler', abilityIncreases: ['Strength'] } },
        { classId: 'wizard', level: 4, hitPointGain: 4, featChoice: { featId: 'ability-score-improvement', abilityIncreases: ['Intelligence', 'Intelligence'] } },
      ],
    })
    const result = levelUpFeats(data)
    expect(result).toHaveLength(2)
    expect(result.find((f) => f.featId === 'grappler')?.classId).toBe('fighter')
    expect(result.find((f) => f.featId === 'ability-score-improvement')?.classId).toBe('wizard')
  })
})

describe('formatAbilityIncreases', () => {
  it('formats the "+2 to one ability" ASI mode (two identical abilities)', () => {
    expect(formatAbilityIncreases(['Strength', 'Strength'])).toBe('+2 Strength')
  })

  it('formats the "+1 to two abilities" ASI mode (two distinct abilities)', () => {
    expect(formatAbilityIncreases(['Strength', 'Dexterity'])).toBe('+1 Strength, +1 Dexterity')
  })

  it('formats the single-ability Grappler mode', () => {
    expect(formatAbilityIncreases(['Strength'])).toBe('+1 Strength')
  })
})
