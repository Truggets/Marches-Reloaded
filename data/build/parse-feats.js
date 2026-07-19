// Parses feats.md into FeatEntry[] per the frozen schema (schema.ts).
// Deterministic, heading driven — no LLM transcription.
'use strict'
const fs = require('fs')
const path = require('path')

const SOURCE_PATH = path.join(__dirname, 'source', 'feats.md')
const OUT_PATH = path.join(__dirname, '..', 'feats.json')
const PACK = 'srd-5.2'
const BOOK = 'SRD 5.2.1'

const VALID_CATEGORIES = ['Origin', 'General', 'Fighting Style', 'Epic Boon']

function slugify(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
}

// Matches the italic metadata line directly under a feat's #### heading, e.g.:
//   _Origin Feat_
//   _General Feat (Prerequisite: Level 4+)_
//   _Epic Boon Feat (Prerequisite: Level 19+, Spellcasting Feature)_
const CATEGORY_LINE_RE = /^_(Origin|General|Fighting Style|Epic Boon) Feat(?:\s*\(Prerequisite:\s*([^)]+)\))?_\s*$/m

function parseFeatBlock(name, bodyText, categoryHeading) {
  const lines = bodyText.trim()
  const catMatch = lines.match(CATEGORY_LINE_RE)
  if (!catMatch) {
    throw new Error(`No category/prerequisite line found (expected "_${categoryHeading} Feat...._")`)
  }
  const category = catMatch[1]
  if (!VALID_CATEGORIES.includes(category)) {
    throw new Error(`Unrecognized category "${category}"`)
  }
  if (category !== categoryHeading) {
    throw new Error(`Category line says "${category}" but feat is under "${categoryHeading}" section`)
  }
  const prerequisite = catMatch[2] ? catMatch[2].trim() : undefined

  // Benefit = everything in the body after the category line.
  const afterCatIndex = catMatch.index + catMatch[0].length
  const benefit = lines.slice(afterCatIndex).trim()
  if (!benefit) {
    throw new Error('No benefit text found after category line')
  }

  const repeatable = /_Repeatable\._/.test(benefit)

  return {
    id: slugify(name),
    name,
    category,
    prerequisite,
    repeatable,
    benefit,
    pack: PACK,
    source: { book: BOOK, section: name },
  }
}

function sliceSection(text, startIndex, allSectionStarts) {
  // allSectionStarts: sorted array of indices where any "### " section begins (after startIndex).
  const next = allSectionStarts.find((i) => i > startIndex)
  return next !== undefined ? text.slice(startIndex, next) : text.slice(startIndex)
}

function main() {
  const text = fs.readFileSync(SOURCE_PATH, 'utf8')

  // Find all "### X Feats" category section headings.
  const sectionHeadingRe = /\n### (Origin|General|Fighting Style|Epic Boon) Feats\n/g
  const sectionMatches = [...text.matchAll(sectionHeadingRe)]
  const allThirdLevelHeadingStarts = [...text.matchAll(/\n### /g)].map((m) => m.index)

  const feats = []
  const skipped = []
  let sourceHeadingCount = 0
  const perCategorySourceCount = {}
  const perCategoryParsedCount = {}

  for (let s = 0; s < sectionMatches.length; s++) {
    const sm = sectionMatches[s]
    const categoryHeading = sm[1]
    const sectionStart = sm.index + sm[0].length
    const sectionText = sliceSection(text, sectionStart, allThirdLevelHeadingStarts)

    // Find "#### Feat Name" headings within this section.
    const featHeadingRe = /^#### (.+)$/gm
    const featMatches = [...sectionText.matchAll(featHeadingRe)]
    perCategorySourceCount[categoryHeading] = (perCategorySourceCount[categoryHeading] || 0) + featMatches.length
    sourceHeadingCount += featMatches.length

    for (let i = 0; i < featMatches.length; i++) {
      const fm = featMatches[i]
      const name = fm[1].trim()
      const bodyStart = fm.index + fm[0].length
      const bodyEnd = i + 1 < featMatches.length ? featMatches[i + 1].index : sectionText.length
      const body = sectionText.slice(bodyStart, bodyEnd)
      try {
        const feat = parseFeatBlock(name, body, categoryHeading)
        feats.push(feat)
        perCategoryParsedCount[categoryHeading] = (perCategoryParsedCount[categoryHeading] || 0) + 1
      } catch (err) {
        skipped.push({ name, category: categoryHeading, error: err.message })
      }
    }
  }

  fs.writeFileSync(OUT_PATH, JSON.stringify(feats, null, 2))

  console.log(`Source category sections found: ${sectionMatches.length} (${sectionMatches.map((m) => m[1]).join(', ')})`)
  console.log(`Source feat headings found: ${sourceHeadingCount}`)
  console.log(`Parsed feats: ${feats.length}`)
  console.log('Per-category breakdown (source -> parsed):')
  for (const cat of VALID_CATEGORIES) {
    console.log(`  ${cat}: ${perCategorySourceCount[cat] || 0} -> ${perCategoryParsedCount[cat] || 0}`)
  }
  if (skipped.length > 0) {
    console.log(`SKIPPED (${skipped.length}):`)
    for (const s of skipped) console.log(`  - [${s.category}] ${s.name}: ${s.error}`)
  } else {
    console.log('SKIPPED: none')
  }
}

main()
