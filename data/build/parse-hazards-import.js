// Converts a vault-shaped hazards/conditions JSON file (shape:
//   { rules_hazards_conditions: [{ name, source, category, mechanics_first, lore_and_flavor }] })
// into HazardEntry[] per the frozen schema (schema.ts). #22: display-only
// reference content — no mechanical integration (see schema.ts's HazardEntry
// doc comment for why). Same mechanics_first + lore_and_flavor description
// assembly as parse-spells-import.js/parse-subclasses-import.js, but with no
// level/school-style structured fields to split out — a hazard/condition
// entry is just a name + free-text description.
//
// The real vault file lives outside this repo and is never committed; pass
// its path via --input.
'use strict'
const fs = require('fs')
const path = require('path')

const DEFAULT_PACK = 'expansion-hazards'

function slugify(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
}

// Converts one vault hazard/condition object into a HazardEntry. Throws on
// the first problem found, naming the offending entry, matching every other
// M2b importer's "reject the whole pack, name the offender" convention.
function parseHazardEntry(vaultEntry, packId) {
  const { name, source, category, mechanics_first, lore_and_flavor } = vaultEntry

  if (!name || typeof name !== 'string') {
    throw new Error(`Hazard/condition entry missing a valid "name": ${JSON.stringify(vaultEntry)}`)
  }
  if (!source || typeof source !== 'string') {
    throw new Error(`Hazard/condition "${name}" is missing a "source" string`)
  }
  if (!Array.isArray(mechanics_first) || mechanics_first.length === 0) {
    throw new Error(`Hazard/condition "${name}" has no "mechanics_first" bullets to build a description from`)
  }

  const description =
    typeof lore_and_flavor === 'string' && lore_and_flavor.trim()
      ? `${mechanics_first.join('\n\n')}\n\n${lore_and_flavor.trim()}`
      : mechanics_first.join('\n\n')

  return {
    id: `${packId}:${slugify(name)}`,
    name,
    category: typeof category === 'string' && category.trim() ? category.trim() : undefined,
    description,
    pack: packId,
    source: { book: source },
  }
}

// Converts a whole vault-shaped `{ rules_hazards_conditions: [...] }`
// document into HazardEntry[].
function parseHazardsImport(vaultDoc, packId = DEFAULT_PACK) {
  if (!vaultDoc || !Array.isArray(vaultDoc.rules_hazards_conditions)) {
    throw new Error('Expected a document shaped { rules_hazards_conditions: [...] }')
  }
  if (typeof packId !== 'string' || !packId.trim()) {
    throw new Error('packId is required and must be a non-empty string')
  }
  const hazards = vaultDoc.rules_hazards_conditions.map((h) => parseHazardEntry(h, packId))

  const seenById = new Map()
  for (const hazard of hazards) {
    const prior = seenById.get(hazard.id)
    if (prior) {
      throw new Error(`Duplicate hazard/condition id "${hazard.id}" from "${prior.name}" and "${hazard.name}" — names must be unique after slugification`)
    }
    seenById.set(hazard.id, hazard)
  }

  return hazards
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
    console.error('Usage: node parse-hazards-import.js --input <vault-hazards.json> --output <out.json> [--pack-id <id>]')
    process.exit(1)
  }

  const vaultDoc = JSON.parse(fs.readFileSync(path.resolve(inputPath), 'utf8'))
  const hazards = parseHazardsImport(vaultDoc, packId)

  fs.writeFileSync(outputPath, JSON.stringify(hazards, null, 2))
  console.log(`Parsed ${hazards.length} hazards/conditions from ${inputPath}`)
  console.log(`Wrote ${outputPath}`)
}

if (require.main === module) {
  main()
}

module.exports = { parseHazardsImport, parseHazardEntry, slugify, DEFAULT_PACK }
