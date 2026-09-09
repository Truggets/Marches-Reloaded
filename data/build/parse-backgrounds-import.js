// Converts a vault-shaped backgrounds JSON file (shape:
//   { backgrounds: [{ name, source, category, mechanics, flavor_text, citations }] })
// into BackgroundEntry[] per the frozen schema (schema.ts). This is the
// Phase-2 importer for the PHB-2024 (and other non-SRD) backgrounds pack
// (M2b), a sibling of parse-feats-import.js — separate from
// parse-backgrounds.js, which parses the *bundled* SRD-only backgrounds.md.
//
// The real vault file lives outside this repo and is never committed; pass
// its path via --input. See docs/planning/m2b-phase2-backgrounds-plan.md for
// the decisions this script encodes.
//
// Unlike feats' `benefit` (used verbatim), BackgroundEntry wants structured
// fields (abilityScores, feat, skillProficiencies as arrays; toolProficiency
// and equipment as free-text sentences), but the vault's `mechanics` field is
// one blob where each `**Label:**` section is a whole descriptive sentence,
// not a clean value. This script does a two-pass extraction: pass 1 slices
// out each of the 5 labeled sections as a whole block (mirrors the existing
// SRD parser's `findField(blockText, label)` shape/name, data/build/parse-
// backgrounds.js); pass 2 pulls the actual short value out of 3 of those 5
// sections (abilityScores, skillProficiencies, feat) via bolded-text
// extraction, since toolProficiency/equipment are kept as the whole
// extracted sentence verbatim (the schema already treats both as free text).
'use strict'
const fs = require('fs')
const path = require('path')

// Default pack id for the CLI (--pack-id overrides it) and for direct calls
// to parseBackgroundsImport/parseBackgroundEntry that don't pass one — kept
// only as a fallback. The real per-import pack id comes from the caller: the
// admin import endpoint (server/src/routes/admin.js) passes whatever the
// admin typed into "Pack ID" on AdminPackImportPage, so two different
// imports don't collide under the same hardcoded id.
const DEFAULT_PACK = 'phb-2024'

// The 5 labeled sections every vault background's `mechanics` blob is
// expected to contain, in the order the real data uses them. A background
// missing any one of these throws (see parseBackgroundEntry) rather than
// silently emitting an entry with holes in it.
const REQUIRED_LABELS = ['Ability Scores', 'Skill Proficiencies', 'Tool Proficiency', 'Origin Feat', 'Starting Equipment']

// The 18 SRD/2024 skill names, duplicated here from
// client/src/character-wizard/types.ts's ALL_SKILLS (a TS/ESM client module
// this CJS build script can't easily consume — same reasoning as
// SPELL_GRANTING_FEATS in parse-feats-import.js). Used to validate
// parseSkillProficiencies's extracted spans are actually skill names, not an
// incidental bolded phrase elsewhere in the sentence. If ALL_SKILLS changes,
// update this too.
const VALID_SKILLS = new Set([
  'Acrobatics', 'Animal Handling', 'Arcana', 'Athletics', 'Deception',
  'History', 'Insight', 'Intimidation', 'Investigation', 'Medicine',
  'Nature', 'Perception', 'Performance', 'Persuasion', 'Religion',
  'Sleight of Hand', 'Stealth', 'Survival',
])

function slugify(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
}

// Pass 1: slices a `**Label:** value` section out of a `mechanics` blob as a
// whole (possibly multi-sentence) block, stopping right before the next
// bolded label or the end of the string. Same shape/name as the existing SRD
// parser's helper (data/build/parse-backgrounds.js), reused deliberately
// rather than reinvented.
function findField(blockText, label) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const re = new RegExp('\\*\\*' + escaped + ':\\*\\*\\s*([\\s\\S]*?)(?=\\n\\*\\*[A-Z]|$)')
  const match = blockText.match(re)
  return match ? match[1].trim() : null
}

// Returns every `**bolded**` span's inner text within a block, in order.
function extractBoldSpans(blockText) {
  const spans = []
  const re = /\*\*([^*]+)\*\*/g
  let match
  while ((match = re.exec(blockText))) {
    spans.push(match[1].trim())
  }
  return spans
}

// Pass 2a: pulls the ability-score names out of the "chosen from **X, Y, and
// Z**" (or two-name "**X and Y**") sentence inside the Ability Scores block.
// Real vault data (42/42 checked) always bolds the list as a single span;
// this splits that span on commas and "and" so it handles both a 2-name and
// a 3-name list, per the plan doc's explicit caveat that the count varies.
function parseAbilityScores(blockText, backgroundName) {
  const spans = extractBoldSpans(blockText)
  if (spans.length !== 1) {
    throw new Error(
      `Background "${backgroundName}" has an "Ability Scores" section that doesn't contain exactly one bolded ability-score list (found ${spans.length}): "${blockText}"`
    )
  }
  const names = spans[0]
    .split(/,\s*(?:and\s+)?|\s+and\s+/)
    .map((s) => s.trim())
    .filter(Boolean)
  if (names.length < 2 || names.length > 3) {
    throw new Error(
      `Background "${backgroundName}" has an "Ability Scores" section whose bolded list didn't parse into 2 or 3 ability names (got ${JSON.stringify(names)}) from: "${blockText}"`
    )
  }
  return names
}

