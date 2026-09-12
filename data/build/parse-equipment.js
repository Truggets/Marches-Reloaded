// Parses equipment.md into EquipmentEntry[] per the frozen schema (schema.ts).
// Deterministic, table/heading driven — no LLM transcription.
//
// Source structure (see build/source/equipment.md):
//   ## Coins               -> currency conversion table, NOT equipment. Skipped.
//   ## Weapons             -> one <table> (Name/Damage/Properties/Mastery/Weight/Cost),
//                              with colspan <th> "category divider" rows (Simple Melee
//                              Weapons, Simple Ranged Weapons, Martial Melee Weapons,
//                              Martial Ranged Weapons) interleaved in <tbody>.
//   ## Armor               -> one <table> (Armor/Armor Class (AC)/Strength/Stealth/
//                              Weight/Cost), same colspan-divider pattern (Light/Medium/
//                              Heavy Armor, Shield).
//   ## Tools               -> NOT a table. Prose entries under "#### Artisan's Tools"
//                              and "#### Other Tools", each a "**Name (Cost)**" bold
//                              header followed by **Ability:**/**Weight:**/**Utilize:**/
//                              **Craft:**/**Variants:** lines (Craft/Variants optional).
//   ## Adventuring Gear    -> one main <table> "Adventuring Gear" (Item/Weight/Cost),
//                              plus per-item "#### Name (Cost)" prose descriptions for
//                              (most of) those items, plus four more variant/bulk
//                              tables nested in the prose for "Varies"-priced umbrella
//                              rows in the main table: Ammunition (Type/Amount/Storage/
//                              Weight/Cost), Arcane Focuses, Druidic Focuses, and Holy
//                              Symbols (each Focus-or-Symbol/Weight/Cost). All four are
//                              parsed as their own buyable gear entries (tagged
//                              "Variant of: <parent>" in properties) alongside the
//                              umbrella row itself — a Wizard buying a Crystal or a
//                              Cleric buying an Amulet is real level-1 starting
//                              equipment, same as buying Arrows.
//   ## Mounts and Vehicles, ## Lifestyle Expenses, ## Food/Drink/Lodging,
//   ## Hirelings, ## Spellcasting, ## Magic Items, ## Crafting...  -> out of scope
//   (mounts/vehicles/services, not "equipment" per the task's Weapons/Armor/
//   Adventuring Gear/Tools scope). Not parsed.
'use strict'
const fs = require('fs')
const path = require('path')
const { extractTable, parseTable, stripTags } = require('./table-parser')

const SOURCE_PATH = path.join(__dirname, 'source', 'equipment.md')
const OUT_PATH = path.join(__dirname, '..', 'equipment.json')
const PACK = 'srd-5.2'
const BOOK = 'SRD 5.2.1'

// Nested variant/bulk tables in the Adventuring Gear section, keyed by the bold
// title that immediately precedes each <table> in the source. Each corresponds to
// a "Varies"-cost umbrella row in the main Adventuring Gear table.
const VARIANT_TABLES = {
  Ammunition: { parent: 'Ammunition', nameHeader: 'Type' },
  'Arcane Focuses': { parent: 'Arcane Focus', nameHeader: 'Focus' },
  'Druidic Focuses': { parent: 'Druidic Focus', nameHeader: 'Focus' },
  'Holy Symbols': { parent: 'Holy Symbol', nameHeader: 'Symbol' },
}

function slugify(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
}

function clean(v) {
  if (v === undefined || v === null) return undefined
  const t = v.trim()
  return t === '' || t === '—' ? undefined : t
}

// Unique-id allocator: slug by default, disambiguated by category on collision.
function makeIdAllocator() {
  const used = new Set()
  return function id(name, category) {
    let base = slugify(name)
    if (!used.has(base)) {
      used.add(base)
      return base
    }
    const withCat = `${base}-${category}`
    used.add(withCat)
    return withCat
  }
}

