import { describe, expect, it } from 'vitest'
import { getClass } from '@data'
import { parseWeaponsFromEquipmentChoice } from './equipmentAttack'

describe('parseWeaponsFromEquipmentChoice', () => {
  it("resolves Fighter's option A to Greatsword, Flail, and Javelin", () => {
    const fighter = getClass('fighter')!
    const weapons = parseWeaponsFromEquipmentChoice(fighter, 'A')
    const names = weapons.map((w) => w.name).sort()
    expect(names).toEqual(['Flail', 'Greatsword', 'Javelin'].sort())
    // Chain Mail (armor) and Dungeoneer's Pack (gear) must not leak in.
    expect(weapons.every((w) => w.category === 'weapon')).toBe(true)
    expect(weapons.every((w) => w.damage !== undefined)).toBe(true)
  })

  it("resolves Fighter's option B to Scimitar, Shortsword, and Longbow", () => {
    const fighter = getClass('fighter')!
    const weapons = parseWeaponsFromEquipmentChoice(fighter, 'B')
    const names = weapons.map((w) => w.name).sort()
    expect(names).toEqual(['Longbow', 'Scimitar', 'Shortsword'].sort())
  })

  it("resolves Fighter's gold-only option C to an empty list", () => {
    const fighter = getClass('fighter')!
    const weapons = parseWeaponsFromEquipmentChoice(fighter, 'C')
    expect(weapons).toEqual([])
  })

  it("resolves Rogue's gold-only option B to an empty list", () => {
    const rogue = getClass('rogue')!
    const weapons = parseWeaponsFromEquipmentChoice(rogue, 'B')
    expect(weapons).toEqual([])
  })

  it('returns an empty list for a letter that does not match any parsed option', () => {
    const fighter = getClass('fighter')!
    const weapons = parseWeaponsFromEquipmentChoice(fighter, 'Z')
    expect(weapons).toEqual([])
  })

  it('resolves a quantity+plural item ("8 Javelins") to the singular Javelin entry', () => {
    const fighter = getClass('fighter')!
    const weapons = parseWeaponsFromEquipmentChoice(fighter, 'A')
    const javelin = weapons.find((w) => w.name === 'Javelin')
    expect(javelin).toBeDefined()
    expect(javelin?.category).toBe('weapon')
  })

  it('resolves Rogue option A\'s "2 Daggers" to the singular Dagger entry, alongside Shortsword/Shortbow', () => {
    const rogue = getClass('rogue')!
    const weapons = parseWeaponsFromEquipmentChoice(rogue, 'A')
    const names = weapons.map((w) => w.name).sort()
    expect(names).toEqual(['Dagger', 'Shortbow', 'Shortsword'].sort())
  })

  it('is case-insensitive on the letter, matching armorClass\'s convention', () => {
    const fighter = getClass('fighter')!
    const upper = parseWeaponsFromEquipmentChoice(fighter, 'A').map((w) => w.name).sort()
    const lower = parseWeaponsFromEquipmentChoice(fighter, 'a').map((w) => w.name).sort()
    expect(lower).toEqual(upper)
  })

  // Coverage for the remaining 10 of the 12 bundled classes' option-A prose,
  // per the plan doc's Definition of Done ("all 12 classes' real prose").
  // Each covers a different edge case the parser must not choke on.

  it("resolves Barbarian's option A (\"4 Handaxes\" plural + gear pack)", () => {
    const barbarian = getClass('barbarian')!
    const weapons = parseWeaponsFromEquipmentChoice(barbarian, 'A')
    const names = weapons.map((w) => w.name).sort()
    expect(names).toEqual(['Greataxe', 'Handaxe'].sort())
  })

  it('drops "Musical Instrument of your choice" (Bard option A)', () => {
    const bard = getClass('bard')!
    const weapons = parseWeaponsFromEquipmentChoice(bard, 'A')
    const names = weapons.map((w) => w.name).sort()
    expect(names).toEqual(['Dagger'])
  })

  it('resolves Cleric option A, dropping Chain Shirt/Shield/Holy Symbol/pack', () => {
    const cleric = getClass('cleric')!
    const weapons = parseWeaponsFromEquipmentChoice(cleric, 'A')
    const names = weapons.map((w) => w.name).sort()
    expect(names).toEqual(['Mace'])
  })

  it('resolves a weapon named inside a focus parenthetical: Druid\'s "Druidic Focus (Quarterstaff)"', () => {
    const druid = getClass('druid')!
    const weapons = parseWeaponsFromEquipmentChoice(druid, 'A')
    const names = weapons.map((w) => w.name).sort()
    expect(names).toEqual(['Quarterstaff', 'Sickle'].sort())
  })

  it('drops the "Artisan\'s Tools or Musical Instrument..." choice phrase (Monk option A)', () => {
    const monk = getClass('monk')!
    const weapons = parseWeaponsFromEquipmentChoice(monk, 'A')
    const names = weapons.map((w) => w.name).sort()
    expect(names).toEqual(['Dagger', 'Spear'].sort())
  })

  it('resolves Paladin option A ("6 Javelins" plural + Holy Symbol/pack dropped)', () => {
    const paladin = getClass('paladin')!
    const weapons = parseWeaponsFromEquipmentChoice(paladin, 'A')
    const names = weapons.map((w) => w.name).sort()
    expect(names).toEqual(['Javelin', 'Longsword'].sort())
  })

  it('drops "20 Arrows" (no bundled Arrow weapon entry) and a non-weapon focus parenthetical (Ranger option A)', () => {
    const ranger = getClass('ranger')!
    const weapons = parseWeaponsFromEquipmentChoice(ranger, 'A')
    const names = weapons.map((w) => w.name).sort()
    expect(names).toEqual(['Longbow', 'Scimitar', 'Shortsword'].sort())
  })

  it('drops a non-weapon focus parenthetical, "Arcane Focus (crystal)" (Sorcerer option A)', () => {
    const sorcerer = getClass('sorcerer')!
    const weapons = parseWeaponsFromEquipmentChoice(sorcerer, 'A')
    const names = weapons.map((w) => w.name).sort()
    expect(names).toEqual(['Dagger', 'Spear'].sort())
  })

  it('drops a non-weapon focus parenthetical, "Arcane Focus (orb)" (Warlock option A)', () => {
    const warlock = getClass('warlock')!
    const weapons = parseWeaponsFromEquipmentChoice(warlock, 'A')
    const names = weapons.map((w) => w.name).sort()
    expect(names).toEqual(['Dagger', 'Sickle'].sort())
  })

  it('resolves a second focus-parenthetical weapon, "Arcane Focus (Quarterstaff)" (Wizard option A)', () => {
    const wizard = getClass('wizard')!
    const weapons = parseWeaponsFromEquipmentChoice(wizard, 'A')
    const names = weapons.map((w) => w.name).sort()
    expect(names).toEqual(['Dagger', 'Quarterstaff'].sort())
  })
})
