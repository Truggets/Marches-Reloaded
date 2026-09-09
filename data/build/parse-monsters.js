// Parses build/source/monsters.md's curated stat blocks into MonsterEntry[]
// per the frozen schema (schema.ts). Deterministic, heading/table driven —
// no LLM transcription. Mirrors parse-species.js's conventions.
//
// Source structure (see build/source/monsters.md, docs/planning/m11-sandbox-v0-plan.md):
// the curated file mixes two heading-level conventions from its two upstream
// origin files:
//   - monsters-A-Z.md-derived entries (first 7): "### <Monster>" heading,
//     "#### <Section>" (Actions/Bonus Actions/Reactions/Traits) subsections.
//   - animals.md-derived entries (last 3): "## <Monster>" heading,
//     "### <Section>" subsections.
// Both shapes are detected per-monster (by the matched heading's `#` count)
// rather than hardcoded to one. Every entry has, in order: an italic
// "_Size Type, Alignment_" line; **AC**/**Initiative**, **HP**, **Speed**
// lines; an ability-score <table>; some subset of **Skills**/**Gear**/
// **Senses**/**Languages** lines; a **CR** line; then an optional Traits
// section and a required Actions section (Bonus Actions/Reactions are
// skipped for v0 per the plan — no real monster AI needs them).
'use strict'
const fs = require('fs')
const path = require('path')
const { extractTable, parseTable } = require('./table-parser')

const SOURCE_PATH = path.join(__dirname, 'source', 'monsters.md')
const OUT_PATH = path.join(__dirname, '..', 'monsters.json')
const PACK = 'srd-5.2'
const BOOK = 'SRD 5.2.1'

const SIZE_WORDS = ['Tiny', 'Small', 'Medium', 'Large', 'Huge', 'Gargantuan']
const SUBSECTION_NAMES = ['Actions', 'Traits', 'Bonus Actions', 'Reactions', 'Legendary Actions']

const ABILITY_ABBR_TO_FULL = {
  STR: 'Strength',
  DEX: 'Dexterity',
  CON: 'Constitution',
  INT: 'Intelligence',
  WIS: 'Wisdom',
  CHA: 'Charisma',
}

function slugify(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
}

// Splits "Medium or Small Humanoid" / "Small Fey (Goblinoid)" / "Large Beast"
// into { size, creatureType } using the known size-word vocabulary (with
// "or" combos) so a parenthetical creature-type qualifier (e.g. "Goblinoid")
// isn't mistaken for part of the size.
function splitSizeAndType(sizeTypeText) {
  const sizeAlt = SIZE_WORDS.join('|')
  const re = new RegExp(`^((?:${sizeAlt})(?: or (?:${sizeAlt}))?)\\s+(.+)$`)
  const m = sizeTypeText.match(re)
  if (!m) throw new Error(`Could not split size/type from "${sizeTypeText}"`)
  return { size: m[1].trim(), creatureType: m[2].trim() }
}

// Extracts "**_Name._** body..." entries from a section's text (used for
// both Traits and Actions — both use the bold-italic "**_Name._**" heading
// convention within their subsections).
function parseNamedEntries(sectionText) {
  const headingRe = /\*\*_(.+?)\._\*\*\s*/g
  const matches = [...sectionText.matchAll(headingRe)]
  const entries = []
  for (let i = 0; i < matches.length; i++) {
    const m = matches[i]
    const name = m[1].trim()
    const bodyStart = m.index + m[0].length
    const bodyEnd = i + 1 < matches.length ? matches[i + 1].index : sectionText.length
    const rawBody = sectionText.slice(bodyStart, bodyEnd).trim()
    entries.push({ name, rawBody })
  }
  return entries
}

