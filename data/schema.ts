// Content-pack schema — shared by build scripts (data/build/*.js) and the
// client query layer. One source of truth so parser output and engine
// expectations can't drift.

export interface SourceRef {
  book: string // e.g. "SRD 5.2.1"
  section?: string
}

export interface PackManifest {
  id: string // e.g. "srd-5.2"
  name: string
  version: string
  license: string // "CC-BY 4.0"
  attribution: string // full attribution text, rendered in-app
  sourceCommit: string // pinned commit of the source repo this was built from
}

export type Ability = 'Strength' | 'Dexterity' | 'Constitution' | 'Intelligence' | 'Wisdom' | 'Charisma'

export interface Feature {
  level: number
  name: string
  description: string // markdown prose, as extracted (trait-name emphasis preserved)
}

export interface ClassFeatureTableRow {
  level: number
  proficiencyBonus: string // e.g. "+2"
  features: string[] // feature names granted at this level (cross-references Feature[])
  extraColumns: Record<string, string> // class-specific columns, e.g. { Rages: "2", "Rage Damage": "+2" }
}

export interface SpellSlotRow {
  level: number
  cantrips?: number
  preparedOrKnown?: number
  slotsByLevel: Record<number, number> // spell-level (1-9) -> slot count
}

export interface Subclass {
  id: string
  name: string // e.g. "Path of the Berserker"
  classId: string
  flavorLine?: string
  features: Feature[]
  pack: string
  source: SourceRef
}

export interface ClassEntry {
  id: string
  name: string
  primaryAbility: string
  hitPointDie: string
  savingThrowProficiencies: Ability[]
  skillProficiencies: string // raw "Choose N: ..." text
  weaponProficiencies: string
  armorTraining: string
  startingEquipment: string
  multiclassTraitsGranted: string // "Gain the following traits...: ..." raw text
  featureTable: ClassFeatureTableRow[]
  features: Feature[]
  spellSlotTable?: SpellSlotRow[] // present only for casters
  subclasses: Subclass[]
  pack: string
  source: SourceRef
}

export interface SpeciesTrait {
  name: string
  description: string
}

export interface SpeciesEntry {
  id: string
  name: string
  creatureType?: string
  size?: string
  speed?: string
  traits: SpeciesTrait[]
  pack: string
  source: SourceRef
}

export interface BackgroundEntry {
  id: string
  name: string
  abilityScores?: string[] // suggested ability score array
  feat?: string
  skillProficiencies?: string[]
  toolProficiency?: string
  equipment?: string
  pack: string
  source: SourceRef
}

export interface FeatEntry {
  id: string
  name: string
  category: 'Origin' | 'General' | 'General / Racial' | 'Fighting Style' | 'Epic Boon'
  prerequisite?: string
  repeatable: boolean
  benefit: string
  pack: string
  source: SourceRef
}

export interface SpellEntry {
  id: string
  name: string
  level: number // 0 = cantrip
  school: string
  castingTime: string
  range: string
  components: string
  duration: string
  classes: string[] // which class spell lists include this spell
  description: string
  higherLevels?: string
  pack: string
  source: SourceRef
}

export type EquipmentCategory = 'weapon' | 'armor' | 'gear' | 'tool' | 'other'

export interface EquipmentEntry {
  id: string
  name: string
  category: EquipmentCategory
  cost?: string
  weight?: string
  properties?: string
  description?: string
  pack: string
  source: SourceRef
}

export interface ContentPack {
  manifest: PackManifest
  classes: ClassEntry[]
  species: SpeciesEntry[]
  backgrounds: BackgroundEntry[]
  feats: FeatEntry[]
  spells: SpellEntry[]
  equipment: EquipmentEntry[]
}
