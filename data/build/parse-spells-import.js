// Converts a vault-shaped spell-book JSON file (shape:
//   { title, source, category, spells: [{ name, level, casting_time, range,
//     components, duration, concentration, ritual, classes, mechanics_first,
//     lore_and_flavor }] })
// into SpellEntry[] per the frozen schema (schema.ts). This is the #33
// importer for expansion-book spell packs (Tasha's Cauldron, Fizban's
// Treasury, Acquisitions Incorporated, Arcana Unleashed, Book of Many
// Things) — separate from parse-spells.js, which parses the *bundled*
// SRD-only spells.md. Each book imports as its OWN pack (confirmed with
// Truman, docs/planning/issue-33-plan.md) — the caller passes a distinct
// --pack-id per book, not a single shared pack.
//
// The real vault files live outside this repo and are never committed;
// pass one's path via --input. See docs/planning/issue-33-plan.md for the
// decisions this script encodes (concentration/ritual as real schema
// fields, description assembly from mechanics_first + lore_and_flavor,
// higherLevels extraction).
'use strict'
const fs = require('fs')
const path = require('path')

const DEFAULT_PACK = 'expansion-spells'

function slugify(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
}

// The vault's `level` field combines level + school into one free-text
// string in one of two shapes: "2nd-Level Enchantment" / "9th-Level
// Evocation" (leveled) or "Evocation Cantrip (0 Level)" (cantrip — the only
// form the 5 real vault files actually use is with the "(0 Level)" suffix;
// the bare "Necromancy Cantrip" form (no suffix) is matched defensively,
// not because it's been observed). Returns null (not a throw) so the caller
// can name the offending spell in its own error message.
function parseLevelAndSchool(levelStr) {
  if (typeof levelStr !== 'string') return null
  const cantripMatch = levelStr.match(/^([A-Za-z]+) Cantrip(?:\s*\(0 Level\))?$/)
  if (cantripMatch) return { level: 0, school: cantripMatch[1] }
  const leveledMatch = levelStr.match(/^(\d+)(?:st|nd|rd|th)-Level\s+([A-Za-z]+)$/)
  if (leveledMatch) return { level: parseInt(leveledMatch[1], 10), school: leveledMatch[2] }
  return null
}

function parseYesNo(value, fieldName, spellName) {
  if (value === 'Yes') return true
  if (value === 'No') return false
  throw new Error(`Spell "${spellName}" has an unrecognized "${fieldName}" value: "${value}" (expected "Yes" or "No")`)
}

// The vault has no single `description` field — instead an ordered
// `mechanics_first` array of markdown-bold bullet strings, one of which
// MAY be the "At Higher Levels" scaling note (labeled "**At Higher
// Levels:**" in every vault file checked). Pulls that bullet out into the
// schema's own `higherLevels` field (matching where the bundled SRD parser
// puts the equivalent text) rather than leaving it mixed into the general
// description — everything else joins into `description`, markdown intact
// (the app already renders it via `renderEmphasis` wherever spell
// descriptions are shown).
function splitHigherLevels(mechanicsFirst) {
  const hlIndex = mechanicsFirst.findIndex((bullet) => /^\*\*At Higher Levels:\*\*/i.test(bullet))
  if (hlIndex === -1) return { mechanics: mechanicsFirst, higherLevels: undefined }
  const higherLevels = mechanicsFirst[hlIndex].replace(/^\*\*At Higher Levels:\*\*\s*/i, '').trim()
  const mechanics = [...mechanicsFirst.slice(0, hlIndex), ...mechanicsFirst.slice(hlIndex + 1)]
  return { mechanics, higherLevels }
}

