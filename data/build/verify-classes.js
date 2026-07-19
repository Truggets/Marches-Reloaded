// Reconciles ClassFeatureTableRow feature names against parsed Feature[]
// descriptions — every named feature in the level table should have a
// matching prose block (except the "Subclass feature" placeholder, which
// is deliberately generic and resolved via the class's subclasses[]).
'use strict'
const fs = require('fs')
const path = require('path')

const classes = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'classes.json'), 'utf8'))

let totalMissing = 0
for (const c of classes) {
  // Table entries sometimes append a per-level qualifier not present in the
  // description heading, e.g. "Action Surge (one use)" -> heading "Action Surge".
  const baseName = (n) => n.replace(/\s*\([^)]*\)\s*$/, '').trim()
  const describedNames = new Set(c.features.map((f) => f.name))
  const tableNames = new Set()
  for (const row of c.featureTable) {
    for (const name of row.features) {
      if (name === 'Subclass feature') continue
      tableNames.add(name)
    }
  }
  const missing = [...tableNames].filter((n) => !describedNames.has(n) && !describedNames.has(baseName(n)))
  if (missing.length > 0) {
    totalMissing += missing.length
    console.log(`${c.name}: MISSING descriptions for: ${missing.join(', ')}`)
  }
}
console.log(totalMissing === 0 ? 'All table-referenced features have matching descriptions.' : `${totalMissing} missing.`)

// Spot checks
function assertEq(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}: got ${JSON.stringify(actual)}${ok ? '' : `, expected ${JSON.stringify(expected)}`}`)
}

const barbarian = classes.find((c) => c.id === 'barbarian')
assertEq('Barbarian L1 features', barbarian.featureTable.find((r) => r.level === 1).features, ['Rage', 'Unarmored Defense', 'Weapon Mastery'])
assertEq('Barbarian L5 features', barbarian.featureTable.find((r) => r.level === 5).features, ['Extra Attack', 'Fast Movement'])
assertEq('Barbarian subclass count', barbarian.subclasses.length, 1)
assertEq('Barbarian subclass name', barbarian.subclasses[0].name, 'Path of the Berserker')

const wizard = classes.find((c) => c.id === 'wizard')
assertEq('Wizard is caster', Boolean(wizard.spellSlotTable), true)
assertEq('Wizard L1 slot-1 slots', wizard.spellSlotTable.find((r) => r.level === 1).slotsByLevel[1], 2)
assertEq('Wizard L1 slot-2 slots', wizard.spellSlotTable.find((r) => r.level === 1).slotsByLevel[2], 0)
