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
  // Which entry mode produced `rolls` — "roll" (Roll for me) or "manual"
  // (Enter my own roll). Optional/absent-safe: older saved characters (and
  // in-progress drafts before this field existed) have no rollMode at all;
  // treat missing as "manual" (the step's own prior default) rather than
  // guessing "roll" for data that was never actually rolled in-app.
  rollMode?: 'roll' | 'manual'
}

/** One record per level gained above the character's starting level-1 class
 * (M5 leveling, M6 multiclassing). Older saved M3/M4 characters won't have
 * this field at all — treat `levelUps` as optional and absent-safe (default
 * to `[]`) everywhere it's read. */
export interface LevelUpEntry {
  // M6: which class this level was taken in. Optional/absent-safe — old M5
  // saves (and pre-M6 test fixtures) have no classId at all; a missing
  // classId means "the character's only/first class."
  classId?: string
  level: number // 2..10, that class's own level after this entry
  hitPointGain: number // the fixed value used that level (die-average+1, +1 more if Dwarf)
  featChoice?: { featId: string; abilityIncreases?: Ability[] } // only present at ASI-granting levels
  spellsAdded?: { cantrips: string[]; prepared: string[] } // only present for casters at levels where slot/cantrip counts grow
}

export interface CharacterClassEntry {
  classId: string
  level: number
}

export interface CharacterData {
  speciesId: string
  backgroundId: string
  // M6: a real array — first entry is the original level-1 class, later
  // entries (if any) are added via multiclassing. Every saved character has
  // at least one entry.
  classes: CharacterClassEntry[]
  abilityScores: AbilityScoresData
  skillProficiencies: string[]
  equipmentChoice: string
  spells?: { cantrips: string[]; prepared: string[] }
  levelUps?: LevelUpEntry[]
  // Bonus Origin feat granted by a species trait (e.g. Human's Versatile).
  // Optional/absent-safe — only present for species with such a trait, and
  // absent on characters saved before this was implemented.
  originFeatId?: string
  // Spells chosen for a spell-granting Origin feat granted by the
  // character's Background (e.g. Sage's fixed "Magic Initiate (Wizard)").
  // Separate from class spellcasting `spells` above — populated only when
  // the background grants such a feat. See docs/planning/issue-2-plan.md.
  originFeatSpells?: { cantrips: string[]; prepared: string[] }
  // Spell list and spellcasting ability chosen for a Versatile-species-granted
  // spell-casting Origin feat (e.g. Magic Initiate), plus the spells picked
  // from that list. Independent of originFeatSpells above (which is
  // background-only) — a character can have both a background-granted and a
  // Versatile-granted Magic Initiate simultaneously, each with its own list
  // per the feat's "different spell list each time" rule. Optional/absent-safe.
  // See docs/planning/issue-15-plan.md.
  originFeatSpellList?: string
  originFeatSpellAbility?: string
  versatileFeatSpells?: { cantrips: string[]; prepared: string[] }
}

export const WIZARD_STEPS = [
  'class',
  'origin',
  'abilities',
  'skills',
  'speciesBonus',
  'equipment',
  'spells',
  'name',
] as const

export type WizardStep = (typeof WIZARD_STEPS)[number]