// Pass 2b: pulls the skill names out of the "proficiency in the **A** and
// **B** skills" sentence inside the Skill Proficiencies block. Real vault
// data (42/42 checked) always bolds each skill name as its own span, so this
// just collects every bolded span in the block — handles both a 1-skill and
// a 2-skill phrasing, per the plan doc's explicit caveat.
function parseSkillProficiencies(blockText, backgroundName) {
  const skills = extractBoldSpans(blockText)
  if (skills.length === 0) {
    throw new Error(
      `Background "${backgroundName}" has a "Skill Proficiencies" section with no bolded skill name(s): "${blockText}"`
    )
  }
  const bogus = skills.filter((s) => !VALID_SKILLS.has(s))
  if (bogus.length > 0) {
    throw new Error(
      `Background "${backgroundName}" has a "Skill Proficiencies" section with a bolded span that isn't a recognized skill name (${JSON.stringify(bogus)}): "${blockText}"`
    )
  }
  return skills
}

// Strips the "**...**" bold markers left over from pass-1 extraction. Used
// only for toolProficiency/equipment, which (unlike abilityScores/feat/
// skillProficiencies) are kept as the whole extracted sentence rather than a
// pulled-out short value — but BackgroundEntry's schema (and the bundled SRD
// pack's own parser, parse-backgrounds.js) treat both as clean free text with
// no markdown, so the raw "**Foo**" from the vault source must not leak
// through unstripped (it would render as literal asterisks in the UI, e.g.
// CharacterSheetPage.tsx's <span>{backgroundEntry.toolProficiency}</span>).
function stripBold(text) {
  return text.replace(/\*\*/g, '')
}

// Pass 2c: pulls the feat name (with optional parenthetical, e.g. "Magic
// Initiate (Cleric)") out of the "gain the **X** feat" sentence inside the
// Origin Feat block. Matches the display shape already used by the bundled
// SRD pack's Sage entry ("Magic Initiate (Wizard)").
function parseFeatName(blockText, backgroundName) {
  const match = blockText.match(/gain the \*\*([^*]+)\*\*\s*feat/)
  if (!match) {
    throw new Error(
      `Background "${backgroundName}" has an "Origin Feat" section that doesn't match the expected "gain the **Feat Name** feat" phrasing: "${blockText}"`
    )
  }
  return match[1].trim()
}

// Converts one vault background object into a BackgroundEntry. Throws on the
// first problem found, naming the offending background (and, where
// applicable, the specific label), per the "reject the whole pack, name the
// offender" convention (matches parse-feats-import.js).
function parseBackgroundEntry(vaultBackground, packId = DEFAULT_PACK) {
  const { name, source, mechanics } = vaultBackground

  if (!name || typeof name !== 'string') {
    throw new Error(`Background entry missing a valid "name": ${JSON.stringify(vaultBackground)}`)
  }
  if (!source || typeof source !== 'string') {
    throw new Error(`Background "${name}" is missing a "source" string`)
  }
  if (typeof mechanics !== 'string' || !mechanics.trim()) {
    throw new Error(`Background "${name}" has no "mechanics" text to parse`)
  }

  const blocks = {}
  for (const label of REQUIRED_LABELS) {
    const block = findField(mechanics, label)
    if (!block) {
      throw new Error(`Background "${name}" is missing the required "${label}" section in its "mechanics" text`)
    }
    blocks[label] = block
  }

  return {
    id: `${packId}:${slugify(name)}`,
    name,
    abilityScores: parseAbilityScores(blocks['Ability Scores'], name),
    feat: parseFeatName(blocks['Origin Feat'], name),
    skillProficiencies: parseSkillProficiencies(blocks['Skill Proficiencies'], name),
    toolProficiency: stripBold(blocks['Tool Proficiency']),
    equipment: stripBold(blocks['Starting Equipment']),
    pack: packId,
    source: { book: source },
  }
}

// Converts a whole vault-shaped `{ backgrounds: [...] }` document into
// BackgroundEntry[].
function parseBackgroundsImport(vaultDoc, packId = DEFAULT_PACK) {
  if (!vaultDoc || !Array.isArray(vaultDoc.backgrounds)) {
    throw new Error('Expected a document shaped { backgrounds: [...] }')
  }
  if (typeof packId !== 'string' || !packId.trim()) {
    throw new Error('packId is required and must be a non-empty string')
  }
  const backgrounds = vaultDoc.backgrounds.map((b) => parseBackgroundEntry(b, packId))

  // Reject the whole pack, naming both offenders, rather than silently
  // dropping or overwriting a collision (matches the "reject the whole
  // pack, name the offender" convention this parser follows throughout).
  const seenById = new Map()
  for (const background of backgrounds) {
    const prior = seenById.get(background.id)
    if (prior) {
      throw new Error(
        `Duplicate background id "${background.id}" from "${prior.name}" and "${background.name}" — names must be unique after slugification`
      )
    }
    seenById.set(background.id, background)
  }

  return backgrounds
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
    console.error('Usage: node parse-backgrounds-import.js --input <vault-backgrounds.json> --output <out.json> [--pack-id <id>]')
    process.exit(1)
  }

  const vaultDoc = JSON.parse(fs.readFileSync(path.resolve(inputPath), 'utf8'))
  const backgrounds = parseBackgroundsImport(vaultDoc, packId)

  fs.writeFileSync(outputPath, JSON.stringify(backgrounds, null, 2))
  console.log(`Parsed ${backgrounds.length} backgrounds from ${inputPath}`)
  console.log(`Wrote ${outputPath}`)
}

if (require.main === module) {
  main()
}

module.exports = {
  parseBackgroundsImport,
  parseBackgroundEntry,
  findField,
  stripBold,
  slugify,
  REQUIRED_LABELS,
  VALID_SKILLS,
  DEFAULT_PACK,
}
