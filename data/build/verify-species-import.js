// Spot-checks parse-species-import.js against a small representative fixture
// (fixtures/species-import-sample.json) — mirrors the verify-backgrounds-
// import.js hand-assertion style.
'use strict'
const fs = require('fs')
const path = require('path')
const { parseSpeciesImport, parseSpeciesEntry } = require('./parse-species-import')

const FIXTURE_PATH = path.join(__dirname, 'fixtures', 'species-import-sample.json')
const BAD_VERSATILE_FIXTURE_PATH = path.join(__dirname, 'fixtures', 'species-import-bad-versatile.json')

let failures = 0
function check(label, actual, expected) {
  const pass = JSON.stringify(actual) === JSON.stringify(expected)
  if (!pass) failures++
  console.log(`  [${pass ? 'PASS' : 'FAIL'}] ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
}

const vaultDoc = JSON.parse(fs.readFileSync(FIXTURE_PATH, 'utf8'))
const species = parseSpeciesImport(vaultDoc)
const findSpecies = (name) => species.find((s) => s.name === name)

console.log(`Parsed ${species.length} species from fixture ${FIXTURE_PATH}`)

// --- Check 1: normal case (2-3 generic traits, clean top-level fields) ---
console.log('\nStonewrought (normal case: generic traits + clean top-level fields):')
{
  const s = findSpecies('Stonewrought')
  if (!s) {
    console.log('  [FAIL] species not found')
    failures++
  } else {
    check('id', s.id, 'phb-2024:stonewrought')
    check('pack', s.pack, 'phb-2024')
    check('source.book', s.source.book, 'Homebrew Compendium')
    check('creatureType', s.creatureType, 'Construct')
    check('size', s.size, 'Medium (typically 6 feet tall, built of jointed stone)')
    check('speed', s.speed, '25 feet')
    check('trait count', s.traits.length, 3)
    check(
      'trait names',
      s.traits.map((t) => t.name),
      ['Stone Body', 'Ponderous Step', 'Granite Fists']
    )
    check(
      'Stone Body description',
      s.traits[0].description,
      "You have **Resistance to Poison damage**, and you don't need to eat, drink, or breathe."
    )
  }
}

// --- Check 2: Human-shaped rename case ---
console.log('\nSunfolk (Human-shaped Versatile Traits rename case):')
{
  const s = findSpecies('Sunfolk')
  if (!s) {
    console.log('  [FAIL] species not found')
    failures++
  } else {
    check(
      'trait names renamed to Skillful/Versatile',
      s.traits.map((t) => t.name),
      ['Skillful', 'Versatile']
    )
    const rawJson = JSON.stringify(s)
    check('original vault name "Versatile Traits - Skilled" does not appear anywhere', rawJson.includes('Versatile Traits - Skilled'), false)
    check(
      'original vault name "Versatile Traits - Origin Feat" does not appear anywhere',
      rawJson.includes('Versatile Traits - Origin Feat'),
      false
    )
  }
}

// --- Check 3: markdown-heavy trait description survives verbatim ---
console.log('\nEmberkin (markdown-heavy description preserved verbatim):')
{
  const s = findSpecies('Emberkin')
  if (!s) {
    console.log('  [FAIL] species not found')
    failures++
  } else {
    const trait = s.traits.find((t) => t.name === 'Cinder Aura')
    check('trait found', !!trait, true)
    check('description contains bold markers', trait?.description.includes('**'), true)
    check('description contains italic markers', trait?.description.includes('_'), true)
    check(
      'description kept verbatim',
      trait?.description,
      '*Whenever* you take damage, you may spend a Reaction to **deal 1d4 Fire damage** to the attacker, but only if you have not done so since your last _long rest_. This is a **signature trait** of the Emberkin — some scholars believe it is tied to an *ember-spark* passed down since the Sundering, though the true origin remains **hotly debated** among Emberkin elders.'
    )
  }
}

// --- Check 4: Elven-Lineage-shaped case (multi-paragraph, embedded sub-choice, not further parsed) ---
console.log('\nTidesworn (Elven-Lineage-shaped multi-paragraph trait, not further parsed):')
{
  const s = findSpecies('Tidesworn')
  if (!s) {
    console.log('  [FAIL] species not found')
    failures++
  } else {
    const trait = s.traits.find((t) => t.name === 'Tidal Lineage')
    check('trait found', !!trait, true)
    check('description is one single descriptive block (not split into sub-traits)', s.traits.filter((t) => t.name.includes('Lineage')).length, 1)
    check('description contains the embedded sub-choice markers', trait?.description.includes('*   **Deepwater Lineage:**'), true)
    check('description contains the embedded sub-choice markers (2nd)', trait?.description.includes('*   **Stormwave Lineage:**'), true)
    check('description retains trailing prose after the sub-choice list', trait?.description.includes('Regardless of lineage'), true)
  }
}

// --- Check 5: every species id is unique within the fixture ---
console.log('\nNo duplicate ids:')
{
  const ids = species.map((s) => s.id)
  check('no duplicate species ids', new Set(ids).size, ids.length)
}

// --- Check 6: an unrecognized "Versatile Traits - X" variant throws, naming the species + bad trait name ---
console.log('\nUnrecognized Versatile Traits variant throws and names the offender + trait name:')
{
  const badDoc = JSON.parse(fs.readFileSync(BAD_VERSATILE_FIXTURE_PATH, 'utf8'))
  let threw = false
  let message = ''
  try {
    parseSpeciesImport(badDoc)
  } catch (err) {
    threw = true
    message = err.message
  }
  check('throws', threw, true)
  check('error names the offending species', message.includes('Sunfolk'), true)
  check('error names the unrecognized trait name', message.includes('Versatile Traits - Bonus Language'), true)
}

// --- Check 7: duplicate ids (two species slugifying to the same id) throw, naming both offenders ---
console.log('\nDuplicate ids throw and name both offenders:')
{
  const stonewrought = vaultDoc.species.find((s) => s.name === 'Stonewrought')
  const dupeDoc = {
    species: [stonewrought, { ...stonewrought, name: 'Stonewrought' }],
  }
  let threw = false
  let message = ''
  try {
    parseSpeciesImport(dupeDoc)
  } catch (err) {
    threw = true
    message = err.message
  }
  check('throws', threw, true)
  check('error names the duplicate id', message.includes('phb-2024:stonewrought'), true)
}

// --- Check 8: an explicit packId is actually used, not the hardcoded default ---
console.log('\nExplicit packId is threaded through (not silently hardcoded):')
{
  const speciesFromOtherPack = parseSpeciesImport(vaultDoc, 'some-other-pack')
  const stonewrought = speciesFromOtherPack.find((s) => s.name === 'Stonewrought')
  check('id uses the given packId', stonewrought?.id, 'some-other-pack:stonewrought')
  check('pack field uses the given packId', stonewrought?.pack, 'some-other-pack')
}

// --- Check 9: missing "mechanics_first" entirely throws ---
console.log('\nMissing mechanics_first throws:')
{
  let threw = false
  try {
    parseSpeciesEntry({ name: 'Broken Species', source: 'Homebrew Compendium' })
  } catch (err) {
    threw = true
  }
  check('throws on missing mechanics_first', threw, true)
}

// --- Check 10: empty "mechanics_first" array throws ---
console.log('\nEmpty mechanics_first array throws:')
{
  let threw = false
  try {
    parseSpeciesEntry({ name: 'Empty Species', source: 'Homebrew Compendium', mechanics_first: [] })
  } catch (err) {
    threw = true
  }
  check('throws on empty mechanics_first', threw, true)
}

// --- Check 11: a mechanics_first item that doesn't match "**Label:** rest" throws, naming the offender + item ---
console.log('\nMalformed mechanics_first item throws and names the offender + item:')
{
  const doc = {
    species: [
      {
        name: 'Malformed Species',
        source: 'Homebrew Compendium',
        mechanics_first: [
          '**Creature Type:** You are a **Humanoid**.',
          '**Size:** Your size is **Medium**.',
          '**Speed:** Your walking speed is **30 feet**.',
          'Just a plain trait sentence with no bolded label at all.',
        ],
      },
    ],
  }
  let threw = false
  let message = ''
  try {
    parseSpeciesImport(doc)
  } catch (err) {
    threw = true
    message = err.message
  }
  check('throws', threw, true)
  check('error names the offending species', message.includes('Malformed Species'), true)
  check(
    'error names the malformed item',
    message.includes('Just a plain trait sentence with no bolded label at all.'),
    true
  )
}

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`)
process.exit(failures === 0 ? 0 : 1)