// Splits a <table>'s <tbody> into rows, distinguishing plain <td> data rows from
// colspan <th> "category divider" rows (e.g. "Simple Melee Weapons"). parseTable()
// from table-parser only understands <td> cells for body rows, so those divider
// rows come back as empty arrays there — we need the label text, so we re-walk
// the raw HTML ourselves.
function splitBodyRows(tableHtml) {
  const tbodyMatch = tableHtml.match(/<tbody>([\s\S]*?)<\/tbody>/)
  const bodyHtml = tbodyMatch ? tbodyMatch[1] : tableHtml
  const rowRe = /<tr>([\s\S]*?)<\/tr>/g
  const rows = []
  let m
  while ((m = rowRe.exec(bodyHtml))) {
    const rowHtml = m[1]
    const thMatch = rowHtml.match(/<th[^>]*>([\s\S]*?)<\/th>/)
    if (thMatch && !/<td/.test(rowHtml)) {
      rows.push({ isHeader: true, label: stripTags(thMatch[1]) })
    } else {
      const cells = []
      const cellRe = /<td([^>]*)>([\s\S]*?)<\/td>/g
      let cm
      while ((cm = cellRe.exec(rowHtml))) {
        cells.push(stripTags(cm[2]).replace(/\s+/g, ' '))
      }
      rows.push({ isHeader: false, cells })
    }
  }
  return rows
}

// Pairs each data row with the most recent divider-row label above it (weapon/armor
// sub-category, e.g. "Martial Melee Weapons") and the table's column headers.
function parseCategorizedTable(tableHtml) {
  const { headers } = parseTable(tableHtml)
  const rows = splitBodyRows(tableHtml)
  const out = []
  let dividerCount = 0
  let category = null
  for (const r of rows) {
    if (r.isHeader) {
      category = r.label
      dividerCount++
      continue
    }
    const rec = {}
    headers.forEach((h, i) => (rec[h] = r.cells[i] ?? ''))
    out.push({ category, rec })
  }
  return { entries: out, dividerCount, headers }
}

function sliceSection(text, startHeadingRe, stopHeadingRe) {
  const startMatch = text.match(startHeadingRe)
  if (!startMatch) return null
  const start = startMatch.index + startMatch[0].length
  stopHeadingRe.lastIndex = start
  const stopMatch = stopHeadingRe.exec(text)
  const end = stopMatch ? stopMatch.index : text.length
  return text.slice(start, end)
}

// ---- Weapons ----

function parseWeapons(sectionText, id) {
  const t = extractTable(sectionText, 0)
  if (!t) throw new Error('No Weapons table found')
  const { entries, dividerCount } = parseCategorizedTable(t.html)
  const out = entries.map(({ category, rec }) => {
    const name = rec['Name']
    const damage = clean(rec['Damage'])
    const properties = clean(rec['Properties'])
    const mastery = clean(rec['Mastery'])
    const descParts = []
    if (category) descParts.push(category)
    if (damage) descParts.push(`Damage: ${damage}`)
    if (mastery) descParts.push(`Mastery: ${mastery}`)
    return {
      id: id(name, 'weapon'),
      name,
      category: 'weapon',
      cost: clean(rec['Cost']),
      weight: clean(rec['Weight']),
      properties,
      description: descParts.join('. ') || undefined,
      damage,
      mastery,
      pack: PACK,
      source: { book: BOOK, section: 'Weapons' },
    }
  })
  return { entries: out, dividerCount, rawRowCount: entries.length }
}

// ---- Armor ----

