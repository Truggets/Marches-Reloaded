// Parses classes.md into ClassEntry[] per the frozen schema (schema.ts).
// Deterministic, table/heading driven — no LLM transcription.
'use strict'
const fs = require('fs')
const path = require('path')
const { extractTable, parseTable } = require('./table-parser')

const SOURCE_PATH = path.join(__dirname, 'source', 'classes.md')
const OUT_PATH = path.join(__dirname, '..', 'classes.json')
const PACK = 'srd-5.2'
const BOOK = 'SRD 5.2.1'

function slugify(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
}

function findLabelRow(rows, label) {
  const row = rows.find((r) => r[0] === label)
  return row ? row[1] : undefined
}

function parseCoreTraits(sectionHtml) {
  const t = extractTable(sectionHtml, 0)
  if (!t) return null
  const { rows } = parseTable(t.html)
  return {
    primaryAbility: findLabelRow(rows, 'Primary Ability') || '',
    hitPointDie: findLabelRow(rows, 'Hit Point Die') || '',
    savingThrows: findLabelRow(rows, 'Saving Throw Proficiencies') || '',
    skillProficiencies: findLabelRow(rows, 'Skill Proficiencies') || '',
    weaponProficiencies: findLabelRow(rows, 'Weapon Proficiencies') || '',
    armorTraining: findLabelRow(rows, 'Armor Training') || '',
    startingEquipment: findLabelRow(rows, 'Starting Equipment') || '',
  }
}

function parseMulticlassTraits(sectionText) {
  // Bullet style varies by class in the source markdown: Barbarian/Bard/Druid/
  // Paladin/Wizard use the Unicode bullet "•", while Fighter/Cleric/Monk/
  // Ranger/Rogue/Sorcerer/Warlock use a plain hyphen "-". Match either.
  const m = sectionText.match(/#### As a Multiclass Character\s*\n\s*\n[•-]\s*(.*?)(?:\n[•-]|\n####|$)/s)
  return m ? m[1].trim().replace(/\s+/g, ' ') : ''
}

// Parses the "#### Level N: Feature Name" ... prose blocks within a section,
// stopping at the next "### " or "## " heading or end of string.
function parseFeatureBlocks(sectionText) {
  const features = []
  const headingRe = /^#### Level (\d+):\s*(.+)$/gm
  const matches = [...sectionText.matchAll(headingRe)]
  for (let i = 0; i < matches.length; i++) {
    const m = matches[i]
    const level = Number(m[1])
    const name = m[2].trim()
    const bodyStart = m.index + m[0].length
    const bodyEnd = i + 1 < matches.length ? matches[i + 1].index : sectionText.length
    const description = sectionText.slice(bodyStart, bodyEnd).trim()
    features.push({ level, name, description })
  }
  return features
}

function parseFeatureTable(tableHtml) {
  const { headers, rows } = parseTable(tableHtml)
  return rows.map((r) => {
    const rec = {}
    headers.forEach((h, i) => (rec[h] = r[i] ?? ''))
    const level = Number(rec['Level'])
    const proficiencyBonus = rec['Proficiency Bonus'] || ''
    const featureNames = (rec['Class Features'] || '')
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s && s !== '—')
    const extraColumns = {}
    for (const h of headers) {
      if (['Level', 'Proficiency Bonus', 'Class Features'].includes(h)) continue
      if (/^\d+$/.test(h)) continue // spell-slot columns handled separately
      extraColumns[h] = rec[h]
    }
    return { level, proficiencyBonus, features: featureNames, extraColumns }
  })
}

function parseSpellSlotTable(tableHtml) {
  const { headers, rows } = parseTable(tableHtml)
  const slotCols = headers.filter((h) => /^\d+$/.test(h))
  if (slotCols.length === 0) return undefined
  return rows.map((r) => {
    const rec = {}
    headers.forEach((h, i) => (rec[h] = r[i] ?? ''))
    const slotsByLevel = {}
    for (const col of slotCols) {
      const v = rec[col]
      slotsByLevel[Number(col)] = v === '—' || v === '' ? 0 : Number(v)
    }
    return {
      level: Number(rec['Level']),
      cantrips: rec['Cantrips'] !== undefined ? Number(rec['Cantrips'] || 0) : undefined,
      preparedOrKnown:
        rec['Prepared Spells'] !== undefined
          ? Number(rec['Prepared Spells'] || 0)
          : rec['Spells Known'] !== undefined
            ? Number(rec['Spells Known'] || 0)
            : undefined,
      slotsByLevel,
    }
  })
}

