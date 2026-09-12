import { describe, expect, it } from 'vitest'
import { getFeat } from '@data'
import { resolveBackgroundFeatSpellAbility } from './CreateCharacterPage'

describe('resolveBackgroundFeatSpellAbility (#17: background Magic Initiate had no recorded spellcasting ability)', () => {
  it('returns nothing when the background grants no feat at all', () => {
    const result = resolveBackgroundFeatSpellAbility(undefined, undefined)
    expect(result.backgroundSpellAbilities).toEqual([])
    expect(result.backgroundAbilityIsDerived).toBe(false)
    expect(result.derivedBackgroundFeatSpellAbility).toBeUndefined()
  })

  it('SRD Magic Initiate (Wizard): free-choice ability (Int/Wis/Cha), not derived', () => {
    const srdMagicInitiate = getFeat('magic-initiate')
    expect(srdMagicInitiate).toBeDefined()
    const result = resolveBackgroundFeatSpellAbility('Wizard', srdMagicInitiate)
    expect(result.backgroundAbilityIsDerived).toBe(false)
    expect(result.backgroundSpellAbilities).toEqual(['Intelligence', 'Wisdom', 'Charisma'])
    expect(result.derivedBackgroundFeatSpellAbility).toBeUndefined()
  })

  // PHB-2024's Magic Initiate has no free ability choice at all — its own
  // prose ties the ability to whichever class was chosen. A background like
  // Sage fixes that class via its feat text's parenthetical ("Magic
  // Initiate (Wizard)"); this is the real gap #17 was filed for, now live
  // in production after the 2026-09-12 phb-2024 import.
  const phbMagicInitiate = {
    id: 'phb-2024:magic-initiate',
    benefit:
      '**Spell Training:** Choose one spellcasting class: Bard, Cleric, Druid, Sorcerer, Warlock, or Wizard. You learn **two Cantrips of your choice** and **one 1st-level spell of your choice** from that class\'s spell list. **Free Spellcasting:** You can **cast the chosen 1st-level spell once per long rest without expending a spell slot**. **Spell Slots Compatibility:** You can also cast the chosen 1st-level spell **using any spell slots you have of the appropriate level**. **Spellcasting Ability:** The spellcasting ability modifier for these spells is the one associated with the chosen class (e.g. Charisma for Sorcerer, Wisdom for Druid/Cleric, Intelligence for Wizard).',
  }

  it('PHB-2024 Magic Initiate (Wizard) [Sage background]: derived ability = Intelligence, matching Wizard', () => {
    const result = resolveBackgroundFeatSpellAbility('Wizard', phbMagicInitiate)
    expect(result.backgroundAbilityIsDerived).toBe(true)
    expect(result.backgroundSpellAbilities).toEqual([])
    expect(result.derivedBackgroundFeatSpellAbility).toBe('Intelligence')
  })

  it('PHB-2024 Magic Initiate (Cleric): derived ability = Wisdom, matching Cleric', () => {
    const result = resolveBackgroundFeatSpellAbility('Cleric', phbMagicInitiate)
    expect(result.backgroundAbilityIsDerived).toBe(true)
    expect(result.derivedBackgroundFeatSpellAbility).toBe('Wisdom')
  })

  it('PHB-2024 Magic Initiate (Sorcerer): derived ability = Charisma, matching Sorcerer', () => {
    const result = resolveBackgroundFeatSpellAbility('Sorcerer', phbMagicInitiate)
    expect(result.backgroundAbilityIsDerived).toBe(true)
    expect(result.derivedBackgroundFeatSpellAbility).toBe('Charisma')
  })

  it('a non-Magic-Initiate background feat (e.g. Skilled) is never classified as derived', () => {
    // featSpellList is only non-undefined once backgroundFeatSpellList has
    // already identity-checked the background's feat as literally named
    // "Magic Initiate" — so this call shape (a real featSpellList paired
    // with a feat that grants no spells) can't happen via the real call
    // site, but exercises the guard directly rather than only through it.
    const skilled = getFeat('skilled')
    expect(skilled).toBeDefined()
    const result = resolveBackgroundFeatSpellAbility('Wizard', skilled)
    expect(result.backgroundAbilityIsDerived).toBe(false)
  })

  it('falls back to the standard 3-ability free-choice picker if the derived class cannot be resolved', () => {
    // A hypothetical future variant naming a class getClass can't find
    // (e.g. one only an unimported pack would provide) must not leave the
    // player blocked with neither a derived note nor a picker on screen.
    const result = resolveBackgroundFeatSpellAbility('Artificer', phbMagicInitiate)
    expect(result.backgroundAbilityIsDerived).toBe(false)
    expect(result.derivedBackgroundFeatSpellAbility).toBeUndefined()
    expect(result.backgroundSpellAbilities).toEqual(['Intelligence', 'Wisdom', 'Charisma'])
  })
})