// Finds a "#### SectionName" (or "### SectionName", per `hashes`) subsection
// within `blockText` and returns its content up to the next heading of the
// same level (or the end of the block). Returns null if not found.
function findSubsection(blockText, hashes, sectionName) {
  const headingRe = new RegExp(`\\n${hashes} ${sectionName}\\n`)
  const m = blockText.match(headingRe)
  if (!m) return null
  const start = m.index + m[0].length
  const nextRe = new RegExp(`\\n${hashes} `, 'g')
  nextRe.lastIndex = start
  const next = nextRe.exec(blockText)
  const end = next ? next.index : blockText.length
  return blockText.slice(start, end)
}

// Matches any "..._ X Attack Roll:_" phrasing, not just a hardcoded
// Melee/Ranged/"or" enumeration — real SRD stat-block text also uses
// "Melee Spell Attack Roll:", "Melee or Ranged Spell Attack Roll:", etc.
// (this curated 10-monster set doesn't happen to use any of those, but a
// future extension of monsters.md could, and the whole point of this
// throw is to catch a real attack action losing its damage silently —
// narrowing the detection to only the phrasings seen so far would defeat
// that, the same failure class this repo's parsers exist to prevent).
const ATTACK_ROLL_RE = /_[^_]*\bAttack Roll:_/
const ATTACK_BONUS_RE = /_[^_]*\bAttack Roll:_\s*(\+\d+)/

function parseAction(monsterName, name, rawBody) {
  if (!ATTACK_ROLL_RE.test(rawBody)) {
    return { name, description: rawBody }
  }
  const bonusMatch = rawBody.match(ATTACK_BONUS_RE)
  const hitMatch = rawBody.match(/_Hit:_\s*\d+\s*\(([^)]+)\)\s*(\w+)\s+damage/)
  if (!bonusMatch || !hitMatch) {
    throw new Error(
      `${monsterName} — action "${name}" has an Attack Roll but no matching "_Hit:_ N (dice) Type damage" phrasing`,
    )
  }
  return {
    name,
    attackBonus: bonusMatch[1],
    damage: `${hitMatch[1].trim()} ${hitMatch[2].trim()}`,
    description: rawBody,
  }
}

function parseAbilityScores(blockText, monsterName) {
  const t = extractTable(blockText, 0)
  if (!t) throw new Error(`${monsterName}: no ability-score table found`)
  const { rows } = parseTable(t.html)
  const abilityScores = {}
  for (const row of rows) {
    for (let i = 0; i + 1 < row.length; i += 4) {
      const abbr = row[i]
      const score = row[i + 1]
      const full = ABILITY_ABBR_TO_FULL[abbr]
      if (!full) continue
      abilityScores[full] = Number(score)
    }
  }
  const missing = Object.values(ABILITY_ABBR_TO_FULL).filter((a) => !(a in abilityScores))
  if (missing.length > 0) {
    throw new Error(`${monsterName}: ability-score table missing ${missing.join(', ')}`)
  }
  return abilityScores
}

