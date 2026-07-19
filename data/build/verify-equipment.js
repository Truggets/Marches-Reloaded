// Spot-checks parse-equipment.js output against known SRD 5.2.1 values read
// directly from build/source/equipment.md. Deterministic assertions, no LLM
// transcription — this is a regression guard, not a re-derivation.
'use strict'
const path = require('path')

const OUT_PATH = path.join(__dirname, '..', 'equipment.json')
const equipment = require(OUT_PATH)

let pass = 0
let fail = 0

function findOne(name, category) {
  return equipment.find((e) => e.name === name && e.category === category)
}

function check(label, actual, expected) {
  const ok = actual === expected
  if (ok) {
    pass++
    console.log(`  OK   ${label}: "${actual}"`)
  } else {
    fail++
    console.log(`  FAIL ${label}: expected "${expected}", got "${actual}"`)
  }
}

function checkContains(label, actual, expectedSubstring) {
  const ok = typeof actual === 'string' && actual.includes(expectedSubstring)
  if (ok) {
    pass++
    console.log(`  OK   ${label}: contains "${expectedSubstring}"`)
  } else {
    fail++
    console.log(`  FAIL ${label}: expected to contain "${expectedSubstring}", got "${actual}"`)
  }
}

console.log('=== Spot-check: Longsword (weapon) ===')
console.log('Source (equipment.md Weapons table): Damage 1d8 Slashing, Properties Versatile (1d10),')
console.log('Mastery Sap, Weight 3 lb., Cost 15 GP, under "Martial Melee Weapons".')
{
  const e = findOne('Longsword', 'weapon')
  check('exists', !!e, true)
  if (e) {
    check('cost', e.cost, '15 GP')
    check('weight', e.weight, '3 lb.')
    check('properties', e.properties, 'Versatile (1d10)')
    checkContains('description mentions category', e.description, 'Martial Melee Weapons')
    checkContains('description mentions damage', e.description, '1d8 Slashing')
    checkContains('description mentions mastery', e.description, 'Sap')
  }
}

console.log('\n=== Spot-check: Chain Mail (armor) ===')
console.log('Source (equipment.md Armor table): AC 16, Strength "Str 13", Stealth Disadvantage,')
console.log('Weight 55 lb., Cost 75 GP, under "Heavy Armor (10 Minutes to Don and 5 Minutes to Doff)".')
{
  const e = findOne('Chain Mail', 'armor')
  check('exists', !!e, true)
  if (e) {
    check('cost', e.cost, '75 GP')
    check('weight', e.weight, '55 lb.')
    checkContains('properties mentions AC', e.properties, 'AC: 16')
    checkContains('properties mentions Strength', e.properties, 'Str 13')
    checkContains('properties mentions Stealth', e.properties, 'Disadvantage')
    check('description (sub-category)', e.description, 'Heavy Armor (10 Minutes to Don and 5 Minutes to Doff)')
  }
}

console.log('\n=== Spot-check: Hide Armor (armor, Dex-modifier AC formula) ===')
console.log('Source (equipment.md Armor table): AC "12 + Dex modifier (max 2)", Weight 12 lb.,')
console.log('Cost 10 GP, under "Medium Armor (5 Minutes to Don and 1 Minute to Doff)".')
{
  const e = findOne('Hide Armor', 'armor')
  check('exists', !!e, true)
  if (e) {
    check('cost', e.cost, '10 GP')
    check('weight', e.weight, '12 lb.')
    check('properties (AC formula survives intact, incl. "(max 2)")', e.properties, 'AC: 12 + Dex modifier (max 2)')
    check('description (sub-category)', e.description, 'Medium Armor (5 Minutes to Don and 1 Minute to Doff)')
  }
}

