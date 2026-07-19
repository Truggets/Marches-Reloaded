// Full-pack verification — the M2 "definition of done" check across all
// six content types plus a few cross-cutting engine-shape assertions.
'use strict'
const fs = require('fs')
const path = require('path')

const dataDir = path.join(__dirname, '..')
const load = (name) => JSON.parse(fs.readFileSync(path.join(dataDir, `${name}.json`), 'utf8'))

const manifest = load('manifest')
const classes = load('classes')
const species = load('species')
const backgrounds = load('backgrounds')
const feats = load('feats')
const spells = load('spells')
const equipment = load('equipment')

let failures = 0
function check(label, cond) {
  console.log(`${cond ? 'PASS' : 'FAIL'} ${label}`)
  if (!cond) failures++
}

console.log('--- Counts ---')
console.log(`classes: ${classes.length}, species: ${species.length}, backgrounds: ${backgrounds.length}, feats: ${feats.length}, spells: ${spells.length}, equipment: ${equipment.length}`)

console.log('\n--- Cross-cutting checks ---')
check('manifest pinned to expected commit', manifest.sourceCommit === '1b4b99dcb786cdd1a2fb26f8acec1551191f1ca4')
check('12 classes present', classes.length === 12)
check('every class has 20 feature-table rows', classes.every((c) => c.featureTable.length === 20))
check('every class has exactly 1 subclass (SRD sample subclass)', classes.every((c) => c.subclasses.length === 1))
check('9 species present', species.length === 9)
check('4 backgrounds present', backgrounds.length === 4)
check('spells count in plausible SRD range (300-400)', spells.length >= 300 && spells.length <= 400)
check('all entries tagged pack srd-5.2', [...classes, ...species, ...backgrounds, ...feats, ...spells, ...equipment].every((e) => e.pack === 'srd-5.2'))

const allIds = (arr) => arr.map((e) => e.id)
const dupes = (ids) => ids.length !== new Set(ids).size
check('no duplicate class ids', !dupes(allIds(classes)))
check('no duplicate species ids', !dupes(allIds(species)))
check('no duplicate background ids', !dupes(allIds(backgrounds)))
check('no duplicate feat ids', !dupes(allIds(feats)))
check('no duplicate spell ids', !dupes(allIds(spells)))
check('no duplicate equipment ids', !dupes(allIds(equipment)))

console.log('\n--- Known-value spot checks (engine query correctness) ---')
const barbarian = classes.find((c) => c.id === 'barbarian')
check('Barbarian L1 features include Rage', barbarian.featureTable.find((r) => r.level === 1).features.includes('Rage'))
check('Barbarian L5 features include Extra Attack', barbarian.featureTable.find((r) => r.level === 5).features.includes('Extra Attack'))

const wizard = classes.find((c) => c.id === 'wizard')
check('Wizard L1 has 2 first-level slots', wizard.spellSlotTable?.find((r) => r.level === 1).slotsByLevel[1] === 2)

const fireball = spells.find((s) => s.name === 'Fireball')
check('Fireball is level 3', fireball?.level === 3)
check('Fireball school is Evocation', fireball?.school === 'Evocation')
check('Fireball range is 150 feet', fireball?.range === '150 feet')

const dragonborn = species.find((s) => s.name === 'Dragonborn')
check('Dragonborn has Breath Weapon trait', dragonborn?.traits.some((t) => t.name === 'Breath Weapon'))

const soldier = backgrounds.find((b) => b.name === 'Soldier')
check('Soldier grants Savage Attacker feat', soldier?.feat === 'Savage Attacker')

const longsword = equipment.find((e) => e.name === 'Longsword')
check('Longsword is a weapon', longsword?.category === 'weapon')

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`)
process.exit(failures === 0 ? 0 : 1)
