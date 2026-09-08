// Spot-checks parse-feats-import.js against a small representative fixture
// (fixtures/feats-import-sample.json) — we don't have access to the real
// vault file, so this exercises the parser's logic directly rather than
// diffing real output. Mirrors the verify-feats.js hand-assertion style.
'use strict'
const fs = require('fs')
const path = require('path')
const { parseFeatsImport, parseFeatEntry, VALID_CATEGORIES, REPEATABLE_ALLOWLIST } = require('./parse-feats-import')

const FIXTURE_PATH = path.join(__dirname, 'fixtures', 'feats-import-sample.json')
const BAD_CATEGORY_FIXTURE_PATH = path.join(__dirname, 'fixtures', 'feats-import-bad-category.json')

let failures = 0
function check(label, actual, expected) {
  const pass = actual === expected
  if (!pass) failures++
  console.log(`  [${pass ? 'PASS' : 'FAIL'}] ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
}

const vaultDoc = JSON.parse(fs.readFileSync(FIXTURE_PATH, 'utf8'))
const feats = parseFeatsImport(vaultDoc)
const findFeat = (name) => feats.find((f) => f.name === name)

console.log(`Parsed ${feats.length} feats from fixture ${FIXTURE_PATH}`)

// --- Check 1: normal Origin feat (Alert) — namespaced id, pack, source, benefit verbatim ---
console.log('\nAlert (normal Origin feat):')
{
  const f = findFeat('Alert')
  if (!f) {
    console.log('  [FAIL] feat not found')
    failures++
  } else {
    check('id', f.id, 'phb-2024:alert')
    check('pack', f.pack, 'phb-2024')
    check('category', f.category, 'Origin')
    check('prerequisite', f.prerequisite, undefined)
    check('repeatable', f.repeatable, false)
    check('source.book', f.source.book, "Player's Handbook (2024)")
    const vaultEntry = vaultDoc.feats.find((v) => v.name === 'Alert')
    check('benefit is verbatim mechanics text (untouched markdown)', f.benefit, vaultEntry.mechanics)
  }
}

// --- Check 2: "General / Racial" category mapping (Fade Away) ---
console.log('\nFade Away ("General / Racial" category):')
{
  const f = findFeat('Fade Away')
  if (!f) {
    console.log('  [FAIL] feat not found')
    failures++
  } else {
    check('category', f.category, 'General / Racial')
    check('id', f.id, 'phb-2024:fade-away')
    check('prerequisite passes through unchanged (not "None")', f.prerequisite, 'Gnome')
    check('repeatable', f.repeatable, false)
  }
}

// --- Check 3: "None" prerequisite maps to undefined, not the string "None" ---
console.log('\nCrafter (prerequisite "None" -> undefined):')
{
  const f = findFeat('Crafter')
  if (!f) {
    console.log('  [FAIL] feat not found')
    failures++
  } else {
    check('prerequisite', f.prerequisite, undefined)
    check('prerequisite is not the literal string "None"', f.prerequisite !== 'None', true)
  }
}

// --- Check 3b: a real (non-"None") prerequisite passes through as-is ---
console.log('\nWeapon Master (real prerequisite passes through):')
{
  const f = findFeat('Weapon Master')
  if (!f) {
    console.log('  [FAIL] feat not found')
    failures++
  } else {
    check('prerequisite', f.prerequisite, 'Level 4+')
    check('repeatable', f.repeatable, false)
  }
}

// --- Check 4: Magic Initiate repeatable allowlist ---
console.log('\nMagic Initiate (repeatable allowlist):')
{
  const f = findFeat('Magic Initiate')
  if (!f) {
    console.log('  [FAIL] feat not found')
    failures++
  } else {
    check('repeatable', f.repeatable, true)
    check('id', f.id, 'phb-2024:magic-initiate')
    check('category', f.category, 'General')
  }
}
check('REPEATABLE_ALLOWLIST contains exactly "Magic Initiate"', [...REPEATABLE_ALLOWLIST].join(','), 'Magic Initiate')

// --- Check 5: no duplicate ids within the parsed fixture ---
console.log('\nNo duplicate ids:')
{
  const ids = feats.map((f) => f.id)
  check('no duplicate feat ids', new Set(ids).size, ids.length)
}

// --- Check 6: every parsed feat's category is one of the 5 valid values ---
console.log('\nAll categories valid:')
{
  const allValid = feats.every((f) => VALID_CATEGORIES.includes(f.category))
  check('every parsed category is in VALID_CATEGORIES', allValid, true)
}

// --- Check 7: unrecognized category throws, naming the offending feat ---
console.log('\nUnrecognized category throws and names the offender:')
{
  const badDoc = JSON.parse(fs.readFileSync(BAD_CATEGORY_FIXTURE_PATH, 'utf8'))
  let threw = false
  let message = ''
  try {
    parseFeatsImport(badDoc)
  } catch (err) {
    threw = true
    message = err.message
  }
  check('throws', threw, true)
  check('error names the offending feat', message.includes('Mystery Feat'), true)
  check('error names the bad category value', message.includes('Legendary'), true)
}

// --- Check 8: a feat missing "mechanics" throws rather than emitting a blank benefit ---
console.log('\nMissing mechanics throws:')
{
  let threw = false
  try {
    parseFeatEntry({ name: 'Broken Feat', category: 'Origin', source: 'Player\'s Handbook (2024)', prerequisite: 'None', mechanics: '' })
  } catch (err) {
    threw = true
  }
  check('throws on empty mechanics', threw, true)
}

// --- Check 9: colliding ids (two feats slugifying to the same id) throw, naming both offenders ---
console.log('\nDuplicate ids throw and name both offenders:')
{
  const dupeDoc = {
    feats: [
      { name: 'Alert', category: 'Origin', source: "Player's Handbook (2024)", prerequisite: 'None', mechanics: 'First copy.' },
      { name: 'Alert', category: 'Origin', source: "Player's Handbook (2024)", prerequisite: 'None', mechanics: 'Second copy, same slug.' },
    ],
  }
  let threw = false
  let message = ''
  try {
    parseFeatsImport(dupeDoc)
  } catch (err) {
    threw = true
    message = err.message
  }
  check('throws', threw, true)
  check('error names the duplicate id', message.includes('phb-2024:alert'), true)
}

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`)
process.exit(failures === 0 ? 0 : 1)