function parseArmor(sectionText, id) {
  const t = extractTable(sectionText, 0)
  if (!t) throw new Error('No Armor table found')
  const { entries, dividerCount } = parseCategorizedTable(t.html)
  const out = entries.map(({ category, rec }) => {
    const name = rec['Armor']
    const ac = clean(rec['Armor Class (AC)'])
    const str = clean(rec['Strength'])
    const stealth = clean(rec['Stealth'])
    const propParts = []
    if (ac) propParts.push(`AC: ${ac}`)
    if (str) propParts.push(`Strength: ${str}`)
    if (stealth) propParts.push(`Stealth: ${stealth}`)
    return {
      id: id(name, 'armor'),
      name,
      category: 'armor',
      cost: clean(rec['Cost']),
      weight: clean(rec['Weight']),
      properties: propParts.join('; ') || undefined,
      description: category || undefined,
      ac,
      strength: str,
      stealth,
      pack: PACK,
      source: { book: BOOK, section: 'Armor' },
    }
  })
  return { entries: out, dividerCount, rawRowCount: entries.length }
}

// ---- Tools (prose, not a table) ----

function extractBoldParenEntries(sectionText) {
  const headerRe = /\*\*([^*\n]+?)\s*\(([^)]+)\)\*\*/g
  const matches = [...sectionText.matchAll(headerRe)]
  const entries = []
  for (let i = 0; i < matches.length; i++) {
    const m = matches[i]
    const name = m[1].trim()
    const cost = m[2].trim()
    const start = m.index + m[0].length
    const end = i + 1 < matches.length ? matches[i + 1].index : sectionText.length
    const body = sectionText.slice(start, end)
    entries.push({ name, cost, body })
  }
  return entries
}

function field(re, body) {
  const m = body.match(re)
  return m ? m[1].trim() : undefined
}

function parseTools(sectionText, id) {
  const entries = extractBoldParenEntries(sectionText)
  const out = entries.map(({ name, cost, body }) => {
    const ability = field(/\*\*Ability:\*\*\s*([^\n*]+?)(?=\s*\*\*Weight:\*\*|\n|$)/, body)
    const weight = field(/\*\*Weight:\*\*\s*([^\n]+)/, body)
    const utilize = field(/\*\*Utilize:\*\*\s*([^\n]+)/, body)
    const craft = field(/\*\*Craft:\*\*\s*([^\n]+)/, body)
    const variants = field(/\*\*Variants:\*\*\s*([^\n]+)/, body)
    const descParts = []
    if (utilize) descParts.push(`Utilize: ${utilize}`)
    if (craft) descParts.push(`Craft: ${craft}`)
    if (variants) descParts.push(`Variants: ${variants}`)
    return {
      id: id(name, 'tool'),
      name,
      category: 'tool',
      cost: clean(cost),
      weight: clean(weight),
      properties: ability ? `Ability: ${ability}` : undefined,
      description: descParts.join(' ') || undefined,
      pack: PACK,
      source: { book: BOOK, section: 'Tools' },
    }
  })
  return { entries: out, rawEntryCount: entries.length }
}

// ---- Adventuring Gear ----

function buildGearDescriptionMap(sectionText) {
  // "#### Name (Cost)" prose headings, body runs until the next #### / ### heading
  // or a **Bold Table Title** table intro (tables themselves are stripped out).
  const headingRe = /^#### (.+?)\s*\(([^)]*)\)\s*$/gm
  const matches = [...sectionText.matchAll(headingRe)]
  const map = new Map()
  for (let i = 0; i < matches.length; i++) {
    const m = matches[i]
    const name = m[1].trim()
    const start = m.index + m[0].length
    const end = i + 1 < matches.length ? matches[i + 1].index : sectionText.length
    let body = sectionText.slice(start, end)
    body = body.replace(/<table>[\s\S]*?<\/table>/g, '')
    body = body.replace(/\*\*[^*]+\*\*\s*\n\n?/g, (s) => (/^\*\*[A-Z][a-z].*\*\*$/.test(s.trim()) ? '' : s)) // drop stray bold sub-titles like **Adventuring Gear**
    body = body.trim().replace(/\n{2,}/g, ' ').replace(/\s+/g, ' ')
    map.set(name, body || undefined)
  }
  return map
}

