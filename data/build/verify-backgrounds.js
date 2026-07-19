// Spot-checks backgrounds.json against the raw SRD source text.
'use strict'
const fs = require('fs')
const path = require('path')

const OUT_PATH = path.join(__dirname, '..', 'backgrounds.json')
const backgrounds = JSON.parse(fs.readFileSync(OUT_PATH, 'utf8'))

let failures = 0
function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}: got ${JSON.stringify(actual)}${ok ? '' : ` expected ${JSON.stringify(expected)}`}`)
  if (!ok) failures++
}

// Source (character-origins.md, lines 33-39):
// #### Acolyte
// **Ability Scores:** Intelligence, Wisdom, Charisma
// **Feat:** Magic Initiate (Cleric) (see "Feats")
// **Skill Proficiencies:** Insight and Religion
// **Tool Proficiency:** Calligrapher's Supplies
// **Equipment:** _Choose A or B:_ (A) Calligrapher's Supplies, Book (prayers), Holy Symbol, Parchment (10 sheets), Robe, 8 GP; or (B) 50 GP
const acolyte = backgrounds.find((b) => b.id === 'acolyte')
check('Acolyte exists', !!acolyte, true)
check('Acolyte abilityScores', acolyte.abilityScores, ['Intelligence', 'Wisdom', 'Charisma'])
check('Acolyte feat', acolyte.feat, 'Magic Initiate (Cleric)')
check('Acolyte skillProficiencies', acolyte.skillProficiencies, ['Insight', 'Religion'])
check('Acolyte toolProficiency', acolyte.toolProficiency, "Calligrapher's Supplies")

// Source (lines 57-63):
// #### Soldier
// **Ability Scores:** Strength, Dexterity, Constitution
// **Feat:** Savage Attacker (see "Feats")
// **Skill Proficiencies:** Athletics and Intimidation
// **Tool Proficiency:** _Choose one kind of_ Gaming Set (see "Equipment")
// **Equipment:** _Choose A or B:_ (A) Spear, Shortbow, 20 Arrows, Gaming Set (same as above), Healer's Kit, Quiver, Traveler's Clothes, 14 GP; or (B) 50 GP
const soldier = backgrounds.find((b) => b.id === 'soldier')
check('Soldier exists', !!soldier, true)
check('Soldier abilityScores', soldier.abilityScores, ['Strength', 'Dexterity', 'Constitution'])
check('Soldier feat', soldier.feat, 'Savage Attacker')
check('Soldier skillProficiencies', soldier.skillProficiencies, ['Athletics', 'Intimidation'])
check('Soldier toolProficiency', soldier.toolProficiency, '_Choose one kind of_ Gaming Set')

console.log(`\nTotal backgrounds in output: ${backgrounds.length}`)
console.log(failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`)
process.exit(failures === 0 ? 0 : 1)
