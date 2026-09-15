// Spot-checks parse-subclasses-import.js against a small representative
// fixture (fixtures/subclasses-import-sample.json) — mirrors
// verify-feats-import.js/verify-spells-import.js's fixture-based style.
'use strict'
const fs = require('fs')
const path = require('path')
const { parseSubclassesImport, parseFeatureBullet, VALID_CLASS_IDS } = require('./parse-subclasses-import')

const FIXTURE_PATH = path.join(__dirname, 'fixtures', 'subclasses-import-sample.json')

let failures = 0
function check(label, actual, expected) {
  const pass = actual === expected
  if (!pass) failures++
  console.log(`  [${pass ? 'PASS' : 'FAIL'}] ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
}

// The fixture deliberately includes an Artificer subclass (no home class)
// and a malformed-bullet subclass — both should make the WHOLE pack throw,
// so filter them out for the "does the good path work" checks and test the
// throws separately below.
const goodOnlyDoc = {
  subclasses: JSON.parse(fs.readFileSync(FIXTURE_PATH, 'utf8')).subclasses.filter((s) => s.name === 'Path of the Berserker'),
}
const subclasses = parseSubclassesImport(goodOnlyDoc, 'fixture-pack')
const findSubclass = (name) => subclasses.find((s) => s.name === name)

console.log(`Parsed ${subclasses.length} subclasses from the good-path slice of the fixture`)

// --- Check 1: normal subclass — id, classId slugified, features parsed in order ---
console.log('\nPath of the Berserker (normal subclass):')
{
  const s = findSubclass('Path of the Berserker')
  if (!s) {
    console.log('  [FAIL] subclass not found')
    failures++
  } else {
    check('id', s.id, 'fixture-pack:path-of-the-berserker')
    check('classId', s.classId, 'barbarian')
    check('pack', s.pack, 'fixture-pack')
    check('flavorLine', s.flavorLine, 'Berserkers are barbarians who define their rage by a terrifying, singular focus on violence.')
    check('features.length', s.features.length, 2)
    check('features[0].level', s.features[0].level, 3)
    check('features[0].name', s.features[0].name, 'Frenzy')
    check('features[0].description', s.features[0].description, 'When you enter a Rage, you can make a single melee weapon attack.')
    check('features[1].level', s.features[1].level, 6)
    check('features[1].name', s.features[1].name, 'Mindless Rage')
  }
}

// --- Check 2: parseFeatureBullet directly ---
console.log('\nparseFeatureBullet:')
{
  const parsed = parseFeatureBullet('**Retaliation (Level 10):** You can use your Reaction.')
  check('level', parsed?.level, 10)
  check('name', parsed?.name, 'Retaliation')
  check('description', parsed?.description, 'You can use your Reaction.')
  check('returns null (not a throw) for a non-conforming bullet', parseFeatureBullet('**Ungrouped Rider:** no level here.'), null)
}

// --- Check 3: a subclass for a class the app doesn't have (Artificer) throws, naming the offender ---
console.log('\nArtificer subclass throws and names the offender + the bad class:')
{
  const fullDoc = JSON.parse(fs.readFileSync(FIXTURE_PATH, 'utf8'))
  const artificerOnly = { subclasses: fullDoc.subclasses.filter((s) => s.name === 'Alchemist') }
  let threw = false
  let message = ''
  try {
    parseSubclassesImport(artificerOnly, 'fixture-pack')
  } catch (err) {
    threw = true
    message = err.message
  }
  check('throws', threw, true)
  check('error names the offending subclass', message.includes('Alchemist'), true)
  check('error names the bad class', message.includes('Artificer'), true)
}

// --- Check 4: a malformed mechanics_first bullet throws, naming the offender ---
console.log('\nMalformed bullet throws and names the offender:')
{
  const fullDoc = JSON.parse(fs.readFileSync(FIXTURE_PATH, 'utf8'))
  const malformedOnly = { subclasses: fullDoc.subclasses.filter((s) => s.name === 'Fixture Malformed Subclass') }
  let threw = false
  let message = ''
  try {
    parseSubclassesImport(malformedOnly, 'fixture-pack')
  } catch (err) {
    threw = true
    message = err.message
  }
  check('throws', threw, true)
  check('error names the offending subclass', message.includes('Fixture Malformed Subclass'), true)
}

// --- Check 5: VALID_CLASS_IDS has exactly the 12 bundled classes ---
console.log('\nVALID_CLASS_IDS is exactly the 12 bundled classes:')
{
  check('count', VALID_CLASS_IDS.length, 12)
  check('does not include artificer', VALID_CLASS_IDS.includes('artificer'), false)
}

// --- Check 6: no duplicate ids ---
console.log('\nNo duplicate ids:')
{
  const ids = subclasses.map((s) => s.id)
  check('no duplicate subclass ids', new Set(ids).size, ids.length)
}

// --- Check 7: an explicit packId is actually used, not the hardcoded default ---
console.log('\nExplicit packId is threaded through (not silently hardcoded):')
{
  const subclassesFromOtherPack = parseSubclassesImport(goodOnlyDoc, 'some-other-pack')
  const s = subclassesFromOtherPack.find((sc) => sc.name === 'Path of the Berserker')
  check('id uses the given packId', s?.id, 'some-other-pack:path-of-the-berserker')
  check('pack field uses the given packId', s?.pack, 'some-other-pack')
}

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`)
process.exit(failures === 0 ? 0 : 1)
