import { describe, expect, it } from 'vitest'
import {
  attackModeAgainst,
  gwfAdjustedDieAverage,
  monsterAttackMode,
  resolveMonsterAttack,
  resolveSpellAttack,
  resolveWeaponAttack,
  savingThrow,
  toppleSaveDc,
} from './sandbox'
import type { EquipmentEntry, MonsterEntry } from '@data/schema'

describe('resolveSpellAttack', () => {
  it('resolves a forced hit with curated damage for a spell in the lookup', () => {
    const result = resolveSpellAttack('fire-bolt', 5, 12, 15)
    expect(result.hit).toBe(true)
    expect(result.critical).toBe(false)
    expect(result.damage).toBe('1d10 Fire')
  })

  it('resolves a forced hit with damage undefined for a spell not in the lookup', () => {
    const result = resolveSpellAttack('mage-hand', 5, 12, 15)
    expect(result.hit).toBe(true)
    expect(result.damage).toBeUndefined()
  })

  it('resolves a forced miss regardless of the spell', () => {
    const result = resolveSpellAttack('fire-bolt', 5, 20, 2)
    expect(result.hit).toBe(false)
    expect(result.damage).toBeUndefined()
  })

  it('a natural 20 always hits, even against an AC the attack bonus can\'t reach', () => {
    const result = resolveSpellAttack('fire-bolt', -5, 30, 20)
    expect(result.roll).toBe(20)
    expect(result.hit).toBe(true)
    expect(result.critical).toBe(true)
    expect(result.damage).toBe('1d10 Fire')
  })

  it('a natural 1 always misses, even against an AC the attack bonus trivially beats', () => {
    const result = resolveSpellAttack('fire-bolt', 20, 5, 1)
    expect(result.roll).toBe(1)
    expect(result.hit).toBe(false)
    expect(result.critical).toBe(false)
    expect(result.damage).toBeUndefined()
  })
})

function makeMonster(overrides: Partial<MonsterEntry> = {}): MonsterEntry {
  return {
    id: 'test-goblin',
    name: 'Test Goblin',
    size: 'Small',
    creatureType: 'Humanoid',
    alignment: 'Neutral Evil',
    ac: 15,
    hp: 7,
    hitDice: '2d6',
    speed: '30 ft.',
    abilityScores: {
      Strength: 8,
      Dexterity: 14,
      Constitution: 10,
      Intelligence: 10,
      Wisdom: 8,
      Charisma: 8,
    },
    cr: '1/4',
    xp: 50,
    traits: [],
    actions: [
      { name: 'Scimitar', attackBonus: '+4', damage: '1d6 + 2 Slashing', description: 'Melee Attack Roll: +4' },
    ],
    pack: 'srd-5.2',
    source: { book: 'SRD 5.2.1' },
    ...overrides,
  }
}

describe('resolveMonsterAttack', () => {
  it('resolves a forced hit with the first attack action\'s damage', () => {
    const monster = makeMonster()
    const result = resolveMonsterAttack(monster, 12, 15)
    expect(result?.hit).toBe(true)
    expect(result?.actionName).toBe('Scimitar')
    expect(result?.damage).toBe('1d6 + 2 Slashing')
  })

  it('resolves a forced miss', () => {
    const monster = makeMonster()
    const result = resolveMonsterAttack(monster, 20, 2)
    expect(result?.hit).toBe(false)
    expect(result?.damage).toBeUndefined()
  })

  it('a natural 20 always hits', () => {
    const monster = makeMonster({ actions: [{ name: 'Scimitar', attackBonus: '-5', damage: '1d6 + 2 Slashing', description: '' }] })
    const result = resolveMonsterAttack(monster, 30, 20)
    expect(result?.roll).toBe(20)
    expect(result?.hit).toBe(true)
    expect(result?.critical).toBe(true)
  })

  it('a natural 1 always misses', () => {
    const monster = makeMonster({ actions: [{ name: 'Scimitar', attackBonus: '+20', damage: '1d6 + 2 Slashing', description: '' }] })
    const result = resolveMonsterAttack(monster, 5, 1)
    expect(result?.roll).toBe(1)
    expect(result?.hit).toBe(false)
    expect(result?.critical).toBe(false)
  })

  it('skips non-attack actions and uses the first action that has both attackBonus and damage', () => {
    const monster = makeMonster({
      actions: [
        { name: 'Nimble Escape', description: 'The goblin takes the Disengage or Hide action as a Bonus Action.' },
        { name: 'Scimitar', attackBonus: '+4', damage: '1d6 + 2 Slashing', description: 'Melee Attack Roll: +4' },
      ],
    })
    const result = resolveMonsterAttack(monster, 12, 15)
    expect(result?.actionName).toBe('Scimitar')
  })

  it('returns undefined when the monster has no usable attack action', () => {
    const monster = makeMonster({
      actions: [{ name: 'Nimble Escape', description: 'The goblin takes the Disengage or Hide action as a Bonus Action.' }],
    })
    const result = resolveMonsterAttack(monster, 12, 15)
    expect(result).toBeUndefined()
  })
})

