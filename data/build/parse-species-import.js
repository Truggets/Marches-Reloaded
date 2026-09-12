// Converts a vault-shaped species JSON file (shape:
//   { species: [{ name, source, category, mechanics_first: string[], lore_and_flavor }] })
// into SpeciesEntry[] per the frozen schema (schema.ts). This is the Phase-3
// importer for the PHB-2024 (and other non-SRD) species pack (M2b), a sibling
// of parse-backgrounds-import.js — separate from parse-species.js (if/when it
// exists), which parses the *bundled* SRD-only species data.
//
// The real vault file lives outside this repo and is never committed; pass
// its path via --input. See docs/planning/m2b-phase3-4-species-equipment-plan.md
// for the decisions this script encodes.
//
// Unlike backgrounds' `mechanics` (one blob with 5 labeled sections sliced
// out of it), species' `mechanics_first` is already an ARRAY where each item
// is its own whole `"**Label:** rest"` string — no slicing needed, just a
// per-item regex match. Three specific labels (Creature Type/Size/Speed)
// become top-level SpeciesEntry fields; every other labeled item becomes a
// SpeciesTrait. Critically, trait descriptions KEEP their markdown verbatim
// (the opposite of parse-backgrounds-import.js's stripBold) because
// CharacterSheetPage.tsx renders trait.description through a renderEmphasis
// component that expects real `**bold**`/`*italic*` markers.
'use strict'
const fs = require('fs')
const path = require('path')

// Default pack id for the CLI (--pack-id overrides it) and for direct calls
// to parseSpeciesImport/parseSpeciesEntry that don't pass one — kept only as
// a fallback. The real per-import pack id comes from the caller: the admin
// import endpoint (server/src/routes/admin.js) passes whatever the admin
// typed into "Pack ID" on AdminPackImportPage, so two different imports
// don't collide under the same hardcoded id.
const DEFAULT_PACK = 'phb-2024'

// The three mechanics_first labels that map to top-level SpeciesEntry fields
// instead of becoming a SpeciesTrait.
const TOP_LEVEL_LABELS = {
  'Creature Type': 'creatureType',
  Size: 'size',
  Speed: 'speed',
}

// Case-insensitive lookup for TOP_LEVEL_LABELS, same defensive reasoning as
// VERSATILE_TRAIT_RENAME_CI: a differently-cased label (e.g. "Creature
// type") must still be recognized as the top-level field it is, not
// silently fall through and become a bogus SpeciesTrait while the real
// field is left missing with no error.
const TOP_LEVEL_LABELS_CI = new Map(
  Object.entries(TOP_LEVEL_LABELS).map(([k, v]) => [k.toLowerCase(), { canonical: k, field: v }]),
)

// The vault titles Human's two "Versatile Traits" items differently than the
// SRD-official names the wizard checks for. CreateCharacterPage.tsx does
// `t.name === 'Skillful'` / `t.name === 'Versatile'` — an unrenamed vault
// trait would silently fail those checks. Any OTHER "Versatile Traits - X"
// variant that isn't one of these two exact strings is unrecognized and must
// throw rather than pass through unrenamed (same "throw on wrong-but-non-
// empty" discipline as Phase 2's skill-name validation).
const VERSATILE_TRAIT_RENAME = {
  'Versatile Traits - Skilled': 'Skillful',
  'Versatile Traits - Origin Feat': 'Versatile',
}

// Case-insensitive lookup for VERSATILE_TRAIT_RENAME — a differently-cased
// vault label (e.g. "Versatile traits - Skilled") must still be recognized
// and renamed/throw, not silently fall through the exact-match check below
// and get stored under its own unrecognized name (the same silent-failure
// shape this whole rename map exists to prevent).
const VERSATILE_TRAIT_RENAME_CI = new Map(
  Object.entries(VERSATILE_TRAIT_RENAME).map(([k, v]) => [k.toLowerCase(), v]),
)

function slugify(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
}

