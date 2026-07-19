// Spot-checks parsed feats.json against known values read directly from
// build/source/feats.md, to catch silent mis-extraction.
'use strict'
const fs = require('fs')
const path = require('path')

const FEATS_PATH = path.join(__dirname, '..', 'feats.json')
const feats = JSON.parse(fs.readFileSync(FEATS_PATH, 'utf8'))

function findFeat(name) {
  return feats.find((f) => f.name === name)
}

let failures = 0
function check(label, actual, expected) {
  const pass = actual === expected
  if (!pass) failures++
  console.log(`  [${pass ? 'PASS' : 'FAIL'}] ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
}

console.log(`Loaded ${feats.length} feats from ${FEATS_PATH}`)

// --- Spot check 1: Grappler (General) ---
// Source: "_General Feat (Prerequisite: Level 4+, Strength or Dexterity 13+)_"
// No "_Repeatable._" paragraph in its body -> repeatable: false.
console.log('\nGrappler:')
{
  const f = findFeat('Grappler')
  if (!f) {
    console.log('  [FAIL] feat not found')
    failures++
  } else {
    check('category', f.category, 'General')
    check('prerequisite', f.prerequisite, 'Level 4+, Strength or Dexterity 13+')
    check('repeatable', f.repeatable, false)
    check('id', f.id, 'grappler')
  }
}

// --- Spot check 2: Boon of Spell Recall (Epic Boon) ---
// Source: "_Epic Boon Feat (Prerequisite: Level 19+, Spellcasting Feature)_"
// No "_Repeatable._" paragraph -> repeatable: false.
console.log('\nBoon of Spell Recall:')
{
  const f = findFeat('Boon of Spell Recall')
  if (!f) {
    console.log('  [FAIL] feat not found')
    failures++
  } else {
    check('category', f.category, 'Epic Boon')
    check('prerequisite', f.prerequisite, 'Level 19+, Spellcasting Feature')
    check('repeatable', f.repeatable, false)
    check('id', f.id, 'boon-of-spell-recall')
  }
}

// --- Spot check 3: Ability Score Improvement (General) ---
// Source: "_General Feat (Prerequisite: Level 4+)_" ... "_Repeatable._ You can take this feat more than once."
console.log('\nAbility Score Improvement:')
{
  const f = findFeat('Ability Score Improvement')
  if (!f) {
    console.log('  [FAIL] feat not found')
    failures++
  } else {
    check('category', f.category, 'General')
    check('prerequisite', f.prerequisite, 'Level 4+')
    check('repeatable', f.repeatable, true)
  }
}

// --- Spot check 4: Archery (Fighting Style) — no comma-separated prereq ---
// Source: "_Fighting Style Feat (Prerequisite: Fighting Style Feature)_", no Repeatable section.
console.log('\nArchery:')
{
  const f = findFeat('Archery')
  if (!f) {
    console.log('  [FAIL] feat not found')
    failures++
  } else {
    check('category', f.category, 'Fighting Style')
    check('prerequisite', f.prerequisite, 'Fighting Style Feature')
    check('repeatable', f.repeatable, false)
  }
}

// --- Spot check 5: Alert (Origin) — no prerequisite at all ---
// Source: "_Origin Feat_" with no parenthetical prerequisite.
console.log('\nAlert:')
{
  const f = findFeat('Alert')
  if (!f) {
    console.log('  [FAIL] feat not found')
    failures++
  } else {
    check('category', f.category, 'Origin')
    check('prerequisite', f.prerequisite, undefined)
    check('repeatable', f.repeatable, false)
  }
}

// --- Spot check 6: benefit text boundaries (Skilled) ---
// Source body starts "You gain proficiency..." and ends with the Repeatable
// sentence, with no leakage of the next "### General Feats" heading.
console.log('\nSkilled (benefit boundaries):')
{
  const f = findFeat('Skilled')
  if (!f) {
    console.log('  [FAIL] feat not found')
    failures++
  } else {
    const startsOk = f.benefit.startsWith('You gain proficiency in any combination of three skills or tools of your choice.')
    const endsOk = f.benefit.endsWith('_Repeatable._ You can take this feat more than once.')
    const noLeak = !f.benefit.includes('###') && !f.benefit.includes('General Feats')
    check('starts correctly', startsOk, true)
    check('ends correctly', endsOk, true)
    check('no heading leakage', noLeak, true)
  }
}

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`)
process.exit(failures === 0 ? 0 : 1)
