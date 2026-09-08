// Converts a vault-shaped feats JSON file (shape:
//   { feats: [{ name, category, source, prerequisite, mechanics, lore }] })
// into FeatEntry[] per the frozen schema (schema.ts). This is the Phase-1
// importer for the PHB-2024 feats pack (M2b, #13) — separate from
// parse-feats.js, which parses the *bundled* SRD-only feats.md.
//
// The real vault file lives outside this repo and is never committed; pass
// its path via --input. See docs/planning/m2b-phase1-feats-plan.md §5 for
// the decisions this script encodes.
'use strict'
const fs = require('fs')
const path = require('path')

const PACK = 'phb-2024'

// Every category the vault is known to use, mapped 1:1 onto FeatEntry's
// category union (data/schema.ts). This is a validation allowlist, not a
// rename map — the vault's category strings already match these verbatim.
// 'General / Racial' was added to the union specifically for this import
// (approved schema change, see plan doc §5).
const VALID_CATEGORIES = ['Origin', 'General', 'General / Racial', 'Fighting Style', 'Epic Boon']

// Feats known, by name, to actually be repeatable per the real 2024 rules.
// The vault has no `repeatable` field at all (confirmed: zero of 58 feats
// carry one), so this is a deliberately curated default rather than
// something derived from the source data. Everything not on this list
// defaults to `repeatable: false`. Extend this list only when a specific
// feat's rules text is confirmed to allow retaking it.
const REPEATABLE_ALLOWLIST = new Set(['Magic Initiate'])

function slugify(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
}

// Converts one vault feat object into a FeatEntry. Throws on the first
// problem found, naming the offending feat, per the "reject the whole
// pack, name the offender" convention (plan doc §3.1).
function parseFeatEntry(vaultFeat) {
  const { name, category, source, prerequisite, mechanics } = vaultFeat

  if (!name || typeof name !== 'string') {
    throw new Error(`Feat entry missing a valid "name": ${JSON.stringify(vaultFeat)}`)
  }
  if (!VALID_CATEGORIES.includes(category)) {
    throw new Error(
      `Feat "${name}" has an unrecognized category "${category}" — expected one of: ${VALID_CATEGORIES.join(', ')}`
    )
  }
  if (typeof mechanics !== 'string' || !mechanics.trim()) {
    throw new Error(`Feat "${name}" has no "mechanics" text to use as its benefit`)
  }
  if (!source || typeof source !== 'string') {
    throw new Error(`Feat "${name}" is missing a "source" string`)
  }

  // The vault marks "no prerequisite" with the literal string "None" —
  // that must not surface as the literal word "None" in the UI, so it
  // maps to `undefined` (the field is optional on FeatEntry). Every other
  // value passes through unchanged.
  const normalizedPrerequisite = prerequisite === 'None' ? undefined : prerequisite

  return {
    id: `${PACK}:${slugify(name)}`,
    name,
    category,
    prerequisite: normalizedPrerequisite,
    repeatable: REPEATABLE_ALLOWLIST.has(name),
    benefit: mechanics,
    pack: PACK,
    source: { book: source },
  }
}

// Converts a whole vault-shaped `{ feats: [...] }` document into FeatEntry[].
function parseFeatsImport(vaultDoc) {
  if (!vaultDoc || !Array.isArray(vaultDoc.feats)) {
    throw new Error('Expected a document shaped { feats: [...] }')
  }
  const feats = vaultDoc.feats.map(parseFeatEntry)

  // Reject the whole pack, naming both offenders, rather than silently
  // dropping or overwriting a collision (matches the "reject the whole
  // pack, name the offender" convention this parser follows throughout).
  const seenById = new Map()
  for (const feat of feats) {
    const prior = seenById.get(feat.id)
    if (prior) {
      throw new Error(`Duplicate feat id "${feat.id}" from "${prior.name}" and "${feat.name}" — names must be unique after slugification`)
    }
    seenById.set(feat.id, feat)
  }

  return feats
}

function main() {
  const args = process.argv.slice(2)
  const getArg = (flag) => {
    const i = args.indexOf(flag)
    return i !== -1 ? args[i + 1] : undefined
  }

  const inputPath = getArg('--input')
  const outputPath = getArg('--output')
  // Both flags required, no default output path: this is PHB-2024 (non-SRD)
  // content, which must never land in data/ (the shipped SRD-only dataset)
  // by accident. See CLAUDE.md's SRD-only bundling constraint.
  if (!inputPath || !outputPath) {
    console.error('Usage: node parse-feats-import.js --input <vault-feats.json> --output <out.json>')
    process.exit(1)
  }

  const vaultDoc = JSON.parse(fs.readFileSync(path.resolve(inputPath), 'utf8'))
  const feats = parseFeatsImport(vaultDoc)

  fs.writeFileSync(outputPath, JSON.stringify(feats, null, 2))
  console.log(`Parsed ${feats.length} feats from ${inputPath}`)
  console.log(`Wrote ${outputPath}`)
}

if (require.main === module) {
  main()
}

module.exports = { parseFeatsImport, parseFeatEntry, slugify, VALID_CATEGORIES, REPEATABLE_ALLOWLIST, PACK }