// Matches one `mechanics_first` array item's `"**Label:** rest"` shape.
// `rest` may itself contain further `**bold**`/`*italic*` markdown and even
// embedded newlines (e.g. Elf's Elven Lineage sub-choice list) — captured
// greedily to end-of-string since each array item is already one whole unit
// (unlike backgrounds' findField, which has to stop at the next label inside
// a shared blob).
const LABEL_RE = /^\*\*(.+?):\*\*\s*([\s\S]*)$/

// Strips "**" markers only — used solely for the three short top-level
// fields (creatureType/size/speed), which map to plain schema strings, not
// renderEmphasis-rendered trait descriptions. Trait descriptions must NOT go
// through this (see module docstring).
function stripBold(text) {
  return text.replace(/\*\*/g, '').trim()
}

// Sentence-lead-in prefixes the vault always wraps these three short values
// in ("You are a **Humanoid**.", "Your size is **Medium**...", "Your walking
// speed is **30 feet**.") that the bundled dataset's own clean values
// (data/species.json: creatureType "Humanoid", size "Medium (about 4-7 feet
// tall)...", speed "30 feet") don't carry. Stripped so imported species match
// that same plain-value shape rather than a whole sentence.
const TOP_LEVEL_PREFIXES = {
  'Creature Type': /^You are an? /i,
  Size: /^Your size is /i,
  Speed: /^Your walking speed is /i,
}

// Reduces a Creature Type/Size/Speed item's already-debolded rest text down
// to the plain value the schema wants: drop any trailing procedural sentence
// (e.g. Human's "You choose the size when you select this species."), strip
// the lead-in prefix, and drop the trailing period. Keeps a trailing
// parenthetical qualifier intact (e.g. "Medium (typically 4 to 5 feet tall,
// with a heavy, stout build)") since that's part of the value, not a
// separate sentence.
function extractTopLevelValue(rest, label, speciesName) {
  let text = stripBold(rest)
  const firstSentence = text.match(/^(.*?)\.(?:\s|$)/)
  text = firstSentence ? firstSentence[1] : text.replace(/\.$/, '')
  const prefix = TOP_LEVEL_PREFIXES[label]
  if (prefix) {
    if (!prefix.test(text)) {
      throw new Error(
        `Species "${speciesName}" has a "${label}" value that doesn't start with the expected lead-in phrase (${prefix}): "${rest}" — check for new real-data phrasing rather than silently leaving the sentence lead-in in the stored value.`
      )
    }
    text = text.replace(prefix, '')
  }
  return text.trim()
}

