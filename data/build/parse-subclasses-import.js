// Converts a vault-shaped subclass JSON file (shape:
//   { subclasses: [{ name, class, source, category, mechanics_first, lore_and_flavor }] })
// into Subclass[] per the frozen schema (schema.ts). Unlike every other M2b
// importer (feats/backgrounds/species/equipment/spells), `Subclass` isn't a
// top-level content-pack category — it's normally nested inside
// `ClassEntry.subclasses[]`. Imported subclasses are stored as their own
// flat array (each entry carries its own `classId`) and merged into the
// right bundled class's `subclasses[]` at READ time by `data/index.ts`'s
// `getClass()` — see docs/planning/issue-22-and-subclass-import-plan.md for
// why (classes.json itself isn't an importable M2b category, so there's no
// "parent" to nest an imported subclass inside the way the bundled ones
// are nested at build time).
//
// The real vault files live outside this repo and are never committed;
// pass one's path via --input.
'use strict'
const fs = require('fs')
const path = require('path')

const DEFAULT_PACK = 'expansion-subclasses'

// The 12 bundled SRD classes a subclass can actually attach to — anything
// else (e.g. "Artificer", which several vault subclass files include but
// the app has no class entry for at all) has nowhere to go. Hardcoded
// rather than read from data/classes.json at parse time: this script runs
// standalone (also invoked from the server, see admin.js) and shouldn't
// need a live read of the bundled dataset just to validate a class name —
// this list changes only if a new bundled class is ever added, which is
// rare enough to update by hand, same as VALID_CATEGORIES in
// parse-feats-import.js.
const VALID_CLASS_IDS = [
  'barbarian', 'bard', 'cleric', 'druid', 'fighter', 'monk',
  'paladin', 'ranger', 'rogue', 'sorcerer', 'warlock', 'wizard',
]

function slugify(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
}

// Each `mechanics_first` bullet is one feature, prefixed
// "**<Feature Name> (Level N):**" — verified against all 77 real vault
// subclass entries (4 files). Returns null (not a throw) so the caller can
// name the offending subclass AND bullet in its own error message.
const FEATURE_RE = /^\*\*(.+?)\s*\(Level (\d+)\):\*\*\s*([\s\S]*)$/

function parseFeatureBullet(bullet) {
  const match = bullet.match(FEATURE_RE)
  if (!match) return null
  return { level: parseInt(match[2], 10), name: match[1].trim(), description: match[3].trim() }
}

// Converts one vault subclass object into a Subclass. Throws on the first
// problem found, naming the offending subclass, matching every other M2b
// importer's "reject the whole pack, name the offender" convention.
function parseSubclassEntry(vaultSubclass, packId) {
  const { name, class: className, source, mechanics_first, lore_and_flavor } = vaultSubclass

  if (!name || typeof name !== 'string') {
    throw new Error(`Subclass entry missing a valid "name": ${JSON.stringify(vaultSubclass)}`)
  }
  if (!className || typeof className !== 'string') {
    throw new Error(`Subclass "${name}" is missing a "class" string`)
  }
  const classId = slugify(className)
  if (!VALID_CLASS_IDS.includes(classId)) {
    throw new Error(
      `Subclass "${name}" belongs to class "${className}" (slugified "${classId}"), which isn't one of the app's 12 bundled classes — ${VALID_CLASS_IDS.join(', ')}. This subclass has nowhere to attach and must be removed from the import file before this pack can be imported.`,
    )
  }
  if (!source || typeof source !== 'string') {
    throw new Error(`Subclass "${name}" is missing a "source" string`)
  }
  if (!Array.isArray(mechanics_first) || mechanics_first.length === 0) {
    throw new Error(`Subclass "${name}" has no "mechanics_first" bullets to build features from`)
  }

  const features = mechanics_first.map((bullet, i) => {
    const parsed = parseFeatureBullet(bullet)
    if (!parsed) {
      throw new Error(
        `Subclass "${name}"'s mechanics_first bullet #${i + 1} doesn't match the expected "**Name (Level N):** ..." shape: "${bullet.slice(0, 80)}..."`,
      )
    }
    return parsed
  })

  return {
    id: `${packId}:${slugify(name)}`,
    name,
    classId,
    flavorLine: typeof lore_and_flavor === 'string' && lore_and_flavor.trim() ? lore_and_flavor.trim() : undefined,
    features,
    pack: packId,
    source: { book: source },
  }
}

// Converts a whole vault-shaped `{ subclasses: [...] }` document into
// Subclass[].
function parseSubclassesImport(vaultDoc, packId = DEFAULT_PACK) {
  if (!vaultDoc || !Array.isArray(vaultDoc.subclasses)) {
    throw new Error('Expected a document shaped { subclasses: [...] }')
  }
  if (typeof packId !== 'string' || !packId.trim()) {
    throw new Error('packId is required and must be a non-empty string')
  }
  const subclasses = vaultDoc.subclasses.map((s) => parseSubclassEntry(s, packId))

  const seenById = new Map()
  for (const subclass of subclasses) {
    const prior = seenById.get(subclass.id)
    if (prior) {
      throw new Error(`Duplicate subclass id "${subclass.id}" from "${prior.name}" and "${subclass.name}" — names must be unique after slugification`)
    }
    seenById.set(subclass.id, subclass)
  }

  return subclasses
}

function main() {
  const args = process.argv.slice(2)
  const getArg = (flag) => {
    const i = args.indexOf(flag)
    return i !== -1 ? args[i + 1] : undefined
  }

  const inputPath = getArg('--input')
  const outputPath = getArg('--output')
  const packId = getArg('--pack-id') ?? DEFAULT_PACK
  if (!inputPath || !outputPath) {
    console.error('Usage: node parse-subclasses-import.js --input <vault-subclasses.json> --output <out.json> [--pack-id <id>]')
    process.exit(1)
  }

  const vaultDoc = JSON.parse(fs.readFileSync(path.resolve(inputPath), 'utf8'))
  const subclasses = parseSubclassesImport(vaultDoc, packId)

  fs.writeFileSync(outputPath, JSON.stringify(subclasses, null, 2))
  console.log(`Parsed ${subclasses.length} subclasses from ${inputPath}`)
  console.log(`Wrote ${outputPath}`)
}

if (require.main === module) {
  main()
}

module.exports = { parseSubclassesImport, parseSubclassEntry, parseFeatureBullet, slugify, VALID_CLASS_IDS, DEFAULT_PACK }
