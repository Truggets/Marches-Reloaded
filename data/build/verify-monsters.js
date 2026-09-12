// Spot-checks monsters.json against known SRD text read directly from
// build/source/monsters.md. Fails loudly (non-zero exit) on any mismatch.
'use strict'
const fs = require('fs')
const path = require('path')

const MONSTERS_PATH = path.join(__dirname, '..', 'monsters.json')
const monsters = JSON.parse(fs.readFileSync(MONSTERS_PATH, 'utf8'))

let failures = 0
function check(label, cond) {
  if (cond) {
    console.log(`  OK: ${label}`)
  } else {
    console.log(`  FAIL: ${label}`)
    failures++
  }
}

console.log(`Loaded ${monsters.length} monsters from ${MONSTERS_PATH}`)

// --- Bandit (simple, 2 actions, no Traits section) ---
console.log('\nBandit:')
const bandit = monsters.find((m) => m.name === 'Bandit')
check('exists', !!bandit)
if (bandit) {
  check('id === "bandit"', bandit.id === 'bandit')
  check('size === "Medium or Small"', bandit.size === 'Medium or Small')
  check('creatureType === "Humanoid"', bandit.creatureType === 'Humanoid')
  check('alignment === "Neutral"', bandit.alignment === 'Neutral')
  check('ac === 12', bandit.ac === 12)
  check('hp === 11', bandit.hp === 11)
  check('hitDice === "2d8 + 2"', bandit.hitDice === '2d8 + 2')
  check('speed === "30 ft."', bandit.speed === '30 ft.')
  check(
    'abilityScores match SRD (STR 11, DEX 12, CON 12, INT 10, WIS 10, CHA 10)',
    bandit.abilityScores.Strength === 11 &&
      bandit.abilityScores.Dexterity === 12 &&
      bandit.abilityScores.Constitution === 12 &&
      bandit.abilityScores.Intelligence === 10 &&
      bandit.abilityScores.Wisdom === 10 &&
      bandit.abilityScores.Charisma === 10,
  )
  check('senses === "Passive Perception 10"', bandit.senses === 'Passive Perception 10')
  check("languages === \"Common, Thieves' Cant\"", bandit.languages === "Common, Thieves' Cant")
  check('cr === "1/8"', bandit.cr === '1/8')
  check('xp === 25', bandit.xp === 25)
  check('no Traits section -> traits is empty', bandit.traits.length === 0)
  check('exactly 2 actions (Scimitar, Light Crossbow)', bandit.actions.length === 2)
  const scimitar = bandit.actions.find((a) => a.name === 'Scimitar')
  check('Scimitar attackBonus === "+3"', !!scimitar && scimitar.attackBonus === '+3')
  check('Scimitar damage === "1d6 + 1 Slashing"', !!scimitar && scimitar.damage === '1d6 + 1 Slashing')
  const crossbow = bandit.actions.find((a) => a.name === 'Light Crossbow')
  check('Light Crossbow attackBonus === "+3"', !!crossbow && crossbow.attackBonus === '+3')
  check('Light Crossbow damage === "1d8 + 1 Piercing"', !!crossbow && crossbow.damage === '1d8 + 1 Piercing')
}

// --- Wolf (has a Traits section with Pack Tactics, single Bite action) ---
console.log('\nWolf:')
const wolf = monsters.find((m) => m.name === 'Wolf')
check('exists', !!wolf)
if (wolf) {
  check('id === "wolf"', wolf.id === 'wolf')
  check('size === "Medium"', wolf.size === 'Medium')
  check('creatureType === "Beast"', wolf.creatureType === 'Beast')
  check('alignment === "Unaligned"', wolf.alignment === 'Unaligned')
  check('ac === 12', wolf.ac === 12)
  check('hp === 11', wolf.hp === 11)
  check('hitDice === "2d8 + 2"', wolf.hitDice === '2d8 + 2')
  check('speed === "40 ft."', wolf.speed === '40 ft.')
  check(
    'abilityScores match SRD (STR 14, DEX 15, CON 12, INT 3, WIS 12, CHA 6)',
    wolf.abilityScores.Strength === 14 &&
      wolf.abilityScores.Dexterity === 15 &&
      wolf.abilityScores.Constitution === 12 &&
      wolf.abilityScores.Intelligence === 3 &&
      wolf.abilityScores.Wisdom === 12 &&
      wolf.abilityScores.Charisma === 6,
  )
  check('skills === "Perception +5, Stealth +4"', wolf.skills === 'Perception +5, Stealth +4')
  check('cr === "1/4"', wolf.cr === '1/4')
  check('xp === 50', wolf.xp === 50)
  check('exactly 1 trait (Pack Tactics)', wolf.traits.length === 1 && wolf.traits[0].name === 'Pack Tactics')
  check('Pack Tactics description mentions Advantage/Incapacitated', wolf.traits[0].description.includes('Advantage') && wolf.traits[0].description.includes('Incapacitated'))
  check('exactly 1 action (Bite)', wolf.actions.length === 1 && wolf.actions[0].name === 'Bite')
  check('Bite attackBonus === "+4"', wolf.actions[0].attackBonus === '+4')
  check('Bite damage === "1d6 + 2 Piercing"', wolf.actions[0].damage === '1d6 + 2 Piercing')
}

// --- General cross-cutting checks ---
console.log('\nGeneral:')
check('exactly 10 monsters parsed', monsters.length === 10)
check('every monster has a non-empty actions array', monsters.every((m) => Array.isArray(m.actions) && m.actions.length > 0))
check(
  'every action whose description contains "Attack Roll:" has both attackBonus and damage populated',
  monsters.every((m) =>
    m.actions.every((a) => (a.description.includes('Attack Roll:') ? !!a.attackBonus && !!a.damage : true)),
  ),
)
const allIds = monsters.map((m) => m.id)
check('no duplicate monster ids', allIds.length === new Set(allIds).size)
check('every monster has pack "srd-5.2" and source.book "SRD 5.2.1"', monsters.every((m) => m.pack === 'srd-5.2' && m.source.book === 'SRD 5.2.1'))
check('every monster has AC/HP as numbers and CR/hitDice as strings', monsters.every((m) => typeof m.ac === 'number' && typeof m.hp === 'number' && typeof m.cr === 'string' && typeof m.hitDice === 'string'))
check('every monster has all 6 ability scores as numbers', monsters.every((m) => ['Strength', 'Dexterity', 'Constitution', 'Intelligence', 'Wisdom', 'Charisma'].every((a) => typeof m.abilityScores[a] === 'number')))

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`)
process.exit(failures === 0 ? 0 : 1)
