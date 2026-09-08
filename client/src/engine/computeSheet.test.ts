import { describe, expect, it } from 'vitest'
import { getBackground, getClass } from '@data'
import {
  abilityModifier,
  armorClass,
  featuresForLevel,
  finalAbilityScores,
  hitPoints,
  isAsiLevel,
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

  it('computes 8 HP (D6 + 2 Con) at level 1 (Human, no species HP trait)', () => {
    expect(hitPoints('wizard', 1, 2, 'human')).toBe(8)
  })

  it('matches the real wizard spellSlotTable level-1 row', () => {
    const wizardClass = getClass('wizard')
    const realRow = wizardClass?.spellSlotTable?.find((r) => r.level === 1)
    expect(realRow).toBeDefined()

    const result = spellSlots('wizard', 1)
    expect(result).toBeDefined()
    expect(result?.cantrips).toBe(realRow?.cantrips)
    expect(result?.slotsByLevel[1]).toBe(realRow?.slotsByLevel[1])
    // Confirmed live values from the real data pack.
    expect(result?.cantrips).toBe(3)
    expect(result?.slotsByLevel[1]).toBe(2)
  })

  it('Wizard level 5 proficiency bonus is +3', () => {
    expect(proficiencyBonus('wizard', 5)).toBe(3)
  })

  it('Wizard level 5 has 2 slots at spell-level 3', () => {
    const result = spellSlots('wizard', 5)
    expect(result?.slotsByLevel[3]).toBe(2)
  })
})

describe('Paladin (half-caster) spell slots', () => {
  it('Paladin level 5 has 2 slots at spell-level 2', () => {
    const result = spellSlots('paladin', 5)
    expect(result?.slotsByLevel[2]).toBe(2)
  })
})

describe('preparedOrKnown tracks the real per-level column, not total slot count', () => {
  // Regression test for a bug caught in manual QA: the level-up stepper was
  // deriving "how many spells to prepare" from the change in total spell
  // SLOTS between levels, not the class's actual preparedOrKnown delta.
  // Slot-total growth and prepared/known growth are different numbers.
  it('Bard/Druid: total slot delta L2->L3 differs from the real preparedOrKnown delta', () => {
    const l2 = spellSlots('druid', 2)
    const l3 = spellSlots('druid', 3)
    const l2SlotTotal = Object.values(l2!.slotsByLevel).reduce((a, b) => a + b, 0)
    const l3SlotTotal = Object.values(l3!.slotsByLevel).reduce((a, b) => a + b, 0)
    // The bug: this delta (what the old code used) is +3, not the real +1.
    expect(l3SlotTotal - l2SlotTotal).toBe(3)
    // The fix: preparedOrKnown itself only grows by 1 from L2 to L3.
    expect(l3!.preparedOrKnown - l2!.preparedOrKnown).toBe(1)
  })

  it('Warlock preparedOrKnown comes from the "Prepared Spells" feature-table column', () => {
    const result = spellSlots('warlock', 1)
    expect(result?.preparedOrKnown).toBe(2)
  })
})