console.log('\n=== Spot-check: Thieves\' Tools (tool) ===')
console.log('Source (equipment.md Tools > Other Tools): cost 25 GP, Ability Dexterity, Weight 1 lb.,')
console.log('Utilize "Pick a lock (DC 15), or disarm a trap (DC 15)", no Craft/Variants line.')
{
  const e = findOne("Thieves' Tools", 'tool')
  check('exists', !!e, true)
  if (e) {
    check('cost', e.cost, '25 GP')
    check('weight', e.weight, '1 lb.')
    check('properties', e.properties, 'Ability: Dexterity')
    checkContains('description mentions Utilize', e.description, 'Pick a lock (DC 15)')
    check('no stray Craft text', /Craft:/.test(e.description || ''), false)
  }
}

console.log('\n=== Spot-check: Healer\'s Kit (gear) ===')
console.log('Source (equipment.md Adventuring Gear table): Weight 3 lb., Cost 5 GP; prose description')
console.log('"A Healer\'s Kit has ten uses..." under #### Healer\'s Kit (5 GP).')
{
  const e = findOne("Healer's Kit", 'gear')
  check('exists', !!e, true)
  if (e) {
    check('cost', e.cost, '5 GP')
    check('weight', e.weight, '3 lb.')
    checkContains('description matches prose', e.description, 'ten uses')
    checkContains('description matches prose', e.description, 'stabilize an Unconscious creature')
  }
}

console.log('\n=== Spot-check: Arrows (gear, from Ammunition sub-table) ===')
console.log('Source (equipment.md Ammunition table): Amount 20, Storage Quiver, Weight 1 lb., Cost 1 GP.')
{
  const e = findOne('Arrows', 'gear')
  check('exists', !!e, true)
  if (e) {
    check('cost', e.cost, '1 GP')
    check('weight', e.weight, '1 lb.')
    checkContains('properties mentions amount', e.properties, 'Amount: 20')
    checkContains('properties mentions storage', e.properties, 'Storage: Quiver')
  }
}

console.log('\n=== Spot-check: Crystal (gear, from Arcane Focuses variant table) ===')
console.log('Source (equipment.md Arcane Focuses table, nested under "Arcane Focus" gear item):')
console.log('Weight 1 lb., Cost 10 GP.')
{
  const e = findOne('Crystal', 'gear')
  check('exists', !!e, true)
  if (e) {
    check('cost', e.cost, '10 GP')
    check('weight', e.weight, '1 lb.')
    checkContains('properties tags parent item', e.properties, 'Variant of: Arcane Focus')
  }
}

console.log('\n=== Spot-check: Amulet (worn or held) (gear, from Holy Symbols variant table) ===')
console.log('Source (equipment.md Holy Symbols table, nested under "Holy Symbol" gear item):')
console.log('Weight 1 lb., Cost 5 GP.')
{
  const e = findOne('Amulet (worn or held)', 'gear')
  check('exists', !!e, true)
  if (e) {
    check('cost', e.cost, '5 GP')
    check('weight', e.weight, '1 lb.')
    checkContains('properties tags parent item', e.properties, 'Variant of: Holy Symbol')
  }
}

console.log('\n=== Coverage sanity checks ===')
check('Coin Values items NOT present (currency, not equipment)', equipment.some((e) => e.name === 'Gold Piece (GP)'), false)
check('Weapon count', equipment.filter((e) => e.category === 'weapon').length, 38)
check('Armor count', equipment.filter((e) => e.category === 'armor').length, 13)
check('Tool count', equipment.filter((e) => e.category === 'tool').length, 25)
check(
  'Gear count (Adventuring Gear table + Ammunition/Arcane Focuses/Druidic Focuses/Holy Symbols variant tables)',
  equipment.filter((e) => e.category === 'gear').length,
  98,
)
check('No "other" category entries emitted', equipment.filter((e) => e.category === 'other').length, 0)
check('All ids unique', new Set(equipment.map((e) => e.id)).size, equipment.length)

console.log(`\n=== Result: ${pass} passed, ${fail} failed (${equipment.length} total entries) ===`)
if (fail > 0) process.exitCode = 1