// Converts one vault spell object into a SpellEntry. Throws on the first
// problem found, naming the offending spell, matching the other #M2b
// importers' "reject the whole pack, name the offender" convention.
function parseSpellEntry(vaultSpell, packId, book) {
  const { name, level, casting_time, range, components, duration, concentration, ritual, classes, mechanics_first, lore_and_flavor } =
    vaultSpell

  if (!name || typeof name !== 'string') {
    throw new Error(`Spell entry missing a valid "name": ${JSON.stringify(vaultSpell)}`)
  }
  const parsedLevel = parseLevelAndSchool(level)
  if (!parsedLevel) {
    throw new Error(`Spell "${name}" has an unparseable "level" string: "${level}"`)
  }
  if (!casting_time || typeof casting_time !== 'string') {
    throw new Error(`Spell "${name}" is missing "casting_time"`)
  }
  if (!range || typeof range !== 'string') {
    throw new Error(`Spell "${name}" is missing "range"`)
  }
  if (!components || typeof components !== 'string') {
    throw new Error(`Spell "${name}" is missing "components"`)
  }
  if (!duration || typeof duration !== 'string') {
    throw new Error(`Spell "${name}" is missing "duration"`)
  }
  if (!Array.isArray(classes) || classes.length === 0) {
    throw new Error(`Spell "${name}" has no "classes" array`)
  }
  if (!Array.isArray(mechanics_first) || mechanics_first.length === 0) {
    throw new Error(`Spell "${name}" has no "mechanics_first" bullets to build a description from`)
  }

  const { mechanics, higherLevels } = splitHigherLevels(mechanics_first)
  const description =
    typeof lore_and_flavor === 'string' && lore_and_flavor.trim()
      ? `${mechanics.join('\n\n')}\n\n${lore_and_flavor.trim()}`
      : mechanics.join('\n\n')

  return {
    id: `${packId}:${slugify(name)}`,
    name,
    level: parsedLevel.level,
    school: parsedLevel.school,
    castingTime: casting_time,
    range,
    components,
    duration,
    classes,
    description,
    higherLevels,
    concentration: parseYesNo(concentration, 'concentration', name),
    ritual: parseYesNo(ritual, 'ritual', name),
    pack: packId,
    source: { book },
  }
}

// Converts a whole vault-shaped `{ title, source, spells: [...] }` document
// into SpellEntry[]. `book` for the resulting SourceRef comes from the
// document's own `source` field (falling back to `title`) — every vault
// spell file checked carries one or the other.
function parseSpellsImport(vaultDoc, packId = DEFAULT_PACK) {
  if (!vaultDoc || !Array.isArray(vaultDoc.spells)) {
    throw new Error('Expected a document shaped { spells: [...] }')
  }
  if (typeof packId !== 'string' || !packId.trim()) {
    throw new Error('packId is required and must be a non-empty string')
  }
  // Strip a trailing ".md" — the vault's own `source` field is a filename
  // (e.g. "Tasha's Cauldron of Everything.md"), but every other SourceRef
  // in this app is a plain book title ("SRD 5.2.1").
  const book = (vaultDoc.source || vaultDoc.title || 'Unknown').replace(/\.md$/i, '')
  const spells = vaultDoc.spells.map((s) => parseSpellEntry(s, packId, book))

  const seenById = new Map()
  for (const spell of spells) {
    const prior = seenById.get(spell.id)
    if (prior) {
      throw new Error(`Duplicate spell id "${spell.id}" from "${prior.name}" and "${spell.name}" — names must be unique after slugification`)
    }
    seenById.set(spell.id, spell)
  }

  return spells
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
    console.error('Usage: node parse-spells-import.js --input <vault-spells.json> --output <out.json> [--pack-id <id>]')
    process.exit(1)
  }

  const vaultDoc = JSON.parse(fs.readFileSync(path.resolve(inputPath), 'utf8'))
  const spells = parseSpellsImport(vaultDoc, packId)

  fs.writeFileSync(outputPath, JSON.stringify(spells, null, 2))
  console.log(`Parsed ${spells.length} spells from ${inputPath}`)
  console.log(`Wrote ${outputPath}`)
}

if (require.main === module) {
  main()
}

module.exports = { parseSpellsImport, parseSpellEntry, parseLevelAndSchool, slugify, DEFAULT_PACK }