function makeWeapon(overrides: Partial<EquipmentEntry> = {}): EquipmentEntry {
  return {
    id: 'test-sword',
    name: 'Test Sword',
    category: 'weapon',
    damage: '1d8 Slashing',
    pack: 'srd-5.2',
    source: { book: 'SRD 5.2.1' },
    ...overrides,
  }
}

describe('resolveWeaponAttack', () => {
  it('resolves a forced hit with the weapon\'s damage string', () => {
    const weapon = makeWeapon()
    const result = resolveWeaponAttack(weapon, 5, 12, 15)
    expect(result.hit).toBe(true)
    expect(result.critical).toBe(false)
    expect(result.damage).toBe('1d8 Slashing')
  })

  it('resolves a forced miss with damage undefined', () => {
    const weapon = makeWeapon()
    const result = resolveWeaponAttack(weapon, 5, 20, 2)
    expect(result.hit).toBe(false)
    expect(result.damage).toBeUndefined()
  })

  it('a natural 20 always hits, even against an AC the attack bonus can\'t reach', () => {
    const weapon = makeWeapon()
    const result = resolveWeaponAttack(weapon, -5, 30, 20)
    expect(result.roll).toBe(20)
    expect(result.hit).toBe(true)
    expect(result.critical).toBe(true)
    expect(result.damage).toBe('1d8 Slashing')
  })

  it('a natural 1 always misses, even against an AC the attack bonus trivially beats', () => {
    const weapon = makeWeapon()
    const result = resolveWeaponAttack(weapon, 20, 5, 1)
    expect(result.roll).toBe(1)
    expect(result.hit).toBe(false)
    expect(result.critical).toBe(false)
    expect(result.damage).toBeUndefined()
  })

  describe('advantage / disadvantage (#28)', () => {
    it('advantage keeps the higher of the two rolls', () => {
      const weapon = makeWeapon()
      // 8+5=13 misses AC 15, 16+5=21 hits -> advantage should hit.
      const result = resolveWeaponAttack(weapon, 5, 15, [8, 16], 'advantage')
      expect(result.roll).toBe(16)
      expect(result.rolls).toEqual([8, 16])
      expect(result.hit).toBe(true)
    })

    it('disadvantage keeps the lower of the two rolls', () => {
      const weapon = makeWeapon()
      const result = resolveWeaponAttack(weapon, 5, 15, [8, 16], 'disadvantage')
      expect(result.roll).toBe(8)
      expect(result.rolls).toEqual([8, 16])
      expect(result.hit).toBe(false)
    })

    it('a natural 20 that is NOT the kept die does not crit', () => {
      const weapon = makeWeapon()
      const result = resolveWeaponAttack(weapon, -5, 30, [1, 20], 'disadvantage')
      // disadvantage keeps the lower: 1, not 20 -> misses, not a crit.
      expect(result.roll).toBe(1)
      expect(result.hit).toBe(false)
    })

    it('a natural 20 that IS the kept die always crits, regardless of AC', () => {
      const weapon = makeWeapon()
      const result = resolveWeaponAttack(weapon, -5, 30, [20, 3], 'advantage')
      expect(result.roll).toBe(20)
      expect(result.hit).toBe(true)
      expect(result.critical).toBe(true)
    })

    it('normal mode (default) never populates rolls', () => {
      const weapon = makeWeapon()
      const result = resolveWeaponAttack(weapon, 5, 15, 12)
      expect(result.rolls).toBeUndefined()
    })
  })
})

