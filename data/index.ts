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
import monstersJson from './monsters.json'
import type {
  PackManifest,
  ClassEntry,
  SpeciesEntry,
  BackgroundEntry,
  FeatEntry,
  SpellEntry,
  EquipmentEntry,
  MonsterEntry,
  ContentPack,
} from './schema'

const manifest = manifestJson as PackManifest
const classes = classesJson as unknown as ClassEntry[]
const species = speciesJson as unknown as SpeciesEntry[]
const backgrounds = backgroundsJson as unknown as BackgroundEntry[]
const bundledFeats = featsJson as unknown as FeatEntry[]
const spells = spellsJson as unknown as SpellEntry[]
const equipment = equipmentJson as unknown as EquipmentEntry[]
const monsters = monstersJson as unknown as MonsterEntry[]

export const srdPack: ContentPack = {
  manifest,
  classes,
  species,
  backgrounds,
  feats: bundledFeats,
  spells,
  equipment,
  monsters,
}

// M2b: admin-imported content packs (e.g. PHB-2024 feats), fetched once at
// app boot (see initPacks() below, called from main.tsx before the router
// mounts) and merged in here. Every other function in this file stays
// synchronous — call sites (listFeats, getFeat, etc.) never had to become
// async, since the merge happens before any of them are ever called.
let importedFeats: FeatEntry[] = []
let importedBackgrounds: BackgroundEntry[] = []
let importedSpecies: SpeciesEntry[] = []
let importedEquipment: EquipmentEntry[] = []
let importedPackManifests: { id: string; name: string }[] = []

/** Fetches this instance's admin-imported packs and merges their feats in.
 * Degrades gracefully on any failure (network error, or a 401 for a
 * logged-out visitor on /login or /register, which is expected, not an
 * error) — the app proceeds with SRD-only content rather than blocking.
 * Call once, before rendering the app (see main.tsx). */
export async function initPacks(): Promise<void> {
  try {
    const res = await fetch('/api/packs', { credentials: 'include' })
    if (!res.ok) return // not authenticated yet, or a transient error — SRD-only is fine
    const body = (await res.json()) as {
      packs: {
        packId: string
        manifest: { name: string }
        content: {
          feats?: FeatEntry[]
          backgrounds?: BackgroundEntry[]
          species?: SpeciesEntry[]
          equipment?: EquipmentEntry[]
        }
      }[]
    }
    importedFeats = body.packs.flatMap((p) => p.content.feats ?? [])
    importedBackgrounds = body.packs.flatMap((p) => p.content.backgrounds ?? [])
    importedSpecies = body.packs.flatMap((p) => p.content.species ?? [])
    importedEquipment = body.packs.flatMap((p) => p.content.equipment ?? [])
    importedPackManifests = body.packs.map((p) => ({ id: p.packId, name: p.manifest.name }))
  } catch {
    // Network failure, malformed response, etc. — degrade to SRD-only.
  }
}

/** Every pack currently loaded (bundled SRD + any imported), for UI that
 * needs to group content per-pack (e.g. the collapsible per-pack picker
 * sections). Bundled SRD is always first. */
export function listLoadedPacks(): { id: string; name: string }[] {
  return [{ id: manifest.id, name: manifest.name }, ...importedPackManifests]
}

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
  return [...species, ...importedSpecies]
}

export function getSpecies(id: string): SpeciesEntry | undefined {
  return species.find((s) => s.id === id) ?? importedSpecies.find((s) => s.id === id)
}

export function listBackgrounds(): BackgroundEntry[] {
  return [...backgrounds, ...importedBackgrounds]
}

export function getBackground(id: string): BackgroundEntry | undefined {
  return backgrounds.find((b) => b.id === id) ?? importedBackgrounds.find((b) => b.id === id)
}

export function listFeats(category?: FeatEntry['category'] | FeatEntry['category'][]): FeatEntry[] {
  const all = [...bundledFeats, ...importedFeats]
  if (!category) return all
  const categories = Array.isArray(category) ? category : [category]
  return all.filter((f) => categories.includes(f.category))
}

export function getFeat(id: string): FeatEntry | undefined {
  return bundledFeats.find((f) => f.id === id) ?? importedFeats.find((f) => f.id === id)
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
  const all = [...equipment, ...importedEquipment]
  return category ? all.filter((e) => e.category === category) : all
}

export function getEquipment(id: string): EquipmentEntry | undefined {
  return equipment.find((e) => e.id === id) ?? importedEquipment.find((e) => e.id === id)
}

// Monsters are bundled-only for the M11 sandbox (a curated SRD subset, not an
// M2b-importable category — see docs/planning/m2b-execution-plan.md §2, which
// explicitly excludes monsters from M2b v1 scope) — no imported-pack merge,
// same simple pattern as listClasses/getClass.
export function listMonsters(): MonsterEntry[] {
  return monsters
}

export function getMonster(id: string): MonsterEntry | undefined {
  return monsters.find((m) => m.id === id)
}