// Every <table> block in the section, in document order: [0] is the main
// "Adventuring Gear" table; the rest are the nested variant/bulk tables
// (Ammunition, Arcane Focuses, Druidic Focuses, Holy Symbols).
function collectAllTables(sectionText) {
  const tables = []
  let idx = 0
  while (true) {
    const t = extractTable(sectionText, idx)
    if (!t) break
    tables.push(t)
    idx = t.endIndex
  }
  return tables
}

// The bold "**Title**" line immediately preceding a <table> in the source
// (e.g. "**Arcane Focuses**\n\n<table>...") identifies which variant table it is.
function precedingBoldTitle(sectionText, startIndex) {
  const before = sectionText.slice(0, startIndex)
  const m = before.match(/\*\*([^*\n]+)\*\*\s*\n+$/)
  return m ? m[1].trim() : null
}

function parseGearMainTable(mainTable, descMap, id) {
  const { headers, rows } = parseTable(mainTable.html)
  const out = rows.map((r) => {
    const rec = {}
    headers.forEach((h, i) => (rec[h] = r[i] ?? ''))
    const name = rec['Item']
    let description = descMap.get(name)
    if (description === undefined && name.startsWith('Spell Scroll')) {
      // "Spell Scroll (Cantrip)" / "Spell Scroll (Level 1)" table rows share one
      // combined prose heading: "#### Spell Scroll (Cantrip, 30 GP; Level 1, 50 GP)"
      for (const [k, v] of descMap) {
        if (k.startsWith('Spell Scroll')) {
          description = v
          break
        }
      }
    }
    return {
      id: id(name, 'gear'),
      name,
      category: 'gear',
      cost: clean(rec['Cost']),
      weight: clean(rec['Weight']),
      properties: undefined,
      description,
      pack: PACK,
      source: { book: BOOK, section: 'Adventuring Gear' },
    }
  })
  return { entries: out, rawRowCount: rows.length }
}

// Parses one nested variant/bulk table (Ammunition, Arcane Focuses, Druidic
// Focuses, Holy Symbols) into gear entries tagged "Variant of: <parent>".
function parseVariantTable(table, title, id) {
  const meta = VARIANT_TABLES[title]
  const { headers, rows } = parseTable(table.html)
  const nameHeader = meta && headers.includes(meta.nameHeader) ? meta.nameHeader : headers[0]
  const out = rows.map((r) => {
    const rec = {}
    headers.forEach((h, i) => (rec[h] = r[i] ?? ''))
    const name = rec[nameHeader]
    const propParts = []
    if (meta) propParts.push(`Variant of: ${meta.parent}`)
    if (clean(rec['Amount'])) propParts.push(`Amount: ${rec['Amount']} per purchase`)
    if (clean(rec['Storage'])) propParts.push(`Storage: ${rec['Storage']}`)
    return {
      id: id(name, 'gear'),
      name,
      category: 'gear',
      cost: clean(rec['Cost']),
      weight: clean(rec['Weight']),
      properties: propParts.join('; ') || undefined,
      description: undefined,
      pack: PACK,
      source: { book: BOOK, section: 'Adventuring Gear' },
    }
  })
  return { entries: out, rawRowCount: rows.length, title }
}

function parseAdventuringGear(sectionText, id) {
  const descMap = buildGearDescriptionMap(sectionText)
  const tables = collectAllTables(sectionText)
  if (tables.length === 0) throw new Error('No Adventuring Gear table found')

  const [mainTable, ...variantTables] = tables
  const main = parseGearMainTable(mainTable, descMap, id)

  const variantResults = variantTables.map((t) => {
    const title = precedingBoldTitle(sectionText, t.startIndex) || '(untitled)'
    return parseVariantTable(t, title, id)
  })
  const unrecognized = variantResults.filter((v) => !VARIANT_TABLES[v.title])

  return {
    entries: [...main.entries, ...variantResults.flatMap((v) => v.entries)],
    mainRowCount: main.rawRowCount,
    variantResults,
    unrecognized,
    descHeadingCount: descMap.size,
  }
}

