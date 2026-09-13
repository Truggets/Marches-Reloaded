import { describe, expect, it } from 'vitest'
import { getBackground, getClass, getFeat, listClasses } from '@data'
import {
  abilityModifier,
  armorClass,
  diffQuickStats,
  featuresForLevel,
  fightingStyleAlternateCantripClass,
  fightingStyleUnlockLevel,
  finalAbilityScores,
  hitPoints,
  isAsiLevel,
  parseFeatAbilityIncrease,
  parseFeatSpellAbilities,
  parseFeatSpellLists,
  proficiencyBonus,
  quickStats,
  skillBonus,
  spellcastingInfo,
  spellSlots,
  subclassUnlockLevel,
  unarmoredDefenseVoidedByShield,
  weaponMasteryCount,
  weaponMasteryPool,
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

describe('M12: subclass selection', () => {
  it('subclassUnlockLevel is 3 for every bundled SRD class (2024 rules unified subclass choice to level 3)', () => {
    for (const c of listClasses()) {
      expect(subclassUnlockLevel(c.id)).toBe(3)
    }
  })

  it('subclassUnlockLevel throws for an unknown class id (same "data gap fails loud" contract as the rest of the engine)', () => {
    expect(() => subclassUnlockLevel('not-a-real-class')).toThrow()
  })

  it('featuresForLevel with no subclassId is unaffected (existing behavior preserved)', () => {
    expect(featuresForLevel('fighter', 3)).not.toContain('Improved Critical')
  })

  it('featuresForLevel puts class features before subclass features (sheet displays them in this order)', () => {
    const result = featuresForLevel('fighter', 3, 'fighter-champion')
    const classFeatureIdx = result.indexOf('Fighter Subclass')
    const subclassFeatureIdx = result.indexOf('Improved Critical')
    expect(classFeatureIdx).toBeGreaterThanOrEqual(0)
    expect(subclassFeatureIdx).toBeGreaterThan(classFeatureIdx)
  })

  it('featuresForLevel with a subclassId merges in that subclass\'s features at this level, and nothing below the unlock level', () => {
    const champion = getClass('fighter')?.subclasses.find((s) => s.id === 'fighter-champion')
    expect(champion).toBeDefined()
    expect(featuresForLevel('fighter', 3, 'fighter-champion')).toEqual(
      expect.arrayContaining(['Improved Critical', 'Remarkable Athlete']),
    )
    expect(featuresForLevel('fighter', 2, 'fighter-champion')).not.toEqual(
      expect.arrayContaining(['Improved Critical', 'Remarkable Athlete']),
    )
  })

  it('featuresForLevel throws for an unknown subclassId', () => {
    expect(() => featuresForLevel('fighter', 3, 'not-a-real-subclass')).toThrow()
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

  it('unarmoredDefenseVoidedByShield: positive-tests the two known SRD phrasings (not a loose substring match on "Shield")', () => {
    const monkText = getClass('monk')?.features.find((f) => f.name === 'Unarmored Defense')?.description ?? ''
    const barbarianText = getClass('barbarian')?.features.find((f) => f.name === 'Unarmored Defense')?.description ?? ''
    expect(unarmoredDefenseVoidedByShield(monkText)).toBe(true)
    expect(unarmoredDefenseVoidedByShield(barbarianText)).toBe(false)
    expect(() => unarmoredDefenseVoidedByShield('some reworded pack text mentioning a Shield')).toThrow()
  })

  it('spellcastingInfo: Wizard L1 uses Intelligence (spellAttack = prof+mod, saveDC = 8+prof+mod)', () => {
    const wizard = [{ classId: 'wizard', level: 1 }]
    const scores = { Strength: 8, Dexterity: 14, Constitution: 12, Intelligence: 16, Wisdom: 10, Charisma: 10 }
    const info = spellcastingInfo('wizard', wizard, scores)
    expect(info).toEqual({ ability: 'Intelligence', attackBonus: 2 + 3, saveDC: 8 + 2 + 3 })
  })

  it('spellcastingInfo: Cleric L1 uses Wisdom', () => {
    const cleric = [{ classId: 'cleric', level: 1 }]
    const scores = { Strength: 10, Dexterity: 10, Constitution: 12, Intelligence: 8, Wisdom: 16, Charisma: 10 }
    const info = spellcastingInfo('cleric', cleric, scores)
    expect(info?.ability).toBe('Wisdom')
    expect(info?.attackBonus).toBe(2 + 3)
  })

  it('spellcastingInfo: Warlock L1 uses Charisma (its feature text says "the spellcasting ability", not "your")', () => {
    const warlock = [{ classId: 'warlock', level: 1 }]
    const scores = { Strength: 10, Dexterity: 10, Constitution: 12, Intelligence: 8, Wisdom: 10, Charisma: 16 }
    const info = spellcastingInfo('warlock', warlock, scores)
    expect(info?.ability).toBe('Charisma')
  })

  it('spellcastingInfo: non-caster class returns undefined', () => {
    const fighter = [{ classId: 'fighter', level: 1 }]
    const scores = { Strength: 16, Dexterity: 14, Constitution: 14, Intelligence: 10, Wisdom: 10, Charisma: 10 }
    expect(spellcastingInfo('fighter', fighter, scores)).toBeUndefined()
  })

  it('parseFeatSpellLists: Magic Initiate parses Cleric/Druid/Wizard from its own benefit text', () => {
    const feat = getFeat('magic-initiate')!
    expect(parseFeatSpellLists(feat)).toEqual(['Cleric', 'Druid', 'Wizard'])
  })

  it('parseFeatSpellLists: a non-spell Origin feat returns []', () => {
    const feat = getFeat('alert')!
    expect(parseFeatSpellLists(feat)).toEqual([])
  })

  it('parseFeatSpellAbilities: Magic Initiate parses Intelligence/Wisdom/Charisma', () => {
    const feat = getFeat('magic-initiate')!
    expect(parseFeatSpellAbilities(feat)).toEqual(['Intelligence', 'Wisdom', 'Charisma'])
  })

  it('parseFeatSpellAbilities: a non-spell Origin feat returns []', () => {
    const feat = getFeat('alert')!
    expect(parseFeatSpellAbilities(feat)).toEqual([])
  })

  it('parseFeatSpellLists: PHB-2024 "Choose one spellcasting class" phrasing also parses (6 classes)', () => {
    const feat = {
      id: 'phb-2024:magic-initiate',
      benefit:
        "Choose one spellcasting class: Bard, Cleric, Druid, Sorcerer, Warlock, or Wizard. You learn two Cantrips of your choice and one 1st-level spell of your choice from that class's spell list.",
    }
    expect(parseFeatSpellLists(feat)).toEqual(['Bard', 'Cleric', 'Druid', 'Sorcerer', 'Warlock', 'Wizard'])
  })

  it('parseFeatSpellAbilities: PHB-2024 phrasing has no free-choice ability sentence, returns [] (derived-from-class mode)', () => {
    const feat = {
      id: 'phb-2024:magic-initiate',
      benefit: 'The spellcasting ability modifier for these spells is the one associated with the chosen class.',
    }
    expect(parseFeatSpellAbilities(feat)).toEqual([])
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

describe('parseFeatAbilityIncrease (#24: imported General feats silently dropped their own ability increase)', () => {
  it('recognizes the bundled SRD Ability Score Improvement free-choice shape', () => {
    const feat = getFeat('ability-score-improvement')
    expect(feat).toBeDefined()
    expect(parseFeatAbilityIncrease(feat!)).toEqual({ mode: 'free-choice' })
  })

  it('recognizes the PHB-2024 Ability Score Improvement free-choice shape (different prose, same mechanic)', () => {
    const phbAsi = {
      id: 'phb-2024:ability-score-improvement',
      benefit:
        '**Stat Boost:** You can **increase one ability score of your choice by 2, or increase two different scores by 1** (to a maximum of 20).',
    }
    expect(parseFeatAbilityIncrease(phbAsi)).toEqual({ mode: 'free-choice' })
  })

  it('recognizes the bundled SRD Grappler fixed-list shape', () => {
    const feat = getFeat('grappler')
    expect(feat).toBeDefined()
    expect(parseFeatAbilityIncrease(feat!)).toEqual({ mode: 'fixed-list', abilities: ['Strength', 'Dexterity'] })
  })

  it('recognizes a PHB-2024 half-feat with a 2-ability fixed list (Chef)', () => {
    const chef = {
      id: 'phb-2024:chef',
      benefit:
        "**Stat Boost:** Increase your **Constitution or Wisdom score by 1** (maximum of 20). **Tool Proficiency:** You gain proficiency with Cook's Utensils.",
    }
    expect(parseFeatAbilityIncrease(chef)).toEqual({ mode: 'fixed-list', abilities: ['Constitution', 'Wisdom'] })
  })

  it('recognizes a PHB-2024 half-feat with a 4-ability fixed list (Elven Accuracy)', () => {
    const elvenAccuracy = {
      id: 'phb-2024:elven-accuracy',
      benefit:
        '**Stat Boost:** Increase your **Dexterity, Intelligence, Wisdom, or Charisma score by 1** (maximum of 20). **Super Advantage:** Whenever you have Advantage on an attack roll using Dexterity, Intelligence, Wisdom, or Charisma, you can reroll one of the dice once.',
    }
    expect(parseFeatAbilityIncrease(elvenAccuracy)).toEqual({
      mode: 'fixed-list',
      abilities: ['Dexterity', 'Intelligence', 'Wisdom', 'Charisma'],
    })
  })

  it('recognizes a PHB-2024 half-feat with a single fixed ability (Great Weapon Master)', () => {
    const gwm = {
      id: 'phb-2024:great-weapon-master',
      benefit:
        '**Stat Boost:** Increase your **Strength score by 1** (maximum of 20). **Cleave Bonus Attack:** On your turn, when you score a Critical Hit with a melee weapon...',
    }
    expect(parseFeatAbilityIncrease(gwm)).toEqual({ mode: 'fixed-list', abilities: ['Strength'] })
  })

  it('returns undefined for a feat with no ability-increase clause at all (Strike of the Giants)', () => {
    const strikeOfTheGiants = {
      id: 'phb-2024:strike-of-the-giants',
      benefit:
        '**Elemental Strike:** Choose one giant type: Fire, Frost, Hill, Stone, Storm, or Cloud. Once per turn when you hit with a weapon attack, you can deal extra damage.',
    }
    expect(parseFeatAbilityIncrease(strikeOfTheGiants)).toBeUndefined()
  })

  it('returns undefined for a non-ability-granting feat (Skilled)', () => {
    const feat = getFeat('skilled')
    expect(feat).toBeDefined()
    expect(parseFeatAbilityIncrease(feat!)).toBeUndefined()
  })

  it('throws for a matched-but-malformed ability list (not real ability names)', () => {
    const malformed = {
      id: 'phb-2024:malformed',
      benefit: '**Stat Boost:** Increase your **Speed and Luck score by 1** (maximum of 20).',
    }
    expect(() => parseFeatAbilityIncrease(malformed)).toThrow()
  })

  it('does not match "by 10" as "by 1" (word-boundary check)', () => {
    const byTen = {
      id: 'phb-2024:by-ten',
      benefit: '**Stat Boost:** Increase your **Strength score by 10** (maximum of 20).',
    }
    expect(parseFeatAbilityIncrease(byTen)).toBeUndefined()
  })

  it('matches the first Stat Boost sentence even when a later, unrelated sentence also contains "by 1" (real Keenness of the Stone Giant shape)', () => {
    const keenness = {
      id: 'phb-2024:keenness-of-the-stone-giant',
      benefit:
        '**Stat Boost:** Increase your **Strength, Constitution, or Wisdom score by 1** (maximum of 20). **Darkvision Expansion:** You gain Darkvision out to 60 feet, or increase your existing Darkvision by 30 feet.',
    }
    expect(parseFeatAbilityIncrease(keenness)).toEqual({
      mode: 'fixed-list',
      abilities: ['Strength', 'Constitution', 'Wisdom'],
    })
  })
})

describe('quickStats / diffQuickStats (#19)', () => {
  const FLAT: CharacterData['abilityScores'] = {
    rolls: [10, 10, 10, 10, 10, 10],
    assignment: { Strength: 10, Dexterity: 10, Constitution: 10, Intelligence: 10, Wisdom: 10, Charisma: 10 },
    backgroundIncrease: {},
  }

  const fighterDex14: CharacterData['abilityScores'] = {
    rolls: [10, 10, 10, 10, 10, 10],
    assignment: { Strength: 15, Dexterity: 14, Constitution: 13, Intelligence: 10, Wisdom: 10, Charisma: 8 },
    backgroundIncrease: {},
  }

  it('reports AC and HP for a fighter, unarmored', () => {
    const data: CharacterData = {
      speciesId: 'human',
      backgroundId: 'soldier',
      classes: [{ classId: 'fighter', level: 1 }],
      abilityScores: fighterDex14,
      skillProficiencies: [],
      equipmentChoice: '',
    }
    const stats = quickStats(data)
    expect(stats.ac).toBe(12) // 10 + Dex mod (+2), no armor
    expect(stats.hp).toBe(11) // d10 (10) + Con mod (+1)
    expect(stats.saveDc).toBeUndefined() // Fighter isn't a caster
  })

  it('reports AC 16 for the same fighter in Chain Mail (option A), matching the issue\'s own "AC 10 → 16" example', () => {
    const unarmored: CharacterData = {
      speciesId: 'human',
      backgroundId: 'soldier',
      classes: [{ classId: 'fighter', level: 1 }],
      abilityScores: fighterDex14,
      skillProficiencies: [],
      equipmentChoice: '',
    }
    const armored: CharacterData = { ...unarmored, equipmentChoice: 'A' }
    expect(quickStats(armored).ac).toBe(16) // Chain Mail: flat AC 16, no Dex
    expect(diffQuickStats(quickStats(unarmored), quickStats(armored))).toEqual(['AC 12 → 16'])
  })

  it('reports a save DC for a caster class', () => {
    const data: CharacterData = {
      speciesId: 'human',
      backgroundId: 'sage',
      classes: [{ classId: 'wizard', level: 1 }],
      abilityScores: { ...fighterDex14, assignment: { ...fighterDex14.assignment, Intelligence: 16 } },
      skillProficiencies: [],
      equipmentChoice: '',
    }
    // Wizard: prof bonus +2 at level 1, Int mod +3 -> DC 8+2+3
    expect(quickStats(data).saveDc).toBe(13)
  })

  it('reports skill bonuses only for proficient skills, and omits an unrecognized skill name rather than throwing', () => {
    const data: CharacterData = {
      speciesId: 'human',
      backgroundId: 'soldier',
      classes: [{ classId: 'fighter', level: 1 }],
      abilityScores: fighterDex14,
      skillProficiencies: ['Athletics', 'Not A Real Skill'],
      equipmentChoice: '',
    }
    expect(quickStats(data).skillBonuses).toEqual({ Athletics: 4 }) // Str mod +2, prof bonus +2
  })

  it('diffQuickStats returns no lines when nothing differs (flat baseline vs itself)', () => {
    const data: CharacterData = {
      speciesId: 'human',
      backgroundId: 'soldier',
      classes: [{ classId: 'fighter', level: 1 }],
      abilityScores: FLAT,
      skillProficiencies: [],
      equipmentChoice: '',
    }
    expect(diffQuickStats(quickStats(data), quickStats(data))).toEqual([])
  })

  it('diffQuickStats formats a skill-bonus delta with an explicit sign, for a skill only proficient in "after"', () => {
    const before = quickStats(
      {
        speciesId: 'human',
        backgroundId: 'soldier',
        classes: [{ classId: 'fighter', level: 1 }],
        abilityScores: FLAT,
        skillProficiencies: [],
        equipmentChoice: '',
      },
      ['Athletics'],
    )
    const after = quickStats(
      {
        speciesId: 'human',
        backgroundId: 'soldier',
        classes: [{ classId: 'fighter', level: 1 }],
        abilityScores: FLAT,
        skillProficiencies: ['Athletics'],
        equipmentChoice: '',
      },
      ['Athletics'],
    )
    expect(diffQuickStats(before, after)).toEqual(['Athletics +0 → +2'])
  })

  it('quickStats never throws on an unknown classId, and simply omits every stat', () => {
    const data: CharacterData = {
      speciesId: 'human',
      backgroundId: 'soldier',
      classes: [{ classId: 'not-a-real-class', level: 1 }],
      abilityScores: FLAT,
      skillProficiencies: ['Athletics'],
      equipmentChoice: '',
    }
    expect(() => quickStats(data)).not.toThrow()
    expect(quickStats(data)).toEqual({})
  })
})

describe('Fighting Style & Weapon Mastery (#3)', () => {
  describe('fightingStyleUnlockLevel', () => {
    it('Fighter unlocks at level 1', () => {
      expect(fightingStyleUnlockLevel('fighter')).toBe(1)
    })

    it('Paladin and Ranger unlock at level 2', () => {
      expect(fightingStyleUnlockLevel('paladin')).toBe(2)
      expect(fightingStyleUnlockLevel('ranger')).toBe(2)
    })

    it('Barbarian and Rogue have no Fighting Style at all', () => {
      expect(fightingStyleUnlockLevel('barbarian')).toBeUndefined()
      expect(fightingStyleUnlockLevel('rogue')).toBeUndefined()
    })

    it('throws for an unknown class id', () => {
      expect(() => fightingStyleUnlockLevel('not-a-real-class')).toThrow()
    })
  })

  describe('fightingStyleAlternateCantripClass', () => {
    it('Paladin\'s Blessed Warrior alternate learns Cleric cantrips', () => {
      expect(fightingStyleAlternateCantripClass('paladin')).toBe('cleric')
    })

    it('Ranger\'s Druidic Warrior alternate learns Druid cantrips', () => {
      expect(fightingStyleAlternateCantripClass('ranger')).toBe('druid')
    })

    it('Fighter has no alternate (a real Fighting Style feat only)', () => {
      expect(fightingStyleAlternateCantripClass('fighter')).toBeUndefined()
    })

    it('a class with no Fighting Style at all has no alternate either', () => {
      expect(fightingStyleAlternateCantripClass('barbarian')).toBeUndefined()
    })
  })

  describe('weaponMasteryCount', () => {
    it('Fighter scales via the featureTable column: 3 at level 1, 4 at level 4, 5 at level 10', () => {
      expect(weaponMasteryCount('fighter', 1)).toBe(3)
      expect(weaponMasteryCount('fighter', 4)).toBe(4)
      expect(weaponMasteryCount('fighter', 10)).toBe(5)
    })

    it('Barbarian scales via the featureTable column: 2 at level 1, 3 at level 4, 4 at level 10', () => {
      expect(weaponMasteryCount('barbarian', 1)).toBe(2)
      expect(weaponMasteryCount('barbarian', 4)).toBe(3)
      expect(weaponMasteryCount('barbarian', 10)).toBe(4)
    })

    it('Paladin/Ranger/Rogue are a flat 2 parsed from prose, not a table column, at every level', () => {
      expect(weaponMasteryCount('paladin', 1)).toBe(2)
      expect(weaponMasteryCount('paladin', 10)).toBe(2)
      expect(weaponMasteryCount('ranger', 1)).toBe(2)
      expect(weaponMasteryCount('rogue', 1)).toBe(2)
    })

    it('a class with no Weapon Mastery feature at all returns undefined', () => {
      expect(weaponMasteryCount('wizard', 1)).toBeUndefined()
    })

    it('throws for an unknown class id', () => {
      expect(() => weaponMasteryCount('not-a-real-class', 1)).toThrow()
    })
  })

  describe('weaponMasteryPool', () => {
    it('Fighter (Simple and Martial weapons, no Melee restriction) gets every weapon, melee and ranged', () => {
      const pool = weaponMasteryPool('fighter').map((w) => w.id)
      expect(pool).toContain('longsword') // martial melee
      expect(pool).toContain('longbow') // martial ranged
      expect(pool).toContain('club') // simple melee
    })

    it('Barbarian (Simple or Martial Melee weapons only) excludes every ranged weapon', () => {
      const pool = weaponMasteryPool('barbarian')
      expect(pool.map((w) => w.id)).toContain('greataxe')
      expect(pool.every((w) => /Melee Weapons/.test(w.description ?? ''))).toBe(true)
    })

    it("Rogue (Simple weapons, plus Martial weapons with Finesse or Light) excludes non-Finesse/Light martial weapons like Longsword", () => {
      const pool = weaponMasteryPool('rogue').map((w) => w.id)
      expect(pool).toContain('shortsword') // martial, Finesse+Light
      expect(pool).toContain('dagger') // simple
      expect(pool).not.toContain('longsword') // martial, neither Finesse nor Light
    })

    it('throws for an unknown class id', () => {
      expect(() => weaponMasteryPool('not-a-real-class')).toThrow()
    })
  })
})