// Converts one vault species object into a SpeciesEntry. Throws on the first
// problem found, naming the offending species (and, where applicable, the
// specific mechanics_first item), per the "reject the whole pack, name the
// offender" convention (matches parse-backgrounds-import.js).
function parseSpeciesEntry(vaultSpecies, packId = DEFAULT_PACK) {
  const { name, source, mechanics_first: mechanicsFirst } = vaultSpecies

  if (!name || typeof name !== 'string') {
    throw new Error(`Species entry missing a valid "name": ${JSON.stringify(vaultSpecies)}`)
  }
  if (!source || typeof source !== 'string') {
    throw new Error(`Species "${name}" is missing a "source" string`)
  }
  if (!Array.isArray(mechanicsFirst) || mechanicsFirst.length === 0) {
    throw new Error(`Species "${name}" has no "mechanics_first" array to parse`)
  }

  const topLevel = {}
  const traits = []

  for (const item of mechanicsFirst) {
    if (typeof item !== 'string' || !item.trim()) {
      throw new Error(`Species "${name}" has a blank/non-string "mechanics_first" item: ${JSON.stringify(item)}`)
    }
    const match = item.match(LABEL_RE)
    if (!match) {
      throw new Error(
        `Species "${name}" has a "mechanics_first" item that doesn't match the expected "**Label:** rest" shape: "${item}"`
      )
    }
    const label = match[1].trim()
    const rest = match[2].trim()

    const topLevelMatch = TOP_LEVEL_LABELS_CI.get(label.toLowerCase())
    if (topLevelMatch) {
      topLevel[topLevelMatch.field] = extractTopLevelValue(rest, topLevelMatch.canonical, name)
      continue
    }

    let traitName = label
    if (/^versatile traits/i.test(label)) {
      const renamed = VERSATILE_TRAIT_RENAME_CI.get(label.toLowerCase())
      if (!renamed) {
        throw new Error(
          `Species "${name}" has an unrecognized "Versatile Traits" trait name "${label}" — expected one of: ${Object.keys(VERSATILE_TRAIT_RENAME).join(', ')}`
        )
      }
      traitName = renamed
    }

    // Description keeps its markdown verbatim — do NOT stripBold here.
    traits.push({ name: traitName, description: rest })
  }

  const missingTopLevel = Object.entries(TOP_LEVEL_LABELS)
    .filter(([, field]) => topLevel[field] === undefined)
    .map(([label]) => label)
  if (missingTopLevel.length > 0) {
    throw new Error(
      `Species "${name}" is missing required top-level field(s): ${missingTopLevel.join(', ')} — check its "mechanics_first" labels match one of ${Object.keys(TOP_LEVEL_LABELS).join(', ')} (case-insensitive).`
    )
  }

  return {
    id: `${packId}:${slugify(name)}`,
    name,
    ...(topLevel.creatureType !== undefined ? { creatureType: topLevel.creatureType } : {}),
    ...(topLevel.size !== undefined ? { size: topLevel.size } : {}),
    ...(topLevel.speed !== undefined ? { speed: topLevel.speed } : {}),
    traits,
    pack: packId,
    source: { book: source },
  }
}

// Converts a whole vault-shaped `{ species: [...] }` document into
// SpeciesEntry[].
function parseSpeciesImport(vaultDoc, packId = DEFAULT_PACK) {
  if (!vaultDoc || !Array.isArray(vaultDoc.species)) {
    throw new Error('Expected a document shaped { species: [...] }')
  }
  if (typeof packId !== 'string' || !packId.trim()) {
    throw new Error('packId is required and must be a non-empty string')
  }
  const species = vaultDoc.species.map((s) => parseSpeciesEntry(s, packId))

  // Reject the whole pack, naming both offenders, rather than silently
  // dropping or overwriting a collision (matches the "reject the whole
  // pack, name the offender" convention this parser follows throughout).
  const seenById = new Map()
  for (const entry of species) {
    const prior = seenById.get(entry.id)
    if (prior) {
      throw new Error(
        `Duplicate species id "${entry.id}" from "${prior.name}" and "${entry.name}" — names must be unique after slugification`
      )
    }
    seenById.set(entry.id, entry)
  }

  return species
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
  // Both flags required, no default output path: this is PHB-2024 (non-SRD)
  // content, which must never land in data/ (the shipped SRD-only dataset)
  // by accident. See CLAUDE.md's SRD-only bundling constraint.
  if (!inputPath || !outputPath) {
    console.error('Usage: node parse-species-import.js --input <vault-species.json> --output <out.json> [--pack-id <id>]')
    process.exit(1)
  }

  const vaultDoc = JSON.parse(fs.readFileSync(path.resolve(inputPath), 'utf8'))
  const species = parseSpeciesImport(vaultDoc, packId)

  fs.writeFileSync(outputPath, JSON.stringify(species, null, 2))
  console.log(`Parsed ${species.length} species from ${inputPath}`)
  console.log(`Wrote ${outputPath}`)
}

if (require.main === module) {
  main()
}

module.exports = {
  parseSpeciesImport,
  parseSpeciesEntry,
  stripBold,
  extractTopLevelValue,
  slugify,
  TOP_LEVEL_LABELS,
  VERSATILE_TRAIT_RENAME,
  DEFAULT_PACK,
}