describe('attackModeAgainst (#28)', () => {
  const base = { vexed: false, prone: false, targetInMeleeRange: true }

  it('normal with no flags', () => {
    expect(attackModeAgainst(base)).toBe('normal')
  })

  it('vexed -> advantage, regardless of range/prone', () => {
    expect(attackModeAgainst({ ...base, vexed: true })).toBe('advantage')
    expect(attackModeAgainst({ ...base, vexed: true, targetInMeleeRange: false })).toBe('advantage')
  })

  // #28 PR review: Prone's advantage/disadvantage is purely about the
  // attacker's distance, not the weapon type (SRD: "an attack roll against
  // [a Prone creature] has Advantage if the attacker is within 5 feet of
  // it, disadvantage otherwise") — verified for both cases, no melee/ranged
  // distinction in the function's input at all anymore (an earlier version
  // wrongly special-cased melee as unconditional advantage).
  it('prone + attacker in melee range -> advantage', () => {
    expect(attackModeAgainst({ ...base, prone: true, targetInMeleeRange: true })).toBe('advantage')
  })

  it('prone + attacker NOT in melee range -> disadvantage', () => {
    expect(attackModeAgainst({ ...base, prone: true, targetInMeleeRange: false })).toBe('disadvantage')
  })

  it('vexed AND prone-disadvantage cancel out to normal', () => {
    expect(attackModeAgainst({ ...base, vexed: true, prone: true, targetInMeleeRange: false })).toBe('normal')
  })
})

describe('monsterAttackMode (#28)', () => {
  it('normal with no flags', () => {
    expect(monsterAttackMode({ sapped: false, prone: false })).toBe('normal')
  })

  it('sapped -> disadvantage', () => {
    expect(monsterAttackMode({ sapped: true, prone: false })).toBe('disadvantage')
  })

  it('prone -> disadvantage (its own "Disadvantage on attack rolls", not consumed)', () => {
    expect(monsterAttackMode({ sapped: false, prone: true })).toBe('disadvantage')
  })

  it('sapped AND prone -> still just disadvantage, not double-penalized', () => {
    expect(monsterAttackMode({ sapped: true, prone: true })).toBe('disadvantage')
  })
})

describe('toppleSaveDc (#28)', () => {
  it('is 8 + ability modifier + proficiency bonus', () => {
    expect(toppleSaveDc(3, 2)).toBe(13)
    expect(toppleSaveDc(0, 4)).toBe(12)
  })
})

describe('savingThrow (#28)', () => {
  it('succeeds when roll + modifier meets the DC', () => {
    expect(savingThrow(3, 13, 10).success).toBe(true)
  })

  it('fails when roll + modifier is below the DC', () => {
    expect(savingThrow(3, 13, 9).success).toBe(false)
  })

  it('has no special natural-20/1 rule (unlike an attack roll)', () => {
    // Nat 20 + a very negative modifier can still fail a save in 5e.
    expect(savingThrow(-15, 13, 20).success).toBe(false)
  })
})

describe('gwfAdjustedDieAverage (#28)', () => {
  it('matches the SRD-stated d6 average (3.5 -> 4.0)', () => {
    expect(gwfAdjustedDieAverage(6)).toBeCloseTo(4.0)
  })

  it('matches the SRD-stated d8 average (4.5 -> 4.875)', () => {
    expect(gwfAdjustedDieAverage(8)).toBeCloseTo(4.875)
  })

  it('d10 -> 5.8, d12 -> 6.75', () => {
    expect(gwfAdjustedDieAverage(10)).toBeCloseTo(5.8)
    expect(gwfAdjustedDieAverage(12)).toBeCloseTo(6.75)
  })
})
