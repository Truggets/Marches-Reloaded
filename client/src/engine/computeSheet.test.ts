import { describe, expect, it } from 'vitest'
import { getBackground, getClass } from '@data'
import {
  abilityModifier,
  armorClass,
  finalAbilityScores,
  hitPoints,
  proficiencyBonus,
  skillBonus,
  spellSlots,
} from './computeSheet'
import type { CharacterData } from '../character-wizard/types'

describe('abilityModifier', () => {
  it('uses Math.floor, not truncation, for odd scores below 10', () => {
    expect(abilityModifier(7)).toBe(-2)
  })

  it('computes standard modifiers', () => {
    expect(abilityModifier(10)).toBe(0)
    expect(abilityModifier(18)).toBe(4)
    expect(abilityModifier(20)).toBe(5)
  })
})

describe('Wizard (Human, Sage background)', () => {
  it('Sage grants Intelligence/Wisdom/Constitution', () => {
    const sage = getBackground('sage')
    expect(sage?.abilityScores).toEqual(['Constitution', 'Intelligence', 'Wisdom'])
  })

  const data: CharacterData = {
    speciesId: 'human',
    backgroundId: 'sage',
    classes: [{ classId: 'wizard', level: 1 }],
    abilityScores: {
      rolls: [15, 14, 13, 12, 10, 8],
      assignment: {
        Strength: 10,
        Dexterity: 12,
        Constitution: 13,
        Intelligence: 14,
        Wisdom: 10,
        Charisma: 8,
      },
      backgroundIncrease: { plusOne: ['Constitution', 'Intelligence', 'Wisdom'] },
    },
    skillProficiencies: ['Arcana', 'History'],
    equipmentChoice: 'A',
  }

  it('applies the plusOne-array background increase shape', () => {
    const scores = finalAbilityScores(data)
    expect(scores.Intelligence).toBe(15)
    expect(scores.Constitution).toBe(14)
    expect(scores.Wisdom).toBe(11)
    expect(abilityModifier(scores.Intelligence)).toBe(2)
    expect(abilityModifier(scores.Constitution)).toBe(2)
  })

  it('computes 8 HP (D6 + 2 Con)', () => {
    expect(hitPoints('wizard', 2)).toBe(8)
  })

  it('matches the real wizard spellSlotTable level-1 row', () => {
    const wizardClass = getClass('wizard')
    const realRow = wizardClass?.spellSlotTable?.find((r) => r.level === 1)
    expect(realRow).toBeDefined()

    const result = spellSlots('wizard')
    expect(result).toBeDefined()
    expect(result?.cantrips).toBe(realRow?.cantrips)
    expect(result?.slotsByLevel[1]).toBe(realRow?.slotsByLevel[1])
    // Confirmed live values from the real data pack.
    expect(result?.cantrips).toBe(3)
    expect(result?.slotsByLevel[1]).toBe(2)
  })
})

describe('Fighter (Dwarf, Soldier background)', () => {
  it('Soldier grants Strength/Dexterity/Constitution', () => {
    const soldier = getBackground('soldier')
    expect(soldier?.abilityScores).toEqual(['Strength', 'Dexterity', 'Constitution'])
  })

  const data: CharacterData = {
    speciesId: 'dwarf',
    backgroundId: 'soldier',
    classes: [{ classId: 'fighter', level: 1 }],
    abilityScores: {
      rolls: [16, 13, 12, 10, 10, 8],
      assignment: {
        Strength: 16,
        Dexterity: 12,
        Constitution: 13,
        Intelligence: 10,
        Wisdom: 10,
        Charisma: 8,
      },
      backgroundIncrease: { plusTwo: 'Strength', plusOne: ['Constitution'] },
    },
    skillProficiencies: ['Athletics', 'Intimidation'],
    equipmentChoice: 'A',
  }

  it('applies the plusTwo/plusOne background increase shape', () => {
    const scores = finalAbilityScores(data)
    expect(scores.Strength).toBe(18)
    expect(scores.Constitution).toBe(14)
    expect(abilityModifier(scores.Strength)).toBe(4)
  })

  it('computes 12 HP (D10 + 2 Con)', () => {
    expect(hitPoints('fighter', 2)).toBe(12)
  })

  it('proficiency bonus at level 1 is +2', () => {
    expect(proficiencyBonus('fighter')).toBe(2)
  })

  it('option A (Chain Mail) gives flat AC 16 regardless of Dex', () => {
    expect(armorClass('fighter', 'A', 5)).toBe(16)
    expect(armorClass('fighter', 'A', -1)).toBe(16)
  })

  it('option B (Studded Leather Armor) gives 12 + Dex modifier', () => {
    const dexMod = abilityModifier(12)
    expect(armorClass('fighter', 'B', dexMod)).toBe(12 + dexMod)
  })

  it('Athletics is proficient via Soldier background: 4 (Str mod) + 2 (prof) = 6', () => {
    const scores = { Strength: 18, Dexterity: 12, Constitution: 14, Intelligence: 10, Wisdom: 10, Charisma: 8 }
    expect(skillBonus('Athletics', scores, ['Athletics', 'Intimidation'], 2)).toBe(6)
  })
})
