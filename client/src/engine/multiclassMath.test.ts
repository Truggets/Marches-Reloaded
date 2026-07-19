import { describe, expect, it } from 'vitest'
import { getClass } from '@data'
import {
  canMulticlassInto,
  combinedCasterLevel,
  combinedSpellSlots,
  hitPointsMulticlass,
  isAsiLevel,
  proficiencyBonus,
  proficiencyBonusMulticlass,
  totalCharacterLevel,
  warlockPactMagic,
} from './computeSheet'
import type { Ability, CharacterClassEntry } from '../character-wizard/types'

const baseScores: Record<Ability, number> = {
  Strength: 10,
  Dexterity: 10,
  Constitution: 10,
  Intelligence: 10,
  Wisdom: 10,
  Charisma: 10,
}

describe('proficiencyBonusMulticlass', () => {
  it('is keyed off total level across classes, not any single class level', () => {
    const classes: CharacterClassEntry[] = [
      { classId: 'barbarian', level: 3 },
      { classId: 'fighter', level: 2 },
    ]
    expect(totalCharacterLevel(classes)).toBe(5)
    expect(proficiencyBonusMulticlass(classes)).toBe(proficiencyBonus('barbarian', 5))
  })

  it('the +N progression at a given total level is identical across different classes', () => {
    // Assumption the multiclass lookup relies on: verify directly rather than
    // just assume it, per the plan's own caution.
    expect(proficiencyBonus('barbarian', 5)).toBe(proficiencyBonus('rogue', 5))
    expect(proficiencyBonus('wizard', 9)).toBe(proficiencyBonus('fighter', 9))
  })
})

describe('hitPointsMulticlass', () => {
  it('grants max-hit-die only for level 1 of the FIRST class, not each class\'s own level 1', () => {
    // Fighter (first class, d10) 1 / Wizard (added via multiclass, d6) 1.
    // Fighter level 1: max(1, 10 + 2) = 12 (die max).
    // Wizard level 1 (NOT the character's first level): fixed = floor(6/2)+1 = 4 -> max(1, 4+2) = 6.
    // Total = 18, not 20 (which would be the bug: max die counted twice).
    const classes: CharacterClassEntry[] = [
      { classId: 'fighter', level: 1 },
      { classId: 'wizard', level: 1 },
    ]
    expect(hitPointsMulticlass(classes, 2, 'human')).toBe(18)
  })

  it('sums fixed per-level HP correctly across both classes at higher levels', () => {
    // Fighter (first, d10) 3 / Wizard (d6) 2, Con mod +1, Human (no species HP trait).
    // Fighter: level1 max(1,10+1)=11; levels2-3 fixed=floor(10/2)+1=6 -> (6+1)*2=14. Fighter subtotal=25.
    // Wizard (both levels are "not first"): fixed=floor(6/2)+1=4 -> (4+1)*2=10.
    // Total = 25 + 10 = 35.
    const classes: CharacterClassEntry[] = [
      { classId: 'fighter', level: 3 },
      { classId: 'wizard', level: 2 },
    ]
    expect(hitPointsMulticlass(classes, 1, 'human')).toBe(35)
  })
})