function parseMonsterBlock(monsterName, headingHashes, blockText) {
  const subHashes = headingHashes + '#'

  const sizeTypeMatch = blockText.match(/^_(.+?), (.+?)_\s*$/m)
  if (!sizeTypeMatch) throw new Error(`${monsterName}: no "_Size Type, Alignment_" line found`)
  const { size, creatureType } = splitSizeAndType(sizeTypeMatch[1].trim())
  const alignment = sizeTypeMatch[2].trim()

  const acMatch = blockText.match(/\*\*AC\*\*\s*(\d+)/)
  if (!acMatch) throw new Error(`${monsterName}: no **AC** line found`)
  const ac = Number(acMatch[1])

  const hpMatch = blockText.match(/\*\*HP\*\*\s*(\d+)\s*\(([^)]+)\)/)
  if (!hpMatch) throw new Error(`${monsterName}: no **HP** line found`)
  const hp = Number(hpMatch[1])
  const hitDice = hpMatch[2].trim()

  const speedMatch = blockText.match(/\*\*Speed\*\*\s*([^\n]+)/)
  if (!speedMatch) throw new Error(`${monsterName}: no **Speed** line found`)
  const speed = speedMatch[1].replace(/<br>\s*$/, '').trim()

  const abilityScores = parseAbilityScores(blockText, monsterName)

  const skillsMatch = blockText.match(/\*\*Skills\*\*\s*([^\n]+)/)
  const senseMatch = blockText.match(/\*\*Senses\*\*\s*([^\n]+)/)
  const langMatch = blockText.match(/\*\*Languages\*\*\s*([^\n]+)/)
  const clean = (m) => (m ? m[1].replace(/<br>\s*$/, '').trim() : undefined)

  const crMatch = blockText.match(/\*\*CR\*\*\s*([^\s(]+)\s*\(XP\s*(\d+)/)
  if (!crMatch) throw new Error(`${monsterName}: no **CR** line found`)
  const cr = crMatch[1].trim()
  const xp = Number(crMatch[2])

  const traitsSection = findSubsection(blockText, subHashes, 'Traits')
  const traits = traitsSection
    ? parseNamedEntries(traitsSection).map(({ name, rawBody }) => ({ name, description: rawBody }))
    : []

  const actionsSection = findSubsection(blockText, subHashes, 'Actions')
  if (!actionsSection) throw new Error(`${monsterName}: no Actions section found`)
  const actionEntries = parseNamedEntries(actionsSection)
  if (actionEntries.length === 0) throw new Error(`${monsterName}: Actions section has no entries`)
  const actions = actionEntries.map(({ name, rawBody }) => parseAction(monsterName, name, rawBody))

  return {
    id: slugify(monsterName),
    name: monsterName,
    size,
    creatureType,
    alignment,
    ac,
    hp,
    hitDice,
    speed,
    abilityScores,
    skills: clean(skillsMatch),
    senses: clean(senseMatch),
    languages: clean(langMatch),
    cr,
    xp,
    traits,
    actions,
    pack: PACK,
    source: { book: BOOK, section: monsterName },
  }
}

function main() {
  const text = fs.readFileSync(SOURCE_PATH, 'utf8').replace(/\r\n/g, '\n')

  // Monster-name headings are "##" or "###" lines whose text isn't one of the
  // subsection names (which reuse the same heading-level vocabulary one
  // level deeper on the *other* origin file's convention, so a bare "level"
  // check alone can't tell them apart from a monster name — the name
  // exclusion is the deciding signal).
  const notSubsection = SUBSECTION_NAMES.join('|')
  const headingRe = new RegExp(`^(#{2,3}) (?!(?:${notSubsection})$)(.+)$`, 'gm')
  const matches = [...text.matchAll(headingRe)]

  const monsters = []
  for (let i = 0; i < matches.length; i++) {
    const m = matches[i]
    const hashes = m[1]
    const name = m[2].trim()
    const start = m.index + m[0].length
    const end = i + 1 < matches.length ? matches[i + 1].index : text.length
    const blockText = text.slice(start, end)
    monsters.push(parseMonsterBlock(name, hashes, blockText))
  }

  const ids = monsters.map((m) => m.id)
  const dupes = ids.filter((id, i) => ids.indexOf(id) !== i)
  if (dupes.length > 0) throw new Error(`Duplicate monster ids: ${dupes.join(', ')}`)

  fs.writeFileSync(OUT_PATH, JSON.stringify(monsters, null, 2))

  console.log(`Source monster headings found: ${matches.length} (${matches.map((m) => m[2].trim()).join(', ')})`)
  console.log(`Parsed monsters: ${monsters.length}`)
  for (const mo of monsters) {
    console.log(
      `  ${mo.name}: CR ${mo.cr} (XP ${mo.xp}), AC ${mo.ac}, HP ${mo.hp} (${mo.hitDice}), ${mo.traits.length} traits, ${mo.actions.length} actions`,
    )
  }
}

main()
