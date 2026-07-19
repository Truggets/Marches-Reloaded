// Spot-checks species.json against known SRD 5.2 text read directly from
// character-origins.md. Fails loudly (non-zero exit) on any mismatch.
'use strict'
const fs = require('fs')
const path = require('path')

const SPECIES_PATH = path.join(__dirname, '..', 'species.json')
const species = JSON.parse(fs.readFileSync(SPECIES_PATH, 'utf8'))

let failures = 0
function check(label, cond) {
  if (cond) {
    console.log(`  OK: ${label}`)
  } else {
    console.log(`  FAIL: ${label}`)
    failures++
  }
}

console.log(`Loaded ${species.length} species from ${SPECIES_PATH}`)

// --- Dragonborn ---
console.log('\nDragonborn:')
const dragonborn = species.find((s) => s.name === 'Dragonborn')
check('exists', !!dragonborn)
if (dragonborn) {
  check('id === "dragonborn"', dragonborn.id === 'dragonborn')
  check('creatureType === "Humanoid"', dragonborn.creatureType === 'Humanoid')
  check('speed === "30 feet"', dragonborn.speed === '30 feet')
  check('has 5 traits', dragonborn.traits.length === 5)
  const breathWeapon = dragonborn.traits.find((t) => t.name === 'Breath Weapon')
  check('has Breath Weapon trait', !!breathWeapon)
  check(
    'Breath Weapon description matches SRD text (Cone/Line, DC, damage progression)',
    !!breathWeapon &&
      breathWeapon.description.includes('15-foot Cone or a 30-foot Line that is 5 feet wide') &&
      breathWeapon.description.includes('DC 8 plus your Constitution modifier and Proficiency Bonus') &&
      breathWeapon.description.includes('This damage increases by 1d10 when you reach character levels 5 (2d10), 11 (3d10), and 17 (4d10)'),
  )
  const draconicAncestry = dragonborn.traits.find((t) => t.name === 'Draconic Ancestry')
  check('Draconic Ancestry trait captures the ancestor table (Black/Acid pairing present)', !!draconicAncestry && draconicAncestry.description.includes('Black') && draconicAncestry.description.includes('Acid'))
  check('Draconic Ancestry table captures all 10 dragon types', !!draconicAncestry && ['Black', 'Blue', 'Brass', 'Bronze', 'Copper', 'Gold', 'Green', 'Red', 'Silver', 'White'].every((d) => draconicAncestry.description.includes(d)))
}

// --- Elf ---
console.log('\nElf:')
const elf = species.find((s) => s.name === 'Elf')
check('exists', !!elf)
if (elf) {
  check('id === "elf"', elf.id === 'elf')
  check('size starts with "Medium (about 5–6 feet tall)"', elf.size === 'Medium (about 5–6 feet tall)')
  check('has 5 traits (Darkvision, Elven Lineage, Fey Ancestry, Keen Senses, Trance)', elf.traits.length === 5)
  const lineageNames = elf.traits.map((t) => t.name)
  check(
    'trait names match SRD exactly',
    JSON.stringify(lineageNames) === JSON.stringify(['Darkvision', 'Elven Lineage', 'Fey Ancestry', 'Keen Senses', 'Trance']),
  )
  const elvenLineage = elf.traits.find((t) => t.name === 'Elven Lineage')
  check('Elven Lineage captures all 3 lineages (Drow, High Elf, Wood Elf)', !!elvenLineage && ['Drow', 'High Elf', 'Wood Elf'].every((l) => elvenLineage.description.includes(l)))
  check('Elven Lineage captures Misty Step (Wood Elf... actually High Elf level 5 spell)', !!elvenLineage && elvenLineage.description.includes('Misty Step'))
}

// --- Species count / size sanity across all entries ---
console.log('\nGeneral:')
check('exactly 9 species parsed (Dragonborn, Dwarf, Elf, Gnome, Goliath, Halfling, Human, Orc, Tiefling)', species.length === 9)
check('every species has at least 3 traits', species.every((s) => s.traits.length >= 3))
check('every species has creatureType "Humanoid"', species.every((s) => s.creatureType === 'Humanoid'))
check('every species has non-empty size and speed', species.every((s) => s.size && s.speed))
check('every species has pack "srd-5.2" and source.book "SRD 5.2.1"', species.every((s) => s.pack === 'srd-5.2' && s.source.book === 'SRD 5.2.1'))
check('no trait has an empty description', species.every((s) => s.traits.every((t) => t.description.length > 0)))

// --- Tiefling (the one table-bearing trait not yet spot-checked) ---
console.log('\nTiefling:')
const tiefling = species.find((s) => s.name === 'Tiefling')
check('exists', !!tiefling)
if (tiefling) {
  const fiendishLegacy = tiefling.traits.find((t) => t.name === 'Fiendish Legacy')
  check('has Fiendish Legacy trait', !!fiendishLegacy)
  check(
    'Fiendish Legacy captures all 3 legacies (Abyssal, Chthonic, Infernal)',
    !!fiendishLegacy && ['Abyssal', 'Chthonic', 'Infernal'].every((l) => fiendishLegacy.description.includes(l)),
  )
}

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`)
process.exit(failures === 0 ? 0 : 1)
