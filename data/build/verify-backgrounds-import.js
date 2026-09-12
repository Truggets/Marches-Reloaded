// Spot-checks parse-backgrounds-import.js against a small representative
// fixture (fixtures/backgrounds-import-sample.json) — we don't have access
// to the real vault file, so this exercises the parser's logic directly
// rather than diffing real output. Mirrors the verify-feats-import.js
// hand-assertion style.
'use strict'
const fs = require('fs')
const path = require('path')
const { parseBackgroundsImport, parseBackgroundEntry } = require('./parse-backgrounds-import')

const FIXTURE_PATH = path.join(__dirname, 'fixtures', 'backgrounds-import-sample.json')
const BAD_LABELS_FIXTURE_PATH = path.join(__dirname, 'fixtures', 'backgrounds-import-bad-labels.json')

let failures = 0
function check(label, actual, expected) {
  const pass = JSON.stringify(actual) === JSON.stringify(expected)
  if (!pass) failures++
  console.log(`  [${pass ? 'PASS' : 'FAIL'}] ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
}

const vaultDoc = JSON.parse(fs.readFileSync(FIXTURE_PATH, 'utf8'))
const backgrounds = parseBackgroundsImport(vaultDoc)
const findBackground = (name) => backgrounds.find((b) => b.name === name)

console.log(`Parsed ${backgrounds.length} backgrounds from fixture ${FIXTURE_PATH}`)

// --- Check 1: normal case (2 ability scores, 2 skills, parenthetical feat) ---
console.log('\nChronicler (normal case: 2 ability scores + 2 skills + parenthetical feat):')
{
  const b = findBackground('Chronicler')
  if (!b) {
    console.log('  [FAIL] background not found')
    failures++
  } else {
    check('id', b.id, 'phb-2024:chronicler')
    check('pack', b.pack, 'phb-2024')
    check('source.book', b.source.book, "Player's Handbook (2024)")
    check('abilityScores', b.abilityScores, ['Wisdom', 'Charisma'])
    check('skillProficiencies', b.skillProficiencies, ['Insight', 'History'])
    check('feat', b.feat, 'Magic Initiate (Cleric)')
    check('toolProficiency', b.toolProficiency, "You gain proficiency with Calligrapher's Supplies.")
    check('toolProficiency has no leftover markdown bold markers', b.toolProficiency.includes('**'), false)
    check(
      'equipment',
      b.equipment,
      "You start with Book (blank), Calligrapher's Supplies, Traveler's Clothes, and 15 GP (or you can choose 50 GP instead)."
    )
  }
}

// --- Check 2: 3-ability-score case ---
console.log('\nWanderer (3-ability-score case):')
{
  const b = findBackground('Wanderer')
  if (!b) {
    console.log('  [FAIL] background not found')
    failures++
  } else {
    check('abilityScores', b.abilityScores, ['Dexterity', 'Constitution', 'Wisdom'])
    check('skillProficiencies', b.skillProficiencies, ['Survival', 'Perception'])
    check('feat', b.feat, 'Lucky')
  }
}

// --- Check 3: tool-proficiency-choice-shaped sentence kept verbatim ---
console.log('\nWoodworker (tool proficiency is a choice):')
{
  const b = findBackground('Woodworker')
  if (!b) {
    console.log('  [FAIL] background not found')
    failures++
  } else {
    check('toolProficiency', b.toolProficiency, "You gain proficiency with Artisan's Tools (one type of your choice).")
    check('abilityScores', b.abilityScores, ['Strength', 'Dexterity', 'Intelligence'])
  }
}

// --- Check 4: feat sentence with no parenthetical ---
console.log('\nProdigy (feat without parenthetical):')
{
  const b = findBackground('Prodigy')
  if (!b) {
    console.log('  [FAIL] background not found')
    failures++
  } else {
    check('feat', b.feat, 'Skilled')
    check('id', b.id, 'phb-2024:prodigy')
  }
}

// --- Check 5: every background id is unique within the fixture ---
console.log('\nNo duplicate ids:')
{
  const ids = backgrounds.map((b) => b.id)
  check('no duplicate background ids', new Set(ids).size, ids.length)
}

// --- Check 6: a background missing a required label section throws, naming the offender + label ---
console.log('\nMissing label throws and names the offender + label:')
{
  const badDoc = JSON.parse(fs.readFileSync(BAD_LABELS_FIXTURE_PATH, 'utf8'))
  let threw = false
  let message = ''
  try {
    parseBackgroundsImport(badDoc)
  } catch (err) {
    threw = true
    message = err.message
  }
  check('throws', threw, true)
  check('error names the offending background', message.includes('Incomplete Background'), true)
  check('error names the missing label', message.includes('Tool Proficiency'), true)
}

// --- Check 7: duplicate ids (two backgrounds slugifying to the same id) throw, naming both offenders ---
console.log('\nDuplicate ids throw and name both offenders:')
{
  const chronicler = vaultDoc.backgrounds.find((b) => b.name === 'Chronicler')
  const dupeDoc = {
    backgrounds: [chronicler, { ...chronicler, name: 'Chronicler' }],
  }
  let threw = false
  let message = ''
  try {
    parseBackgroundsImport(dupeDoc)
  } catch (err) {
    threw = true
    message = err.message
  }
  check('throws', threw, true)
  check('error names the duplicate id', message.includes('phb-2024:chronicler'), true)
}

// --- Check 8: an explicit packId is actually used, not the hardcoded default ---
console.log('\nExplicit packId is threaded through (not silently hardcoded):')
{
  const backgroundsFromOtherPack = parseBackgroundsImport(vaultDoc, 'some-other-pack')
  const chronicler = backgroundsFromOtherPack.find((b) => b.name === 'Chronicler')
  check('id uses the given packId', chronicler?.id, 'some-other-pack:chronicler')
  check('pack field uses the given packId', chronicler?.pack, 'some-other-pack')
}

// --- Check 9: a background missing "mechanics" entirely throws ---
console.log('\nMissing mechanics throws:')
{
  let threw = false
  try {
    parseBackgroundEntry({ name: 'Broken Background', source: "Player's Handbook (2024)", mechanics: '' })
  } catch (err) {
    threw = true
  }
  check('throws on empty mechanics', threw, true)
}

// --- Check 10: Ability Scores section with a 4-name bolded list throws (pass-2 shape validation) ---
console.log('\nAbility Scores with 4 names throws:')
{
  const doc = {
    backgrounds: [
      {
        name: 'Malformed Ability List',
        source: "Player's Handbook (2024)",
        mechanics:
          '**Ability Scores:** Increase scores chosen from **Strength, Dexterity, Constitution, and Wisdom** (to a maximum of 20).\n**Skill Proficiencies:** You gain proficiency in the **Insight** and **History** skills.\n**Tool Proficiency:** You gain proficiency with **Herbalism Kit**.\n**Origin Feat:** You gain the **Lucky** feat.\n**Starting Equipment:** You start with **Herbalism Kit and 15 GP** (or you can choose 50 GP instead).',
      },
    ],
  }
  let threw = false
  let message = ''
  try {
    parseBackgroundsImport(doc)
  } catch (err) {
    threw = true
    message = err.message
  }
  check('throws', threw, true)
  check('error names the offending background', message.includes('Malformed Ability List'), true)
  check('error names the "Ability Scores" section', message.includes('Ability Scores'), true)
}

// --- Check 11: Skill Proficiencies section with no bolded skill name throws ---
console.log('\nSkill Proficiencies with no bolded name throws:')
{
  const doc = {
    backgrounds: [
      {
        name: 'No Bolded Skills',
        source: "Player's Handbook (2024)",
        mechanics:
          '**Ability Scores:** Increase scores chosen from **Wisdom and Charisma** (to a maximum of 20).\n**Skill Proficiencies:** You gain proficiency in two skills of your choice.\n**Tool Proficiency:** You gain proficiency with **Herbalism Kit**.\n**Origin Feat:** You gain the **Lucky** feat.\n**Starting Equipment:** You start with **Herbalism Kit and 15 GP** (or you can choose 50 GP instead).',
      },
    ],
  }
  let threw = false
  let message = ''
  try {
    parseBackgroundsImport(doc)
  } catch (err) {
    threw = true
    message = err.message
  }
  check('throws', threw, true)
  check('error names the offending background', message.includes('No Bolded Skills'), true)
  check('error names the "Skill Proficiencies" section', message.includes('Skill Proficiencies'), true)
}

// --- Check 12: Skill Proficiencies section with a bolded span that isn't a real skill name throws ---
console.log('\nSkill Proficiencies with a non-skill bolded span throws:')
{
  const doc = {
    backgrounds: [
      {
        name: 'Fake Skill Name',
        source: "Player's Handbook (2024)",
        mechanics:
          '**Ability Scores:** Increase scores chosen from **Wisdom and Charisma** (to a maximum of 20).\n**Skill Proficiencies:** You gain proficiency in the **Insight** skill and **any other skill of your choice**.\n**Tool Proficiency:** You gain proficiency with **Herbalism Kit**.\n**Origin Feat:** You gain the **Lucky** feat.\n**Starting Equipment:** You start with **Herbalism Kit and 15 GP** (or you can choose 50 GP instead).',
      },
    ],
  }
  let threw = false
  let message = ''
  try {
    parseBackgroundsImport(doc)
  } catch (err) {
    threw = true
    message = err.message
  }
  check('throws', threw, true)
  check('error names the offending background', message.includes('Fake Skill Name'), true)
  check('error names the bogus non-skill span', message.includes('any other skill of your choice'), true)
}

// --- Check 13: Origin Feat section not matching "gain the **X** feat" throws ---
console.log('\nOrigin Feat with unexpected phrasing throws:')
{
  const doc = {
    backgrounds: [
      {
        name: 'Odd Feat Phrasing',
        source: "Player's Handbook (2024)",
        mechanics:
          '**Ability Scores:** Increase scores chosen from **Wisdom and Charisma** (to a maximum of 20).\n**Skill Proficiencies:** You gain proficiency in the **Insight** and **History** skills.\n**Tool Proficiency:** You gain proficiency with **Herbalism Kit**.\n**Origin Feat:** You are granted the **Lucky** feat as a bonus.\n**Starting Equipment:** You start with **Herbalism Kit and 15 GP** (or you can choose 50 GP instead).',
      },
    ],
  }
  let threw = false
  let message = ''
  try {
    parseBackgroundsImport(doc)
  } catch (err) {
    threw = true
    message = err.message
  }
  check('throws', threw, true)
  check('error names the offending background', message.includes('Odd Feat Phrasing'), true)
  check('error names the "Origin Feat" section', message.includes('Origin Feat'), true)
}

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`)
process.exit(failures === 0 ? 0 : 1)