describe('featuresForLevel / isAsiLevel', () => {
  it('Fighter is an ASI level at 4 but not at 5', () => {
    expect(isAsiLevel('fighter', 4)).toBe(true)
    expect(isAsiLevel('fighter', 5)).toBe(false)
  })

  it('featuresForLevel returns the real featureTable feature list for that level', () => {
    expect(featuresForLevel('fighter', 4)).toEqual(['Ability Score Improvement'])
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

  it('computes 13 HP at level 1 (D10 + 2 Con + 1 Dwarven Toughness)', () => {
    expect(hitPoints('fighter', 1, 2, 'dwarf')).toBe(13)
  })

  it('proficiency bonus at level 1 is +2', () => {
    expect(proficiencyBonus('fighter', 1)).toBe(2)
  })

  it('Dwarf Fighter leveled 1->5 with +2 Con: hand-computed total HP including Dwarven Toughness', () => {
    // Fighter hitPointDie D10 -> fixedPerLevel = floor(10/2)+1 = 6.
    // Level 1: 10 (die max) + 2 (Con) + 1 (Dwarven Toughness) = 13.
    // Levels 2-5 (4 levels): each (6 + 2 Con + 1 Dwarven Toughness) = 9 -> 4 * 9 = 36.
    // Total: 13 + 36 = 49.
    const expected = 13 + 4 * 9
    expect(expected).toBe(49)
    expect(hitPoints('fighter', 5, 2, 'dwarf')).toBe(49)
  })

  it('option A (Chain Mail) gives flat AC 16 regardless of Dex', () => {
    const fighter = [{ classId: 'fighter', level: 1 }]
    const scoresDex20 = { Strength: 10, Dexterity: 20, Constitution: 10, Intelligence: 10, Wisdom: 10, Charisma: 10 }
    const scoresDex8 = { ...scoresDex20, Dexterity: 8 }
    expect(armorClass(fighter, 'A', scoresDex20)).toBe(16)
    expect(armorClass(fighter, 'A', scoresDex8)).toBe(16)
  })

  it('option B (Studded Leather Armor) gives 12 + Dex modifier', () => {
    const fighter = [{ classId: 'fighter', level: 1 }]
    const scores = { Strength: 10, Dexterity: 12, Constitution: 10, Intelligence: 10, Wisdom: 10, Charisma: 10 }
    const dexMod = abilityModifier(12)
    expect(armorClass(fighter, 'B', scores)).toBe(12 + dexMod)
  })

  it('Monk Unarmored Defense: 10 + Dex + Wis (issue #12 — ties to live Test boi repro: Dex 16/+3, Wis 15/+2 -> 15)', () => {
    const monk = [{ classId: 'monk', level: 1 }]
    const scores = { Strength: 16, Dexterity: 16, Constitution: 11, Intelligence: 13, Wisdom: 15, Charisma: 8 }
    expect(armorClass(monk, 'A', scores)).toBe(15)
  })

  it('Barbarian Unarmored Defense: 10 + Dex + Con', () => {
    const barbarian = [{ classId: 'barbarian', level: 1 }]
    const scores = { Strength: 16, Dexterity: 14, Constitution: 16, Intelligence: 10, Wisdom: 10, Charisma: 8 }
    const expected = 10 + abilityModifier(14) + abilityModifier(16)
    expect(armorClass(barbarian, 'A', scores)).toBe(expected)
  })

  it('non-Unarmored-Defense class (Wizard) unarmored still falls back to flat 10 + Dex (regression guard)', () => {
    const wizard = [{ classId: 'wizard', level: 1 }]
    const scores = { Strength: 8, Dexterity: 14, Constitution: 12, Intelligence: 16, Wisdom: 10, Charisma: 10 }
    expect(armorClass(wizard, 'A', scores)).toBe(10 + abilityModifier(14))
  })

  it('Athletics is proficient via Soldier background: 4 (Str mod) + 2 (prof) = 6', () => {
    const scores = { Strength: 18, Dexterity: 12, Constitution: 14, Intelligence: 10, Wisdom: 10, Charisma: 8 }
    expect(skillBonus('Athletics', scores, ['Athletics', 'Intimidation'], 2)).toBe(6)
  })

  it('finalAbilityScores folds in levelUps[].featChoice.abilityIncreases on top of background increases', () => {
    // Strength is 18 after the plusTwo background increase (16 -> 18, see above).
    // An ASI entry at level 4 encodes +2-to-one-ability as the ability
    // appearing twice (each array entry is +1) -> 18 -> 20.
    const leveledData: CharacterData = {
      ...data,
      classes: [{ classId: 'fighter', level: 4 }],
      levelUps: [
        {
          level: 4,
          hitPointGain: 8,
          featChoice: {
            featId: 'ability-score-improvement',
            abilityIncreases: ['Strength', 'Strength'],
          },
        },
      ],
    }
    const scores = finalAbilityScores(leveledData)
    expect(scores.Strength).toBe(20)
  })

  it('finalAbilityScores caps at 20 even when a levelUps increase would push past it', () => {
    // Strength is already 18 from the background increase; a further +2 ASI
    // would be 20 (exactly the cap), a second +2 ASI must still cap at 20,
    // not overflow to 22.
    const leveledData: CharacterData = {
      ...data,
      classes: [{ classId: 'fighter', level: 8 }],
      levelUps: [
        {
          level: 4,
          hitPointGain: 8,
          featChoice: { featId: 'ability-score-improvement', abilityIncreases: ['Strength', 'Strength'] },
        },
        {
          level: 6,
          hitPointGain: 8,
          featChoice: { featId: 'ability-score-improvement', abilityIncreases: ['Strength', 'Strength'] },
        },
      ],
    }
    const scores = finalAbilityScores(leveledData)
    expect(scores.Strength).toBe(20)
  })
})
