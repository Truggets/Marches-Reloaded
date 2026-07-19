// Parses character-origins.md's "Character Species" section into
// SpeciesEntry[] per the frozen schema (schema.ts).
// Deterministic, heading/table driven — no LLM transcription.
'use strict'
const fs = require('fs')
const path = require('path')
const { extractTable, parseTable } = require('./table-parser')

const SOURCE_PATH = path.join(__dirname, 'source', 'character-origins.md')
const OUT_PATH = path.join(__dirname, '..', 'species.json')
const PACK = 'srd-5.2'
const BOOK = 'SRD 5.2.1'

function slugify(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
}

// Converts a <table> block (e.g. "Draconic Ancestors", "Elven Lineages")
// into a readable text block, using the preceding bold caption line
// (e.g. "**Draconic Ancestors**") as its title if present.
function formatEmbeddedTable(tableHtml, caption) {
  const { headers, rows } = parseTable(tableHtml)
  const lines = rows.map((r) => {
    const cells = headers.map((h, i) => `${h}: ${r[i] ?? ''}`)
    return cells.join('; ')
  })
  const title = caption ? `${caption}` : 'Table'
  return `${title} — ${lines.join(' | ')}`
}

// Replaces every <table>...</table> block within `text` with a formatted
// text rendition, consuming an immediately preceding "**Caption**" line
// (on its own line, directly above the table) as the table's title.
function inlineTables(text) {
  let result = ''
  let cursor = 0
  while (true) {
    const t = extractTable(text, cursor)
    if (!t) {
      result += text.slice(cursor)
      break
    }
    // Look for a "**Caption**" line immediately before the table (allowing
    // blank lines between caption and table, as in the source).
    const before = text.slice(cursor, t.startIndex)
    const captionMatch = before.match(/\*\*(.+?)\*\*\s*\n\s*\n?$/)
    let prefix = before
    let caption = null
    if (captionMatch) {
      caption = captionMatch[1].trim()
      prefix = before.slice(0, captionMatch.index).trimEnd()
    }
    result += prefix
    if (prefix.length > 0) result += '\n\n'
    result += formatEmbeddedTable(t.html, caption)
    cursor = t.endIndex
  }
  return result.trim()
}

function parseTraits(sectionText) {
  // Trait headings look like "_Trait Name._ Description..." at the start
  // of a line (italic markdown convention used throughout the source).
  const headingRe = /^_(.+?)\._ ?/gm
  const matches = [...sectionText.matchAll(headingRe)]
  const traits = []
  for (let i = 0; i < matches.length; i++) {
    const m = matches[i]
    const name = m[1].trim()
    const bodyStart = m.index + m[0].length
    const bodyEnd = i + 1 < matches.length ? matches[i + 1].index : sectionText.length
    const rawBody = sectionText.slice(bodyStart, bodyEnd).trim()
    const description = inlineTables(rawBody).replace(/\n{3,}/g, '\n\n').trim()
    traits.push({ name, description })
  }
  return traits
}

function parseSpeciesBlock(speciesText, speciesName) {
  const creatureTypeMatch = speciesText.match(/\*\*Creature Type:\*\*\s*(.+)/)
  const sizeMatch = speciesText.match(/\*\*Size:\*\*\s*(.+)/)
  const speedMatch = speciesText.match(/\*\*Speed:\*\*\s*(.+)/)

  const traits = parseTraits(speciesText)
  if (traits.length === 0) {
    throw new Error(`No traits found for ${speciesName}`)
  }

  return {
    id: slugify(speciesName),
    name: speciesName,
    creatureType: creatureTypeMatch ? creatureTypeMatch[1].trim() : undefined,
    size: sizeMatch ? sizeMatch[1].trim() : undefined,
    speed: speedMatch ? speedMatch[1].trim() : undefined,
    traits,
    pack: PACK,
    source: { book: BOOK, section: speciesName },
  }
}

function main() {
  const text = fs.readFileSync(SOURCE_PATH, 'utf8')

  const descHeadingMatch = text.match(/\n### Species Descriptions\n/)
  if (!descHeadingMatch) throw new Error('Could not find "### Species Descriptions" heading')
  const sectionStart = descHeadingMatch.index + descHeadingMatch[0].length
  const sectionText = text.slice(sectionStart)

  const speciesHeadingRe = /\n#### (.+)\n/g
  const matches = [...sectionText.matchAll(speciesHeadingRe)]
  const speciesNames = matches.map((m) => m[1].trim())

  const species = []
  const skipped = []
  for (let i = 0; i < matches.length; i++) {
    const name = speciesNames[i]
    const start = matches[i].index + matches[i][0].length
    const end = i + 1 < matches.length ? matches[i + 1].index : sectionText.length
    const block = sectionText.slice(start, end)
    try {
      species.push(parseSpeciesBlock(block, name))
    } catch (err) {
      skipped.push({ name, error: err.message })
    }
  }

  fs.writeFileSync(OUT_PATH, JSON.stringify(species, null, 2))

  console.log(`Source species headings found: ${speciesNames.length} (${speciesNames.join(', ')})`)
  console.log(`Parsed species: ${species.length}`)
  if (skipped.length > 0) {
    console.log(`SKIPPED (${skipped.length}):`)
    for (const s of skipped) console.log(`  - ${s.name}: ${s.error}`)
  }
  for (const s of species) {
    console.log(
      `  ${s.name}: creatureType=${s.creatureType}, size=${s.size}, speed=${s.speed}, ${s.traits.length} traits (${s.traits.map((t) => t.name).join(', ')})`,
    )
  }
}

main()
