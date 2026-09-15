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
  // M12: absent until chosen; chosen once at/after the class's subclass-unlock
  // level (see engine/computeSheet.ts's subclassUnlockLevel) and never changes
  // after. Old saves simply lack this field — treat as "not yet chosen."
  subclassId?: string
  // #3: a Fighting Style feat (category "Fighting Style" in feats.json),
  // chosen at this class's fightingStyleUnlockLevel (see
  // engine/computeSheet.ts's fightingStyleUnlockLevel — Fighter: level 1;
  // Paladin/Ranger: level 2). Absent for a class with no Fighting Style
  // feature at all (Barbarian, Rogue), and absent until chosen even for a
  // class that has it. Mutually exclusive with fightingStyleAlternateCantrips
  // below — a character has one or the other, never both.
  fightingStyleFeatId?: string
  // Paladin's Blessed Warrior / Ranger's Druidic Warrior: two cantrips from
  // the class's own spell list (see fightingStyleAlternateCantripClass),
  // chosen INSTEAD OF a Fighting Style feat. Absent for a class with no such
  // alternate (Fighter, and any class with no Fighting Style at all).
  fightingStyleAlternateCantrips?: string[]
  // #3: weapon ids whose mastery property this class can currently use,
  // capped at weaponMasteryCount(classId, level) — grows at certain levels
  // for Fighter/Barbarian (see engine/computeSheet.ts). Absent for a class
  // with no Weapon Mastery feature at all, and absent until chosen.
  weaponMasteryIds?: string[]
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
  // Spellcasting ability for a background-granted Magic Initiate (#17) —
  // either freely chosen (SRD's Int/Wis/Cha choice) or auto-derived from the
  // fixed class in the background's feat text (PHB-2024's "ability matches
  // the chosen class" variant). Optional/absent-safe: absent on every
  // character saved before this was implemented, and on any character whose
  // background doesn't grant a spell-casting Origin feat at all.
  backgroundFeatSpellAbility?: string
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
  // #16: 2 Standard Languages chosen at creation, from `listLanguages()`
  // filtered to `standard && !alwaysKnown` — every character also knows
  // Common (not stored here; it's implied, same as every class's weapon/
  // armor proficiencies aren't re-stated per character). Optional/absent-safe
  // — absent on every character saved before this was implemented.
  languages?: string[]
}

export const WIZARD_STEPS = [
  'class',
  'origin',
  'abilities',
  'skills',
  'languages',
  'speciesBonus',
  'martial',
  'equipment',
  'spells',
  'name',
] as const

export type WizardStep = (typeof WIZARD_STEPS)[number]
