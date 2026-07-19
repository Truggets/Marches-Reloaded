// Parses spells.md into SpellEntry[] per the frozen schema (schema.ts).
// Deterministic, heading/metadata driven — no LLM transcription.
//
// Structural trap (see build task notes): not every `#### ` heading under
// "## Spell Descriptions" is a spell. Some spells contain their own nested
// `#### `-level sub-headings in their description (e.g. summoned-creature
// stat blocks with an `#### Actions` section). The reliable discriminator
// is: a real spell heading is a `#### ` heading whose very next non-blank
// line matches `_Level N School (Class, ...)_` or `_School Cantrip (Class, ...)_`.
'use strict'
const fs = require('fs')
const path = require('path')

const SOURCE_PATH = path.join(__dirname, 'source', 'spells.md')
const OUT_PATH = path.join(__dirname, '..', 'spells.json')
const PACK = 'srd-5.2'
const BOOK = 'SRD 5.2.1'

const META_RE = /^_(?:Level (\d+) ([A-Za-z]+)|([A-Za-z]+) Cantrip) \(([^)]+)\)_\s*$/

function slugify(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
}

// Returns the metadata match for the first non-blank line following
// `afterIndex`, or null. Also returns the index just past that line.
function nextNonBlankLine(text, afterIndex) {
  const rest = text.slice(afterIndex)
  const m = rest.match(/^\s*\n+([^\n]*)\n/)
  if (!m) return null
  return { line: m[1], lineEnd: afterIndex + m.index + m[0].length }
}

function parseSpellBody(bodyText) {
  const metaMatch = bodyText.match(
    /\*\*Casting Time:\*\*\s*(.+)\n+\*\*Range:\*\*\s*(.+)\n+\*\*Components?:\*\*\s*(.+)\n+\*\*Duration:\*\*\s*(.+)\n/,
  )
  if (!metaMatch) return null
  const [full, castingTime, range, components, duration] = metaMatch
  const proseStart = metaMatch.index + full.length
  let prose = bodyText.slice(proseStart).trim()

  let higherLevels
  const hlRe = /^_(Using a Higher-Level Spell Slot\.|Cantrip Upgrade\.)_ ?(.*?)(?=\n\n|\n#### |$)/ms
  const hlMatch = prose.match(hlRe)
  if (hlMatch) {
    higherLevels = `${hlMatch[1]} ${hlMatch[2]}`.trim()
    prose = (prose.slice(0, hlMatch.index) + prose.slice(hlMatch.index + hlMatch[0].length)).trim()
  }

  return {
    castingTime: castingTime.trim(),
    range: range.trim(),
    components: components.trim(),
    duration: duration.trim(),
    description: prose,
    higherLevels,
  }
}

function main() {
  const text = fs.readFileSync(SOURCE_PATH, 'utf8')

  const descStart = text.indexOf('## Spell Descriptions')
  if (descStart === -1) throw new Error('Could not find "## Spell Descriptions" heading')
  const region = text.slice(descStart)

  const headingRe = /^#### (.+)$/gm
  const allHeadings = [...region.matchAll(headingRe)]

  // Classify each #### heading: real spell (next non-blank line matches the
  // metadata pattern) vs. non-spell sub-heading (stat block section, etc).
  const classified = allHeadings.map((m) => {
    const name = m[1].trim()
    const headingLineEnd = m.index + m[0].length
    const nb = nextNonBlankLine(region, headingLineEnd)
    const metaLineMatch = nb ? nb.line.match(META_RE) : null
    return { name, index: m.index, headingLineEnd, metaLineMatch, isSpell: !!metaLineMatch }
  })

  const spellHeadings = classified.filter((c) => c.isSpell)
  const excluded = classified.filter((c) => !c.isSpell)

  const spells = []
  const skipped = []
  for (let i = 0; i < spellHeadings.length; i++) {
    const h = spellHeadings[i]
    const bodyStart = h.headingLineEnd
    const bodyEnd = i + 1 < spellHeadings.length ? spellHeadings[i + 1].index : region.length
    const bodyText = region.slice(bodyStart, bodyEnd)

    const meta = h.metaLineMatch
    const level = meta[1] !== undefined ? Number(meta[1]) : 0
    const school = (meta[2] || meta[3] || '').trim()
    const classes = meta[4]
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)

    const parsedBody = parseSpellBody(bodyText)
    if (!parsedBody) {
      skipped.push({ name: h.name, error: 'No **Casting Time:**/Range/Components/Duration block found' })
      continue
    }

    spells.push({
      id: slugify(h.name),
      name: h.name,
      level,
      school,
      castingTime: parsedBody.castingTime,
      range: parsedBody.range,
      components: parsedBody.components,
      duration: parsedBody.duration,
      classes,
      description: parsedBody.description,
      higherLevels: parsedBody.higherLevels,
      pack: PACK,
      source: { book: BOOK, section: h.name },
    })
  }

  fs.writeFileSync(OUT_PATH, JSON.stringify(spells, null, 2))

  console.log(`Total "#### " headings in Spell Descriptions region: ${allHeadings.length}`)
  console.log(`Classified as real spells: ${spellHeadings.length}`)
  console.log(`Excluded as non-spell sub-headings (${excluded.length}):`)
  for (const e of excluded) console.log(`  - ${e.name}`)
  console.log(`Parsed spells: ${spells.length}`)
  if (skipped.length > 0) {
    console.log(`SKIPPED (${skipped.length}):`)
    for (const s of skipped) console.log(`  - ${s.name}: ${s.error}`)
  }
}

main()
