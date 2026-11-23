// Converts a vault-shaped skills JSON file (shape:
//   { skills: [{ name, ability, source, mechanics_first, lore_and_flavor }] })
// into SkillReferenceEntry[] per the frozen schema (schema.ts). Display-only
// reference content (see docs/planning/importer-monsters-skills-plan.md,
// Phase A): never feeds the rules engine. Same "reject the whole pack, name
// the offender" convention as every other M2b importer, same description
// assembly (mechanics_first + lore_and_flavor) as parse-hazards-import.js.
//
// The real vault file lives outside this repo and is never committed; pass
// its path via --input.
'use strict'
const fs = require('fs')
const path = require('path')

const DEFAULT_PACK = 'expansion-skills'

// Duplicate of SKILL_ABILITIES in client/src/engine/computeSheet.ts (a
// non-exported client TS constant; this parser is CommonJS and is also
// imported by the server, so it can't import that module). KEEP IN SYNC with
// computeSheet.ts. A skill name not in this map is rejected.
const SKILL_ABILITIES = {
  Acrobatics: 'Dexterity',
  'Animal Handling': 'Wisdom',
  Arcana: 'Intelligence',
  Athletics: 'Strength',
  Deception: 'Charisma',
  History: 'Intelligence',
  Insight: 'Wisdom',
  Intimidation: 'Charisma',
  Investigation: 'Intelligence',
  Medicine: 'Wisdom',
  Nature: 'Intelligence',
  Perception: 'Wisdom',
  Performance: 'Charisma',
  Persuasion: 'Charisma',
  Religion: 'Intelligence',
  'Sleight of Hand': 'Dexterity',
  Stealth: 'Dexterity',
  Survival: 'Wisdom',
}

function slugify(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
}

// Converts one vault skill object into a SkillReferenceEntry. Throws on the
// first problem found, naming the offending entry.
function parseSkillEntry(vaultEntry, packId) {
  const { name, ability, source, mechanics_first, lore_and_flavor } = vaultEntry || {}

  if (!name || typeof name !== 'string') {
    throw new Error(`Skill entry missing a valid "name": ${JSON.stringify(vaultEntry)}`)
  }
  if (!Object.prototype.hasOwnProperty.call(SKILL_ABILITIES, name)) {
    throw new Error(`Skill "${name}" is not a recognized skill name (expected one of the 18 standard skills)`)
  }
  if (ability !== SKILL_ABILITIES[name]) {
    throw new Error(
      `Skill "${name}" has ability ${JSON.stringify(ability)}, expected "${SKILL_ABILITIES[name]}"`,
    )
  }
  if (!source || typeof source !== 'string') {
    throw new Error(`Skill "${name}" is missing a "source" string`)
  }
  if (!Array.isArray(mechanics_first) || mechanics_first.length === 0) {
    throw new Error(`Skill "${name}" has no "mechanics_first" bullets to build a description from`)
  }

  const description =
    typeof lore_and_flavor === 'string' && lore_and_flavor.trim()
      ? `${mechanics_first.join('\n\n')}\n\n${lore_and_flavor.trim()}`
      : mechanics_first.join('\n\n')

  return {
    id: `${packId}:${slugify(name)}`,
    name,
    ability,
    description,
    pack: packId,
    source: { book: source },
  }
}

// Converts a whole vault-shaped `{ skills: [...] }` document into
// SkillReferenceEntry[].
function parseSkillsImport(vaultDoc, packId = DEFAULT_PACK) {
  if (!vaultDoc || !Array.isArray(vaultDoc.skills)) {
    throw new Error('Expected a document shaped { skills: [...] }')
  }
  if (typeof packId !== 'string' || !packId.trim()) {
    throw new Error('packId is required and must be a non-empty string')
  }
  const skills = vaultDoc.skills.map((s) => parseSkillEntry(s, packId))

  const seenById = new Map()
  for (const skill of skills) {
    const prior = seenById.get(skill.id)
    if (prior) {
      throw new Error(`Duplicate skill id "${skill.id}" from "${prior.name}" and "${skill.name}"`)
    }
    seenById.set(skill.id, skill)
  }

  return skills
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
    console.error('Usage: node parse-skills-import.js --input <vault-skills.json> --output <out.json> [--pack-id <id>]')
    process.exit(1)
  }

  const vaultDoc = JSON.parse(fs.readFileSync(path.resolve(inputPath), 'utf8'))
  const skills = parseSkillsImport(vaultDoc, packId)

  fs.writeFileSync(outputPath, JSON.stringify(skills, null, 2))
  console.log(`Parsed ${skills.length} skills from ${inputPath}`)
  console.log(`Wrote ${outputPath}`)
}

if (require.main === module) {
  main()
}

module.exports = { parseSkillsImport, parseSkillEntry, slugify, SKILL_ABILITIES, DEFAULT_PACK }
