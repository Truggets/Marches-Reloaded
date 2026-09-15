// Spot-checks parse-magic-items-import.js against a small representative
// fixture (fixtures/magic-items-import-sample.json) — mirrors
// verify-hazards-import.js's fixture-based style.
'use strict'
const fs = require('fs')
const path = require('path')
const { parseMagicItemsImport } = require('./parse-magic-items-import')

const FIXTURE_PATH = path.join(__dirname, 'fixtures', 'magic-items-import-sample.json')

let failures = 0
function check(label, actual, expected) {
  const pass = actual === expected
  if (!pass) failures++
  console.log(`  [${pass ? 'PASS' : 'FAIL'}] ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
}

const vaultDoc = JSON.parse(fs.readFileSync(FIXTURE_PATH, 'utf8'))
const items = parseMagicItemsImport(vaultDoc, 'fixture-pack')

console.log(`Parsed ${items.length} magic items from fixture ${FIXTURE_PATH}`)

console.log("\nDragon's Wrath Weapon:")
{
  const i = items.find((x) => x.name === "Dragon's Wrath Weapon")
  if (!i) {
    console.log('  [FAIL] entry not found')
    failures++
  } else {
    check('id', i.id, 'fixture-pack:dragon-s-wrath-weapon')
    check('category', i.category, 'Dragon Hoard Item')
    check('rarity', i.rarity, 'Varies (Slumbering to Ascendant)')
    check('attunement', i.attunement, 'Required')
    check(
      'description joins mechanics_first + lore_and_flavor',
      i.description,
      '**Weapon Type:** Any sword, axe, spear, or ranged weapon.\n\n**Slumbering State (Uncommon):** Whenever you roll a 20 on an attack roll with this weapon, each creature of your choice within 5 feet of the target takes 5 damage.\n\nA weapon infused with the essence of a dragon.',
    )
  }
}

console.log('\nThe Deck of Many Things (leading "*   " list-marker bullets normalized to "-"):')
{
  const i = items.find((x) => x.name === 'The Deck of Many Things')
  if (!i) {
    console.log('  [FAIL] entry not found')
    failures++
  } else {
    check(
      'description normalizes "*   **X:**" list markers to "-   **X:**" so renderEmphasis never sees a stray leading "*"',
      i.description,
      '**Unabridged Card Effects (Selection of Fates):**\n\n-   **Balance:** Your mind undergoes a sudden alignment shift.\n\n-   **Comet:** If you single-handedly defeat the next hostile monster, your level instantly increases by 1.\n\nA legendary packet of parchment cards.',
    )
  }
}

console.log('\nMissing mechanics_first throws, naming the offender:')
{
  let threw = false
  let message = ''
  try {
    parseMagicItemsImport({ items: [{ name: 'Broken Item', source: 'Fixture', mechanics_first: [] }] }, 'fixture-pack')
  } catch (err) {
    threw = true
    message = err.message
  }
  check('throws', threw, true)
  check('error names the offending item', message.includes('Broken Item'), true)
}

console.log('\nDuplicate ids throw and name both offenders:')
{
  const dupeDoc = {
    items: [
      { name: 'Ring of Power', source: 'Fixture', mechanics_first: ['First copy.'] },
      { name: 'Ring of Power', source: 'Fixture', mechanics_first: ['Second copy.'] },
    ],
  }
  let threw = false
  let message = ''
  try {
    parseMagicItemsImport(dupeDoc, 'fixture-pack')
  } catch (err) {
    threw = true
    message = err.message
  }
  check('throws', threw, true)
  check('error names the duplicate id', message.includes('fixture-pack:ring-of-power'), true)
}

console.log('\nOptional fields (rarity/attunement) are undefined when absent, not empty strings:')
{
  const noRarity = parseMagicItemsImport(
    { items: [{ name: 'Bare Item', source: 'Fixture', mechanics_first: ['Does a thing.'] }] },
    'fixture-pack',
  )
  check('rarity is undefined', noRarity[0].rarity, undefined)
  check('attunement is undefined', noRarity[0].attunement, undefined)
}

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`)
process.exit(failures === 0 ? 0 : 1)