function main() {
  // Normalize CRLF -> LF: on Windows checkouts (core.autocrlf) the source
  // file's line endings can come back as \r\n, which breaks the \n-anchored
  // section/heading regexes below. Reading/writing tools stay text-mode.
  const text = fs.readFileSync(SOURCE_PATH, 'utf8').replace(/\r\n/g, '\n')
  const id = makeIdAllocator()

  const weaponsSection = sliceSection(text, /\n## Weapons\n/, /\n## /g)
  const armorSection = sliceSection(text, /\n## Armor\n/, /\n## /g)
  const toolsSection = sliceSection(text, /\n## Tools\n/, /\n## /g)
  const gearSection = sliceSection(text, /\n## Adventuring Gear\n/, /\n## /g)

  if (!weaponsSection) throw new Error('Weapons section not found')
  if (!armorSection) throw new Error('Armor section not found')
  if (!toolsSection) throw new Error('Tools section not found')
  if (!gearSection) throw new Error('Adventuring Gear section not found')

  const weapons = parseWeapons(weaponsSection, id)
  const armor = parseArmor(armorSection, id)
  const tools = parseTools(toolsSection, id)
  const gear = parseAdventuringGear(gearSection, id)

  const equipment = [...weapons.entries, ...armor.entries, ...tools.entries, ...gear.entries]

  fs.writeFileSync(OUT_PATH, JSON.stringify(equipment, null, 2))

  console.log('=== Equipment parse report ===')
  console.log(
    `Weapons:  ${weapons.rawRowCount} table rows (${weapons.dividerCount} category dividers found: Simple/Martial x Melee/Ranged) -> ${weapons.entries.length} parsed entries`,
  )
  console.log(
    `Armor:    ${armor.rawRowCount} table rows (${armor.dividerCount} category dividers found: Light/Medium/Heavy/Shield) -> ${armor.entries.length} parsed entries`,
  )
  console.log(
    `Tools:    ${tools.rawEntryCount} bold-header prose entries found -> ${tools.entries.length} parsed entries`,
  )
  console.log(
    `Gear:     ${gear.mainRowCount} Adventuring Gear table rows (${gear.descHeadingCount} prose "#### Name (Cost)" description headings matched)`,
  )
  for (const v of gear.variantResults) {
    console.log(`          + ${v.rawRowCount} "${v.title}" variant-table rows -> ${v.entries.length} parsed entries`)
  }
  console.log(`Gear total parsed entries: ${gear.entries.length}`)
  console.log(`TOTAL: ${equipment.length} equipment entries written to ${OUT_PATH}`)

  if (gear.unrecognized.length > 0) {
    console.log(`\nWARNING: unrecognized variant table(s) under Adventuring Gear (parsed generically, verify manually):`)
    for (const v of gear.unrecognized) console.log(`  - "${v.title}": ${v.rawRowCount} rows`)
  }

  console.log('\nSKIPPED (intentionally, not equipment rows or out of task scope):')
  console.log('  - Coin Values table (## Coins): currency conversion, not gear.')
  console.log(
    '  - Mounts and Vehicles / Lifestyle Expenses / Food, Drink, and Lodging / Hirelings / Spellcasting / Magic Items / Crafting sections: out of the Weapons/Armor/Tools/Adventuring Gear scope for this parser.',
  )

  const missingDesc = gear.entries.filter((e) => e.category === 'gear' && !e.description && !e.properties)
  if (missingDesc.length > 0) {
    console.log(`\nGear entries with no matched prose description or properties (${missingDesc.length}):`)
    for (const e of missingDesc) console.log(`  - ${e.name}`)
  }

  const byCategory = equipment.reduce((acc, e) => {
    acc[e.category] = (acc[e.category] || 0) + 1
    return acc
  }, {})
  console.log('\nBy category:', byCategory)
}

main()
