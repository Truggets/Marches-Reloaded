// Spot-checks parse-equipment-import.js against a small representative
// fixture (fixtures/equipment-import-sample.json) — mirrors the
// verify-backgrounds-import.js/verify-feats-import.js hand-assertion style.
'use strict'
const fs = require('fs')
const path = require('path')
const { parseEquipmentImport, parseWeaponEntry, parseArmorEntry, parseGearEntry } = require('./parse-equipment-import')

const FIXTURE_PATH = path.join(__dirname, 'fixtures', 'equipment-import-sample.json')

let failures = 0
function check(label, actual, expected) {
  const pass = JSON.stringify(actual) === JSON.stringify(expected)
  if (!pass) failures++
  console.log(`  [${pass ? 'PASS' : 'FAIL'}] ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
}

const vaultDoc = JSON.parse(fs.readFileSync(FIXTURE_PATH, 'utf8'))
const entries = parseEquipmentImport(vaultDoc)
const findEntry = (name) => entries.find((e) => e.name === name)

console.log(`Parsed ${entries.length} equipment entries from fixture ${FIXTURE_PATH}`)

// --- Check 1: weapon fields (damage/mastery/properties/description) ---
console.log('\nDagger (weapon: damage/mastery/properties/description):')
{
  const e = findEntry('Dagger')
  if (!e) {
    console.log('  [FAIL] entry not found')
    failures++
  } else {
    check('id', e.id, 'phb-2024:dagger')
    check('category', e.category, 'weapon')
    check('damage', e.damage, '1d4 Piercing')
    check('mastery', e.mastery, 'Nick')
    check('properties', e.properties, 'Finesse, Light, Thrown (Range 20/60)')
    check('description', e.description, 'Simple Melee Weapons. Damage: 1d4 Piercing. Mastery: Nick')
    check('cost', e.cost, '2 GP')
    check('weight', e.weight, '1 lb.')
    check('pack', e.pack, 'phb-2024')
  }
}

// --- Check 2: armor fields (ac/stealth/strength) with a real Strength requirement ---
console.log('\nChain Mail (armor: ac/strength/stealth, real Strength requirement):')
{
  const e = findEntry('Chain Mail')
  if (!e) {
    console.log('  [FAIL] entry not found')
    failures++
  } else {
    check('category', e.category, 'armor')
    check('ac', e.ac, '16')
    check('strength', e.strength, 'Str 13')
    check('stealth', e.stealth, 'Disadvantage')
    check('properties', e.properties, 'AC: 16; Strength: Str 13; Stealth: Disadvantage')
    check('description', e.description, 'Heavy Armor. 10 Minutes to Don and 5 Minutes to Doff')
  }
}

// --- Check 3: the vault's "—" placeholder becomes undefined, not the literal em-dash ---
console.log('\nPadded Armor ("—" strength placeholder -> undefined):')
{
  const e = findEntry('Padded Armor')
  if (!e) {
    console.log('  [FAIL] entry not found')
    failures++
  } else {
    check('strength is undefined (not "—")', e.strength, undefined)
    check('stealth is populated (real value)', e.stealth, 'Disadvantage')
    check('properties has no leftover em-dash', e.properties.includes('—'), false)
  }
}
console.log('\nLeather Armor (both strength and stealth are "—" -> both undefined):')
{
  const e = findEntry('Leather Armor')
  if (!e) {
    console.log('  [FAIL] entry not found')
    failures++
  } else {
    check('strength is undefined', e.strength, undefined)
    check('stealth is undefined', e.stealth, undefined)
    check('properties omits both', e.properties, 'AC: 11 + Dex modifier')
  }
}

console.log('\nMace (properties: "None" placeholder -> undefined, not the literal string):')
{
  const e = findEntry('Mace')
  if (!e) {
    console.log('  [FAIL] entry not found')
    failures++
  } else {
    check('properties is undefined (not "None")', e.properties, undefined)
    check('damage still populated', e.damage, '1d6 Bludgeoning')
    check('mastery still populated', e.mastery, 'Sap')
  }
}

// --- Check 4: adventuring gear entry ---
console.log("\nHealer's Kit (gear):")
{
  const e = findEntry("Healer's Kit")
  if (!e) {
    console.log('  [FAIL] entry not found')
    failures++
  } else {
    check('category', e.category, 'gear')
    check('cost', e.cost, '5 GP')
    check('weight', e.weight, '3 lb.')
    check('description', e.description, 'Action (Utilize): expend one use of the kit to stabilize a dying creature at 0 HP. Has 10 uses.')
    check('no damage field on gear', e.damage, undefined)
    check('no ac field on gear', e.ac, undefined)
  }
}

// --- Check 5: no duplicate ids within the fixture ---
console.log('\nNo duplicate ids:')
{
  const ids = entries.map((e) => e.id)
  check('no duplicate equipment ids', new Set(ids).size, ids.length)
}

// --- Check 6: a weapon/armor/gear entry missing "name" throws ---
console.log('\nMissing name throws:')
{
  let threw = false
  try {
    parseWeaponEntry({ damage: '1d4 Piercing' }, 'phb-2024')
  } catch (err) {
    threw = true
  }
  check('parseWeaponEntry throws on missing name', threw, true)
}

// --- Check 7: a weapon missing "damage" throws, naming the offender ---
console.log('\nWeapon missing damage throws and names the offender:')
{
  let threw = false
  let message = ''
  try {
    parseWeaponEntry({ name: 'Broken Sword', category: 'Martial Melee Weapons' }, 'phb-2024')
  } catch (err) {
    threw = true
    message = err.message
  }
  check('throws', threw, true)
  check('error names the offending weapon', message.includes('Broken Sword'), true)
  check('error names the missing field', message.includes('damage'), true)
}

// --- Check 8: an armor entry missing "ac" throws, naming the offender ---
console.log('\nArmor missing ac throws and names the offender:')
{
  let threw = false
  let message = ''
  try {
    parseArmorEntry({ name: 'Broken Cuirass', category: 'Heavy Armor' }, 'phb-2024')
  } catch (err) {
    threw = true
    message = err.message
  }
  check('throws', threw, true)
  check('error names the offending armor', message.includes('Broken Cuirass'), true)
  check('error names the missing field', message.includes('ac'), true)
}

// --- Check 9: a gear entry missing "name" throws ---
console.log('\nGear entry missing name throws:')
{
  let threw = false
  try {
    parseGearEntry({ cost: '1 GP' }, 'phb-2024')
  } catch (err) {
    threw = true
  }
  check('parseGearEntry throws on missing name', threw, true)
}

// --- Check 10: duplicate ids across the whole import throw, naming both offenders ---
console.log('\nDuplicate ids (even across categories) throw and name both offenders:')
{
  const dagger = vaultDoc.weapons.find((w) => w.name === 'Dagger')
  const dupeDoc = {
    weapons: [dagger, { ...dagger, name: 'Dagger' }],
    armor: [],
    adventuring_gear: [],
  }
  let threw = false
  let message = ''
  try {
    parseEquipmentImport(dupeDoc)
  } catch (err) {
    threw = true
    message = err.message
  }
  check('throws', threw, true)
  check('error names the duplicate id', message.includes('phb-2024:dagger'), true)
}

// --- Check 11: an explicit packId is actually used, not the hardcoded default ---
console.log('\nExplicit packId is threaded through (not silently hardcoded):')
{
  const entriesFromOtherPack = parseEquipmentImport(vaultDoc, 'some-other-pack')
  const dagger = entriesFromOtherPack.find((e) => e.name === 'Dagger')
  check('id uses the given packId', dagger?.id, 'some-other-pack:dagger')
  check('pack field uses the given packId', dagger?.pack, 'some-other-pack')
}

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`)
process.exit(failures === 0 ? 0 : 1)
