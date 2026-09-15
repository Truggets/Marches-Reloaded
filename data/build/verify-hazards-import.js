// Spot-checks parse-hazards-import.js against a small representative
// fixture (fixtures/hazards-import-sample.json) — mirrors
// verify-spells-import.js/verify-subclasses-import.js's fixture-based style.
'use strict'
const fs = require('fs')
const path = require('path')
const { parseHazardsImport } = require('./parse-hazards-import')

const FIXTURE_PATH = path.join(__dirname, 'fixtures', 'hazards-import-sample.json')

let failures = 0
function check(label, actual, expected) {
  const pass = actual === expected
  if (!pass) failures++
  console.log(`  [${pass ? 'PASS' : 'FAIL'}] ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
}

const vaultDoc = JSON.parse(fs.readFileSync(FIXTURE_PATH, 'utf8'))
const hazards = parseHazardsImport(vaultDoc, 'fixture-pack')

console.log(`Parsed ${hazards.length} hazards/conditions from fixture ${FIXTURE_PATH}`)

console.log('\nBlinded:')
{
  const h = hazards.find((x) => x.name === 'Blinded')
  if (!h) {
    console.log('  [FAIL] entry not found')
    failures++
  } else {
    check('id', h.id, 'fixture-pack:blinded')
    check('category', h.category, 'Condition')
    check(
      'description joins mechanics_first + lore_and_flavor',
      h.description,
      '**Attack Rolls Against You:** Attack rolls against you have Advantage.\n\n**Your Attack Rolls:** Your attack rolls have Disadvantage.\n\nYour vision is completely obscured.',
    )
    check('pack', h.pack, 'fixture-pack')
    check('source.book', h.source.book, "Player's Handbook (2024)")
  }
}

console.log('\nMissing mechanics_first throws, naming the offender:')
{
  let threw = false
  let message = ''
  try {
    parseHazardsImport({ rules_hazards_conditions: [{ name: 'Broken Entry', source: 'Fixture', mechanics_first: [] }] }, 'fixture-pack')
  } catch (err) {
    threw = true
    message = err.message
  }
  check('throws', threw, true)
  check('error names the offending entry', message.includes('Broken Entry'), true)
}

console.log('\nDuplicate ids throw and name both offenders:')
{
  const dupeDoc = {
    rules_hazards_conditions: [
      { name: 'Blinded', source: 'Fixture', mechanics_first: ['First copy.'] },
      { name: 'Blinded', source: 'Fixture', mechanics_first: ['Second copy.'] },
    ],
  }
  let threw = false
  let message = ''
  try {
    parseHazardsImport(dupeDoc, 'fixture-pack')
  } catch (err) {
    threw = true
    message = err.message
  }
  check('throws', threw, true)
  check('error names the duplicate id', message.includes('fixture-pack:blinded'), true)
}

console.log('\nNo duplicate ids in the good fixture:')
{
  const ids = hazards.map((h) => h.id)
  check('no duplicate ids', new Set(ids).size, ids.length)
}

console.log('\nExplicit packId is threaded through:')
{
  const otherPack = parseHazardsImport(vaultDoc, 'some-other-pack')
  check('id uses the given packId', otherPack[0]?.id, 'some-other-pack:blinded')
}

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`)
process.exit(failures === 0 ? 0 : 1)
