// Shared types for the character-creation wizard. Mirrors the frozen
// CharacterData contract the server expects at POST /api/characters.

export type Ability =
  | 'Strength'
  | 'Dexterity'
  | 'Constitution'
  | 'Intelligence'
  | 'Wisdom'
  | 'Charisma'

export const ABILITIES: Ability[] = [
  'Strength',
  'Dexterity',
  'Constitution',
  'Intelligence',
  'Wisdom',
  'Charisma',
]

// The fixed SRD 5.2 / 2024 skill list. Not sourced from @data — there is no
// "list of all skills" entry in the content pack, only per-class/background
// subsets — so this is hardcoded the same way Ability names are hardcoded in
// data/schema.ts. Used as the fallback option list for classes like Bard
// whose skillProficiencies text ("Choose any 3 skills...") names no explicit
// list.
export const ALL_SKILLS = [
  'Acrobatics',
  'Animal Handling',
  'Arcana',
  'Athletics',
  'Deception',
  'History',
  'Insight',
  'Intimidation',
  'Investigation',
  'Medicine',
  'Nature',
  'Perception',
  'Performance',
  'Persuasion',
  'Religion',
  'Sleight of Hand',
  'Stealth',
  'Survival',
]

export interface AbilityScoresData {
  rolls: [number, number, number, number, number, number]
  assignment: Record<Ability, number>
  backgroundIncrease: { plusTwo?: string; plusOne?: string[] }
}

/** One record per level gained above 1 (M5 leveling). Older saved M3/M4
 * characters won't have this field at all — treat `levelUps` as optional and
 * absent-safe (default to `[]`) everywhere it's read. */
export interface LevelUpEntry {
  level: number // 2..10
  hitPointGain: number // the fixed value used that level (die-average+1, +1 more if Dwarf)
  featChoice?: { featId: string; abilityIncreases?: Ability[] } // only present at ASI-granting levels
  spellsAdded?: { cantrips: string[]; prepared: string[] } // only present for casters at levels where slot/cantrip counts grow
}

export interface CharacterData {
  speciesId: string
  backgroundId: string
  classes: [{ classId: string; level: number }]
  abilityScores: AbilityScoresData
  skillProficiencies: string[]
  equipmentChoice: string
  spells?: { cantrips: string[]; prepared: string[] }
  levelUps?: LevelUpEntry[]
}

export const WIZARD_STEPS = [
  'class',
  'origin',
  'abilities',
  'skills',
  'equipment',
  'spells',
  'name',
] as const

export type WizardStep = (typeof WIZARD_STEPS)[number]