function sliceSection(text, startHeadingRe, stopLevel) {
  const startMatch = text.match(startHeadingRe)
  if (!startMatch) return null
  const start = startMatch.index + startMatch[0].length
  const stopRe = stopLevel === 2 ? /\n## /g : /\n#{2,3} /g
  stopRe.lastIndex = start
  const stopMatch = stopRe.exec(text)
  const end = stopMatch ? stopMatch.index : text.length
  return text.slice(start, end)
}

function parseClassBlock(classText, className) {
  const id = slugify(className)

  const coreTraitsSection = classText.slice(0, classText.indexOf('### Becoming'))
  const coreTraits = parseCoreTraits(coreTraitsSection) || {}

  const becomingSection = sliceSection(classText, /### Becoming a .*?\n/, 3) || ''
  const multiclassTraitsGranted = parseMulticlassTraits(becomingSection)

  const featuresHeadingRe = new RegExp(`### ${className} Class Features\\n`)
  const featuresSectionFull = sliceSection(classText, featuresHeadingRe, 3)
  if (!featuresSectionFull) {
    throw new Error(`No Class Features section found for ${className}`)
  }
  const table = extractTable(featuresSectionFull, 0)
  if (!table) throw new Error(`No features table found for ${className}`)
  const featureTable = parseFeatureTable(table.html)
  const spellSlotTable = parseSpellSlotTable(table.html)
  const proseAfterTable = featuresSectionFull.slice(table.endIndex)
  const features = parseFeatureBlocks(proseAfterTable)

  // Subclass: "### {Class} Subclass: {Name}" through next "## " or end.
  const subclassHeadingRe = new RegExp(`### ${className} Subclass: (.+?)\\n`)
  const subclassHeadingMatch = classText.match(subclassHeadingRe)
  const subclasses = []
  if (subclassHeadingMatch) {
    const subclassName = subclassHeadingMatch[1].trim()
    const subclassSection = sliceSection(classText, subclassHeadingRe, 2) || ''
    const flavorMatch = subclassSection.match(/^_(.+?)_/)
    const subFeatures = parseFeatureBlocks(subclassSection)
    subclasses.push({
      id: `${id}-${slugify(subclassName)}`,
      name: subclassName,
      classId: id,
      flavorLine: flavorMatch ? flavorMatch[1] : undefined,
      features: subFeatures,
      pack: PACK,
      source: { book: BOOK, section: `${className} Subclass: ${subclassName}` },
    })
  }

  return {
    id,
    name: className,
    primaryAbility: coreTraits.primaryAbility,
    hitPointDie: coreTraits.hitPointDie,
    savingThrowProficiencies: (coreTraits.savingThrows || '')
      .split(/,| and /)
      .map((s) => s.trim())
      .filter(Boolean),
    skillProficiencies: coreTraits.skillProficiencies,
    weaponProficiencies: coreTraits.weaponProficiencies,
    armorTraining: coreTraits.armorTraining,
    startingEquipment: coreTraits.startingEquipment,
    multiclassTraitsGranted,
    featureTable,
    features,
    spellSlotTable,
    subclasses,
    pack: PACK,
    source: { book: BOOK, section: className },
  }
}

function main() {
  const text = fs.readFileSync(SOURCE_PATH, 'utf8')
  const classHeadingRe = /\n## (\w+)\n/g
  const matches = [...text.matchAll(classHeadingRe)]
  const classNames = matches.map((m) => m[1])

  const classes = []
  const skipped = []
  for (let i = 0; i < matches.length; i++) {
    const name = classNames[i]
    const start = matches[i].index + matches[i][0].length
    const end = i + 1 < matches.length ? matches[i + 1].index : text.length
    const block = text.slice(start, end)
    try {
      classes.push(parseClassBlock(block, name))
    } catch (err) {
      skipped.push({ name, error: err.message })
    }
  }

  fs.writeFileSync(OUT_PATH, JSON.stringify(classes, null, 2))

  console.log(`Source headings found: ${classNames.length} (${classNames.join(', ')})`)
  console.log(`Parsed classes: ${classes.length}`)
  if (skipped.length > 0) {
    console.log(`SKIPPED (${skipped.length}):`)
    for (const s of skipped) console.log(`  - ${s.name}: ${s.error}`)
  }
  for (const c of classes) {
    const levels = c.featureTable.map((r) => r.level)
    const complete = levels.length === 20 && levels[0] === 1 && levels[19] === 20
    console.log(
      `  ${c.name}: ${c.featureTable.length} feature-table rows (${complete ? 'OK 1-20' : 'INCOMPLETE'}), ${c.features.length} feature blocks, ${c.subclasses.length} subclass(es)${c.spellSlotTable ? ', caster' : ''}`,
    )
  }
}

main()
