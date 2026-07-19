// Pack-scoped query layer over the bundled SRD 5.2 content pack.
// Imported directly by the client (Vite bundles the JSON) — no server
// round-trip, no live API. See CLAUDE.md: rules engine is client-side.
import manifestJson from './manifest.json'
import classesJson from './classes.json'
import speciesJson from './species.json'
import backgroundsJson from './backgrounds.json'
import featsJson from './feats.json'
import spellsJson from './spells.json'
import equipmentJson from './equipment.json'
import type {
  PackManifest,
  ClassEntry,
  SpeciesEntry,
  BackgroundEntry,
  FeatEntry,
  SpellEntry,
  EquipmentEntry,
  ContentPack,
} from './schema'

const manifest = manifestJson as PackManifest
const classes = classesJson as unknown as ClassEntry[]
const species = speciesJson as unknown as SpeciesEntry[]
const backgrounds = backgroundsJson as unknown as BackgroundEntry[]
const feats = featsJson as unknown as FeatEntry[]
const spells = spellsJson as unknown as SpellEntry[]
const equipment = equipmentJson as unknown as EquipmentEntry[]

export const srdPack: ContentPack = { manifest, classes, species, backgrounds, feats, spells, equipment }

export function getManifest(): PackManifest {
  return manifest
}

export function listClasses(): ClassEntry[] {
  return classes
}

export function getClass(id: string): ClassEntry | undefined {
  return classes.find((c) => c.id === id)
}

export function listSpecies(): SpeciesEntry[] {
  return species
}

export function getSpecies(id: string): SpeciesEntry | undefined {
  return species.find((s) => s.id === id)
}

export function listBackgrounds(): BackgroundEntry[] {
  return backgrounds
}

export function getBackground(id: string): BackgroundEntry | undefined {
  return backgrounds.find((b) => b.id === id)
}

export function listFeats(category?: FeatEntry['category']): FeatEntry[] {
  return category ? feats.filter((f) => f.category === category) : feats
}

export function getFeat(id: string): FeatEntry | undefined {
  return feats.find((f) => f.id === id)
}

export function listSpells(): SpellEntry[] {
  return spells
}

export function getSpell(id: string): SpellEntry | undefined {
  return spells.find((s) => s.id === id)
}

export function getSpellsByClass(className: string): SpellEntry[] {
  return spells.filter((s) => s.classes.some((c) => c.toLowerCase() === className.toLowerCase()))
}

export function listEquipment(category?: EquipmentEntry['category']): EquipmentEntry[] {
  return category ? equipment.filter((e) => e.category === category) : equipment
}

export function getEquipment(id: string): EquipmentEntry | undefined {
  return equipment.find((e) => e.id === id)
}
