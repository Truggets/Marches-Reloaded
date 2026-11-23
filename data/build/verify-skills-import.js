// Spot-checks parse-skills-import.js against a small representative fixture
// (fixtures/skills-import-sample.json) plus bad-input cases — same
// fixture-based style as verify-hazards-import.js.
'use strict'
const fs = require('fs')
const path = require('path')
const { parseSkillsImport, SKILL_ABILITIES } = require('./parse-skills-import')

const FIXTURE_PATH = path.join(__dirname, 'fixtures', 'skills-import-sample.json')

let failures = 0
function check(label, actual, expected) {
  const pass = actual === expected
  if (!pass) failures++
  console.log(`  [${pass ? 'PASS' : 'FAIL'}] ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
}

function throwsWith(doc, needle) {
  let message = null
  try {
    parseSkillsImport(doc, 'fixture-pack')
  } catch (err) {
    message = err.message
  }
  return message !== null && message.includes(needle)
}

const vaultDoc = JSON.parse(fs.readFileSync(FIXTURE_PATH, 'utf8'))
const skills = parseSkillsImport(vaultDoc, 'fixture-pack')

console.log(`Parsed ${skills.length} skills from fixture ${FIXTURE_PATH}`)
check('count', skills.length, 2)

console.log('\nAcrobatics:')
{
  const s = skills.find((x) => x.name === 'Acrobatics')
  check('id', s.id, 'fixture-pack:acrobatics')
  check('ability', s.ability, 'Dexterity')
  check(
    'description joins mechanics_first + lore_and_flavor',
    s.description,
    '**Core Use:** Stay on your feet in a tricky situation.\n\n**Escaping Ropes:** Requires a successful DC 15 Dexterity (Acrobatics) check as an action.\n\nAcrobatics measures your agility.',
  )
  check('pack', s.pack, 'fixture-pack')
  check('source.book', s.source.book, "Player's Handbook (2024)")
}

console.log('\nNo lore_and_flavor: description is just the bullets:')
{
  const s = skills.find((x) => x.name === 'Sleight of Hand')
  check('id', s.id, 'fixture-pack:sleight-of-hand')
  check('description', s.description, '**Core Use:** Pick a pocket or plant an item.')
}

console.log('\nBad input is rejected, naming the offender:')
const good = { name: 'Stealth', ability: 'Dexterity', source: 'Fixture', mechanics_first: ['x'] }
check('unknown skill name', throwsWith({ skills: [{ ...good, name: 'Basket Weaving' }] }, 'Basket Weaving'), true)
check('wrong ability', throwsWith({ skills: [{ ...good, ability: 'Strength' }] }, 'Stealth'), true)
check('missing source', throwsWith({ skills: [{ ...good, source: undefined }] }, 'Stealth'), true)
check('empty mechanics_first', throwsWith({ skills: [{ ...good, mechanics_first: [] }] }, 'Stealth'), true)
check('duplicate skill', throwsWith({ skills: [good, good] }, 'fixture-pack:stealth'), true)
check('non-string mechanics_first entry', throwsWith({ skills: [{ ...good, mechanics_first: ['ok', 1] }] }, 'Stealth'), true)
check('empty skills list', throwsWith({ skills: [] }, 'empty list'), true)
check('wrong top-level shape', throwsWith({ hazards: [] }, '{ skills: [...] }'), true)

console.log('\nKeep-in-sync guard: skill map matches computeSheet.ts:')
{
  const src = fs.readFileSync(path.join(__dirname, '..', '..', 'client', 'src', 'engine', 'computeSheet.ts'), 'utf8')
  const block = src.match(/const SKILL_ABILITIES[^{]*\{([\s\S]*?)\n\}/)
  const pairs = {}
  if (block) {
    for (const m of block[1].matchAll(/'?([A-Za-z ]+?)'?:\s*'([A-Za-z]+)'/g)) pairs[m[1].trim()] = m[2]
  }
  check('computeSheet.ts block found', Boolean(block), true)
  check('same skill count', Object.keys(pairs).length, Object.keys(SKILL_ABILITIES).length)
  check('identical map', JSON.stringify(pairs), JSON.stringify(SKILL_ABILITIES))
}

console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`)
process.exit(failures === 0 ? 0 : 1)
