// Converts a vault-shaped magic items JSON file (shape:
//   { items: [{ name, source, category, rarity, attunement, mechanics_first, lore_and_flavor }] })
// into MagicItemEntry[] per the frozen schema (schema.ts). #22: display-only
// reference content — the app has no inventory/equipment-slot system for a
// character to actually own an item, so this is a glossary entry, not a
// mechanical grant (see schema.ts's MagicItemEntry doc comment). Same
// mechanics_first + lore_and_flavor description assembly as
// parse-hazards-import.js, plus the vault's own `rarity`/`attunement`
// fields passed through as free text (no validation against a fixed rarity
// enum — the SRD's rarity tiers aren't modeled anywhere else in this app,
// and the vault's own values are already human-readable, e.g. "Varies
// (Slumbering to Ascendant)").
//
// The real vault file lives outside this repo and is never committed; pass
// its path via --input.
'use strict'
const fs = require('fs')
const path = require('path')

const DEFAULT_PACK = 'expansion-magic-items'

function slugify(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
}

// Converts one vault magic item object into a MagicItemEntry. Throws on the
// first problem found, naming the offending entry, matching every other
// M2b importer's "reject the whole pack, name the offender" convention.
function parseMagicItemEntry(vaultEntry, packId) {
  const { name, source, category, rarity, attunement, mechanics_first, lore_and_flavor } = vaultEntry

  if (!name || typeof name !== 'string') {
    throw new Error(`Magic item entry missing a valid "name": ${JSON.stringify(vaultEntry)}`)
  }
  if (!source || typeof source !== 'string') {
    throw new Error(`Magic item "${name}" is missing a "source" string`)
  }
  if (!Array.isArray(mechanics_first) || mechanics_first.length === 0) {
    throw new Error(`Magic item "${name}" has no "mechanics_first" bullets to build a description from`)
  }

  const description =
    typeof lore_and_flavor === 'string' && lore_and_flavor.trim()
      ? `${mechanics_first.join('\n\n')}\n\n${lore_and_flavor.trim()}`
      : mechanics_first.join('\n\n')

  return {
    id: `${packId}:${slugify(name)}`,
    name,
    category: typeof category === 'string' && category.trim() ? category.trim() : undefined,
    rarity: typeof rarity === 'string' && rarity.trim() ? rarity.trim() : undefined,
    attunement: typeof attunement === 'string' && attunement.trim() ? attunement.trim() : undefined,
    description,
    pack: packId,
    source: { book: source },
  }
}

// Converts a whole vault-shaped `{ items: [...] }` document into
// MagicItemEntry[].
function parseMagicItemsImport(vaultDoc, packId = DEFAULT_PACK) {
  if (!vaultDoc || !Array.isArray(vaultDoc.items)) {
    throw new Error('Expected a document shaped { items: [...] }')
  }
  if (typeof packId !== 'string' || !packId.trim()) {
    throw new Error('packId is required and must be a non-empty string')
  }
  const items = vaultDoc.items.map((i) => parseMagicItemEntry(i, packId))

  const seenById = new Map()
  for (const item of items) {
    const prior = seenById.get(item.id)
    if (prior) {
      throw new Error(`Duplicate magic item id "${item.id}" from "${prior.name}" and "${item.name}" — names must be unique after slugification`)
    }
    seenById.set(item.id, item)
  }

  return items
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
    console.error('Usage: node parse-magic-items-import.js --input <vault-items.json> --output <out.json> [--pack-id <id>]')
    process.exit(1)
  }

  const vaultDoc = JSON.parse(fs.readFileSync(path.resolve(inputPath), 'utf8'))
  const items = parseMagicItemsImport(vaultDoc, packId)

  fs.writeFileSync(outputPath, JSON.stringify(items, null, 2))
  console.log(`Parsed ${items.length} magic items from ${inputPath}`)
  console.log(`Wrote ${outputPath}`)
}

if (require.main === module) {
  main()
}

module.exports = { parseMagicItemsImport, parseMagicItemEntry, slugify, DEFAULT_PACK }
