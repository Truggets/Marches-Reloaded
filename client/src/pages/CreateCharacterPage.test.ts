import { describe, expect, it } from 'vitest'
import { getFeat } from '@data'
import { resolveBackgroundFeatSpellAbility, statsDeltaFor } from './CreateCharacterPage'
import type { AbilityScoresData } from '../character-wizard/types'

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

describe('statsDeltaFor (#19: Wilbur relays mechanical stat deltas)', () => {
  const fighterDex14: AbilityScoresData = {
    rolls: [10, 10, 10, 10, 10, 10],
    assignment: { Strength: 15, Dexterity: 14, Constitution: 13, Intelligence: 10, Wisdom: 10, Charisma: 8 },
    backgroundIncrease: {},
  }

  it('returns nothing before class/species/background/abilities are all chosen', () => {
    expect(statsDeltaFor('abilities', null, 'human', 'soldier', fighterDex14, [], [], null)).toEqual([])
    expect(statsDeltaFor('abilities', 'fighter', null, 'soldier', fighterDex14, [], [], null)).toEqual([])
    expect(statsDeltaFor('abilities', 'fighter', 'human', 'soldier', null, [], [], null)).toEqual([])
  })

  it('abilities step: AC/HP delta vs a flat-10 baseline', () => {
    const lines = statsDeltaFor('abilities', 'fighter', 'human', 'soldier', fighterDex14, [], [], null)
    expect(lines).toContain('AC 10 → 12') // Dex 14 vs flat 10
    expect(lines).toContain('HP 10 → 11') // Con 13 vs flat 10
  })

  it('equipment step: no delta until an option is actually chosen', () => {
    expect(statsDeltaFor('equipment', 'fighter', 'human', 'soldier', fighterDex14, [], [], null)).toEqual([])
  })

  it('equipment step: AC delta once an armored option is chosen (issue\'s own "AC 10 → 16"-style example)', () => {
    const lines = statsDeltaFor('equipment', 'fighter', 'human', 'soldier', fighterDex14, [], [], 'A')
    expect(lines).toEqual(['AC 12 → 16']) // unarmored (10+Dex2) -> Chain Mail (flat 16)
  })

  it('skills step: delta for a newly chosen skill not granted by the background', () => {
    const lines = statsDeltaFor('skills', 'fighter', 'human', 'soldier', fighterDex14, ['Athletics'], [], null)
    expect(lines).toEqual(['Athletics +2 → +4']) // Str mod +2 unproficient -> +2 mod +2 prof
  })

  it('skills step: no delta for a skill the background already grants', () => {
    const lines = statsDeltaFor('skills', 'fighter', 'human', 'soldier', fighterDex14, [], ['Athletics'], null)
    expect(lines).toEqual([])
  })

  it('skills step: no delta even when the player also picks a (bg)-marked skill themselves (no double-counted proficiency)', () => {
    const lines = statsDeltaFor(
      'skills',
      'fighter',
      'human',
      'soldier',
      fighterDex14,
      ['Athletics'],
      ['Athletics'],
      null,
    )
    expect(lines).toEqual([])
  })

  it('abilities step: a caster shows a Save DC delta too', () => {
    const wizardInt16: AbilityScoresData = {
      ...fighterDex14,
      assignment: { ...fighterDex14.assignment, Intelligence: 16 },
    }
    const lines = statsDeltaFor('abilities', 'wizard', 'human', 'sage', wizardInt16, [], [], null)
    expect(lines).toContain('Save DC 10 → 13') // flat-10 Int (mod +0) vs Int 16 (mod +3), prof +2
  })

  it('abilities step: carries an already-made equipment choice into both snapshots (Back-navigation from Equipment must not show a misleading unarmored AC)', () => {
    const lines = statsDeltaFor('abilities', 'fighter', 'human', 'soldier', fighterDex14, [], [], 'A')
    // Chain Mail is flat AC 16 regardless of Dex, so Dex 14 vs flat-10 abilities
    // makes no AC difference once armor is already chosen — only HP changes.
    expect(lines).not.toContain('AC 10 → 12')
    expect(lines).toContain('HP 10 → 11')
  })

  it('non-diffable steps (class/origin/speciesBonus/spells/name) return no delta', () => {
    for (const step of ['class', 'origin', 'speciesBonus', 'spells', 'name']) {
      expect(statsDeltaFor(step, 'fighter', 'human', 'soldier', fighterDex14, [], [], 'A')).toEqual([])
    }
  })
})
