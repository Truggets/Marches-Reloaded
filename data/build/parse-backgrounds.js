// Parses the "Character Backgrounds" section of character-origins.md into
// BackgroundEntry[] per the frozen schema (schema.ts).
// Deterministic, heading/regex driven — no LLM transcription.
'use strict'
const fs = require('fs')
const path = require('path')

const SOURCE_PATH = path.join(__dirname, 'source', 'character-origins.md')
const OUT_PATH = path.join(__dirname, '..', 'backgrounds.json')
const PACK = 'srd-5.2'
const BOOK = 'SRD 5.2.1'

function slugify(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
}

// Slices text between a start heading regex (exclusive of the heading line)
// and the next heading at `stopLevel` or shallower (e.g. stopLevel 2 stops
// at the next "## " heading, allowing "### "/"#### " headings inside).
function sliceSection(text, startHeadingRe, stopLevel) {
  const startMatch = text.match(startHeadingRe)
  if (!startMatch) return null
  const start = startMatch.index + startMatch[0].length
  const levels = []
  for (let l = 2; l <= stopLevel; l++) levels.push(l)
  const stopRe = new RegExp(`\\n#{2,${stopLevel}} `, 'g')
  stopRe.lastIndex = start
  const stopMatch = stopRe.exec(text)
  const end = stopMatch ? stopMatch.index : text.length
  return text.slice(start, end)
}

// Extracts a "**Label:** value" line's value, up to end of line.
function findField(blockText, label) {
  const re = new RegExp(`\\*\\*${label}:\\*\\*\\s*(.+)`)
  const m = blockText.match(re)
  return m ? m[1].trim() : undefined
}

function parseBackgroundBlock(name, blockText) {
  const id = slugify(name)

  const abilityScoresRaw = findField(blockText, 'Ability Scores')
  const abilityScores = abilityScoresRaw
    ? abilityScoresRaw
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    : undefined

  const featRaw = findField(blockText, 'Feat')
  // Strip trailing '(see "Feats")' cross-reference annotations.
  const feat = featRaw ? featRaw.replace(/\s*\(see ["'“]Feats["'”]\)\s*$/, '').trim() : undefined

  const skillProficienciesRaw = findField(blockText, 'Skill Proficiencies')
  const skillProficiencies = skillProficienciesRaw
    ? skillProficienciesRaw
        .split(/,| and /)
        .map((s) => s.trim())
        .filter(Boolean)
    : undefined

  const toolProficiencyRaw = findField(blockText, 'Tool Proficiency')
  // Strip trailing '(see "Equipment")' cross-reference annotations, same as feat.
  const toolProficiency = toolProficiencyRaw
    ? toolProficiencyRaw.replace(/\s*\(see ["'“]Equipment["'”]\)\s*$/, '').trim()
    : undefined
  const equipment = findField(blockText, 'Equipment')

  if (!abilityScores || !feat || !skillProficiencies || !toolProficiency || !equipment) {
    const missing = []
    if (!abilityScores) missing.push('Ability Scores')
    if (!feat) missing.push('Feat')
    if (!skillProficiencies) missing.push('Skill Proficiencies')
    if (!toolProficiency) missing.push('Tool Proficiency')
    if (!equipment) missing.push('Equipment')
    throw new Error(`missing field(s): ${missing.join(', ')}`)
  }

  return {
    id,
    name,
    abilityScores,
    feat,
    skillProficiencies,
    toolProficiency,
    equipment,
    pack: PACK,
    source: { book: BOOK, section: name },
  }
}

function main() {
  const text = fs.readFileSync(SOURCE_PATH, 'utf8')

  // "Character Backgrounds" (## ) runs until the next "## " heading
  // ("Character Species"), which a sibling parser owns — do not touch it.
  const backgroundsSection = sliceSection(text, /\n## Character Backgrounds\n/, 2)
  if (!backgroundsSection) {
    throw new Error('Could not find "## Character Backgrounds" section')
  }

  // Within that section, the actual per-background entries live under
  // "### Background Descriptions" as "#### Name" subheadings, running to
  // the end of the (already-sliced) Backgrounds section.
  const descriptionsSection = sliceSection(backgroundsSection, /\n### Background Descriptions\n/, 3)
  if (!descriptionsSection) {
    throw new Error('Could not find "### Background Descriptions" section')
  }

  const headingRe = /\n#### (.+?)\n/g
  const matches = [...descriptionsSection.matchAll(headingRe)]
  const names = matches.map((m) => m[1].trim())

  const backgrounds = []
  const skipped = []
  for (let i = 0; i < matches.length; i++) {
    const name = names[i]
    const start = matches[i].index + matches[i][0].length
    const end = i + 1 < matches.length ? matches[i + 1].index : descriptionsSection.length
    const block = descriptionsSection.slice(start, end)
    try {
      backgrounds.push(parseBackgroundBlock(name, block))
    } catch (err) {
      skipped.push({ name, error: err.message })
    }
  }

  fs.writeFileSync(OUT_PATH, JSON.stringify(backgrounds, null, 2))

  console.log(`Source background headings found: ${names.length} (${names.join(', ')})`)
  console.log(`Parsed backgrounds: ${backgrounds.length}`)
  if (skipped.length > 0) {
    console.log(`SKIPPED (${skipped.length}):`)
    for (const s of skipped) console.log(`  - ${s.name}: ${s.error}`)
  }
  for (const b of backgrounds) {
    console.log(
      `  ${b.name}: abilityScores=[${b.abilityScores.join(', ')}], feat="${b.feat}", skills=[${b.skillProficiencies.join(', ')}], tool="${b.toolProficiency}"`,
    )
  }
}

main()