describe('combinedCasterLevel / combinedSpellSlots', () => {
  it('sums full-caster levels directly (Bard + Cleric)', () => {
    const classes: CharacterClassEntry[] = [
      { classId: 'bard', level: 3 },
      { classId: 'cleric', level: 2 },
    ]
    expect(combinedCasterLevel(classes)).toBe(5)
    const wizardLevel5 = getClass('wizard')?.spellSlotTable?.find((r) => r.level === 5)
    expect(combinedSpellSlots(classes)).toEqual(wizardLevel5?.slotsByLevel)
  })

  it('halves Paladin/Ranger levels and rounds UP (per SRD 2024 text, not the 2014 round-down rule)', () => {
    // Ranger 3 alone: half of 3 rounded up = 2 (round-down would wrongly give 1).
    expect(combinedCasterLevel([{ classId: 'ranger', level: 3 }])).toBe(2)
    // Ranger 1 alone: round-up gives 1 (round-down would wrongly give 0 = no caster level at all).
    expect(combinedCasterLevel([{ classId: 'ranger', level: 1 }])).toBe(1)
  })

  it('matches the SRD worked example: level 4 Ranger / level 3 Sorcerer = combined level 5', () => {
    const classes: CharacterClassEntry[] = [
      { classId: 'ranger', level: 4 },
      { classId: 'sorcerer', level: 3 },
    ]
    expect(combinedCasterLevel(classes)).toBe(5)
    expect(combinedSpellSlots(classes)?.[1]).toBe(4)
    expect(combinedSpellSlots(classes)?.[2]).toBe(3)
    expect(combinedSpellSlots(classes)?.[3]).toBe(2)
  })

  it('full-caster spell slot tables have identical shape/values across classes at the same level', () => {
    const bard5 = getClass('bard')?.spellSlotTable?.find((r) => r.level === 5)
    const cleric5 = getClass('cleric')?.spellSlotTable?.find((r) => r.level === 5)
    const wizard5 = getClass('wizard')?.spellSlotTable?.find((r) => r.level === 5)
    expect(bard5?.slotsByLevel).toEqual(cleric5?.slotsByLevel)
    expect(cleric5?.slotsByLevel).toEqual(wizard5?.slotsByLevel)
  })

  it('returns undefined when no full/half caster levels are present', () => {
    expect(combinedSpellSlots([{ classId: 'fighter', level: 5 }])).toBeUndefined()
  })
})

describe('warlockPactMagic', () => {
  it('is a wholly separate pool from the combined full/half-caster table', () => {
    const classes: CharacterClassEntry[] = [
      { classId: 'wizard', level: 2 },
      { classId: 'warlock', level: 3 },
    ]
    // Warlock levels never fold into the combined caster level.
    expect(combinedCasterLevel(classes)).toBe(2)
    const pact = warlockPactMagic(classes)
    expect(pact?.cantrips).toBe(2)
    expect(pact?.slotsByLevel[2]).toBe(2) // level-3 Warlock: 2 slots at slot-level 2
  })

  it('is undefined without any Warlock levels', () => {
    expect(warlockPactMagic([{ classId: 'wizard', level: 5 }])).toBeUndefined()
  })
})

describe('ASI timing is per-class level, not total character level', () => {
  it('Fighter 2 / Wizard 2 (total level 4) has zero ASIs, even though a single-classed Fighter 4 would', () => {
    expect(isAsiLevel('fighter', 4)).toBe(true) // sanity: single-class Fighter 4 IS an ASI level
    expect(isAsiLevel('fighter', 2)).toBe(false)
    expect(isAsiLevel('wizard', 2)).toBe(false)
  })
})

describe('canMulticlassInto', () => {
  it('an "or" primary ability (Fighter: Strength or Dexterity) is satisfied by either', () => {
    expect(canMulticlassInto([], { ...baseScores, Dexterity: 13 }, 'fighter')).toBe(true)
    expect(canMulticlassInto([], { ...baseScores, Strength: 13 }, 'fighter')).toBe(true)
    expect(canMulticlassInto([], baseScores, 'fighter')).toBe(false)
  })

  it('an "and" primary ability (Monk: Dexterity and Wisdom) requires both', () => {
    expect(canMulticlassInto([], { ...baseScores, Dexterity: 13, Wisdom: 13 }, 'monk')).toBe(true)
    expect(canMulticlassInto([], { ...baseScores, Dexterity: 13 }, 'monk')).toBe(false)
  })

  it('also requires 13 in every CURRENT class\'s primary ability, not just the target\'s', () => {
    // Already a Cleric (Wisdom) with Wisdom 18; wants to add Barbarian (Strength).
    const classes: CharacterClassEntry[] = [{ classId: 'cleric', level: 5 }]
    const scores = { ...baseScores, Wisdom: 18 }
    expect(canMulticlassInto(classes, scores, 'barbarian')).toBe(false) // Strength still 10
    expect(canMulticlassInto(classes, { ...scores, Strength: 13 }, 'barbarian')).toBe(true)
  })

  it('adding a level in a class already held does not re-check the prerequisite', () => {
    const classes: CharacterClassEntry[] = [{ classId: 'wizard', level: 3 }]
    expect(canMulticlassInto(classes, baseScores, 'wizard')).toBe(true)
  })
})
