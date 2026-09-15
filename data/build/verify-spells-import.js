// Spot-checks parse-spells-import.js against a small representative fixture
// (fixtures/spells-import-sample.json) — we don't have access to the real
// vault files at CI/dev time, so this exercises the parser's logic directly
// rather than diffing real output (the 5 real vault files were manually
// spot-checked during #33's build, see docs/planning/issue-33-plan.md).
'use strict'
const fs = require('fs')
const path = require('path')
const { parseSpellsImport, parseLevelAndSchool } = require('./parse-spells-import')

const FIXTURE_PATH = path.join(__dirname, 'fixtures', 'spells-import-sample.json')

let failures = 0
function check(label, actual, expected) {
  const pass = actual === expected
  if (!pass) failures++
  console.log(`  [${pass ? 'PASS' : 'FAIL'}] ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
}

const vaultDoc = JSON.parse(fs.readFileSync(FIXTURE_PATH, 'utf8'))
const spells = parseSpellsImport(vaultDoc, 'fixture-pack')
const findSpell = (name) => spells.find((s) => s.name === name)

console.log(`Parsed ${spells.length} spells from fixture ${FIXTURE_PATH}`)

// --- Check 1: cantrip level/school split, no higherLevels, description = mechanics + lore ---
console.log('\nBooming Blade (cantrip, no higherLevels):')
{
  const s = findSpell('Booming Blade')
  if (!s) {
    console.log('  [FAIL] spell not found')
    failures++
  } else {
    check('id', s.id, 'fixture-pack:booming-blade')
    check('level', s.level, 0)
    check('school', s.school, 'Evocation')
    check('concentration', s.concentration, false)
    check('ritual', s.ritual, false)
    check('higherLevels', s.higherLevels, undefined)
    check(
      'description joins mechanics_first + lore_and_flavor',
      s.description,
      '**Melee Weapon Attack:** you must make a melee attack with a weapon.\n\n**Sheathing Sound:** on a hit, the target becomes sheathed in booming energy.\n\nA favorite cantrip of arcane tricksters.',
    )
    check('source.book strips trailing .md', s.source.book, 'Fixture Sourcebook')
  }
}

// --- Check 2: leveled spell, concentration true, higherLevels extracted out of description ---
console.log('\nFixture Mind Whip (leveled, concentration, higherLevels extracted):')
{
  const s = findSpell('Fixture Mind Whip')
  if (!s) {
    console.log('  [FAIL] spell not found')
    failures++
  } else {
    check('level', s.level, 2)
    check('school', s.school, 'Enchantment')
    check('concentration', s.concentration, true)
    check('ritual', s.ritual, false)
    check(
      'higherLevels captured without the "**At Higher Levels:**" label',
      s.higherLevels,
      'you can target one additional creature for each slot level above 2nd.',
    )
    check(
      'description does NOT include the higherLevels bullet',
      s.description.includes('At Higher Levels'),
      false,
    )
    // The fixture's "At Higher Levels" bullet is NOT last — a bullet after
    // it ("Aftermath") must still survive into description, proving the
    // extraction works by index (findIndex + two-sided slice), not just by
    // "drop everything from the last bullet onward".
    check(
      'a later bullet (after the extracted one) still survives into description',
      s.description.includes('Aftermath'),
      true,
    )
  }
}

// --- Check 3: ritual true ---
console.log('\nFixture Ritual Spell (ritual: true):')
{
  const s = findSpell('Fixture Ritual Spell')
  if (!s) {
    console.log('  [FAIL] spell not found')
    failures++
  } else {
    check('ritual', s.ritual, true)
    check('concentration', s.concentration, false)
    check('level', s.level, 1)
    check('school', s.school, 'Divination')
  }
}

// --- Check 4: parseLevelAndSchool handles both cantrip phrasings seen in the real vault files ---
console.log('\nparseLevelAndSchool (both cantrip phrasings):')
{
  check('with "(0 Level)" suffix', JSON.stringify(parseLevelAndSchool('Necromancy Cantrip (0 Level)')), JSON.stringify({ level: 0, school: 'Necromancy' }))
  check('without the suffix', JSON.stringify(parseLevelAndSchool('Necromancy Cantrip')), JSON.stringify({ level: 0, school: 'Necromancy' }))
  check('unparseable string returns null, not a throw', parseLevelAndSchool('Not A Real Level String'), null)
}

// --- Check 5: unrecognized concentration/ritual value throws, naming the offender ---
console.log('\nUnrecognized concentration value throws and names the offender:')
{
  const badDoc = {
    spells: [
      {
        name: 'Broken Spell',
        level: '1st-Level Evocation',
        casting_time: 'Action',
        range: 'Self',
        components: 'V',
        duration: 'Instantaneous',
        concentration: 'Maybe',
        ritual: 'No',
        classes: ['Wizard'],
        mechanics_first: ['Some effect.'],
      },
    ],
  }
  let threw = false
  let message = ''
  try {
    parseSpellsImport(badDoc, 'fixture-pack')
  } catch (err) {
    threw = true
    message = err.message
  }
  check('throws', threw, true)
  check('error names the offending spell', message.includes('Broken Spell'), true)
  check('error names the bad value', message.includes('Maybe'), true)
}

// --- Check 6: unparseable level string throws, naming the offender ---
console.log('\nUnparseable level string throws and names the offender:')
{
  const badDoc = {
    spells: [
      {
        name: 'Mystery Spell',
        level: 'Somewhere in the middle',
        casting_time: 'Action',
        range: 'Self',
        components: 'V',
        duration: 'Instantaneous',
        concentration: 'No',
        ritual: 'No',
        classes: ['Wizard'],
        mechanics_first: ['Some effect.'],
      },
    ],
  }
  let threw = false
  let message = ''
  try {
    parseSpellsImport(badDoc, 'fixture-pack')
  } catch (err) {
    threw = true
    message = err.message
  }
  check('throws', threw, true)
  check('error names the offending spell', message.includes('Mystery Spell'), true)
}

// --- Check 7: no duplicate ids within the parsed fixture ---
console.log('\nNo duplicate ids:')
{
  const ids = spells.map((s) => s.id)
  check('no duplicate spell ids', new Set(ids).size, ids.length)
}

// --- Check 8: duplicate ids across two spells throw, naming both offenders ---
console.log('\nDuplicate ids throw and name both offenders:')
{
  const dupeDoc = {
    source: 'Fixture.md',
    spells: [
      { name: 'Fireball', level: '3rd-Level Evocation', casting_time: 'Action', range: '150 feet', components: 'V, S, M', duration: 'Instantaneous', concentration: 'No', ritual: 'No', classes: ['Wizard'], mechanics_first: ['First copy.'] },
      { name: 'Fireball', level: '3rd-Level Evocation', casting_time: 'Action', range: '150 feet', components: 'V, S, M', duration: 'Instantaneous', concentration: 'No', ritual: 'No', classes: ['Wizard'], mechanics_first: ['Second copy, same slug.'] },
    ],
  }
  let threw = false
  let message = ''
  try {
    parseSpellsImport(dupeDoc, 'fixture-pack')
  } catch (err) {
    threw = true
    message = err.message
  }
  check('throws', threw, true)
  check('error names the duplicate id', message.includes('fixture-pack:fireball'), true)
}

// --- Check 9: an explicit packId is actually used, not the hardcoded default ---
console.log('\nExplicit packId is threaded through (not silently hardcoded):')
{
  const spellsFromOtherPack = parseSpellsImport(vaultDoc, 'some-other-pack')
  const s = spellsFromOtherPack.find((sp) => sp.name === 'Booming Blade')
  check('id uses the given packId', s?.id, 'some-other-pack:booming-blade')
  check('pack field uses the given packId', s?.pack, 'some-other-pack')
}

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`)
process.exit(failures === 0 ? 0 : 1)
