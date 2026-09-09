import { describe, expect, it } from 'vitest'
import { resolveMonsterAttack, resolveSpellAttack } from './sandbox'
import type { MonsterEntry } from '@data/schema'

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
