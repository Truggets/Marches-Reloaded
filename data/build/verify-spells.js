// Spot-checks parse-spells.js output against the real SRD 5.2 text.
// Deterministic assertions, no LLM involved.
'use strict'
const fs = require('fs')
const path = require('path')

const OUT_PATH = path.join(__dirname, '..', 'spells.json')

function assert(cond, msg) {
  if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`)
  console.log(`  OK: ${msg}`)
}

function main() {
  const spells = JSON.parse(fs.readFileSync(OUT_PATH, 'utf8'))
  const byName = new Map(spells.map((s) => [s.name, s]))

  console.log(`Loaded ${spells.length} spells from ${OUT_PATH}`)

  // 1. Fireball — level 3 Evocation, iconic damage/range details.
  console.log('\nFireball:')
  const fireball = byName.get('Fireball')
  assert(fireball, 'Fireball exists')
  assert(fireball.level === 3, `level is 3 (got ${fireball.level})`)
  assert(fireball.school === 'Evocation', `school is Evocation (got ${fireball.school})`)
  assert(fireball.range === '150 feet', `range is 150 feet (got ${fireball.range})`)
  assert(fireball.classes.includes('Sorcerer') && fireball.classes.includes('Wizard'), 'classes include Sorcerer, Wizard')
  assert(/8d6 Fire damage/.test(fireball.description), 'description mentions 8d6 Fire damage')
  assert(fireball.higherLevels && /1d6 for each spell slot level above 3/.test(fireball.higherLevels), 'higherLevels mentions +1d6 per slot level above 3')

  // 2. Acid Splash — cantrip, level 0, correct scaling text present.
  console.log('\nAcid Splash:')
  const acidSplash = byName.get('Acid Splash')
  assert(acidSplash, 'Acid Splash exists')
  assert(acidSplash.level === 0, `level is 0 (got ${acidSplash.level})`)
  assert(acidSplash.school === 'Evocation', `school is Evocation (got ${acidSplash.school})`)
  assert(acidSplash.components === 'V, S', `components is V, S (got ${acidSplash.components})`)
  assert(
    acidSplash.higherLevels && /levels 5 \(2d6\), 11 \(3d6\), and 17 \(4d6\)/.test(acidSplash.higherLevels),
    'higherLevels has cantrip scaling text (levels 5/11/17)',
  )

  // 3. Detect Magic — long class list (8 classes), ritual casting time.
  console.log('\nDetect Magic:')
  const detectMagic = byName.get('Detect Magic')
  assert(detectMagic, 'Detect Magic exists')
  assert(detectMagic.level === 1, `level is 1 (got ${detectMagic.level})`)
  assert(detectMagic.classes.length === 8, `has 8 classes (got ${detectMagic.classes.length}: ${detectMagic.classes.join(', ')})`)
  assert(/Ritual/.test(detectMagic.castingTime), `castingTime mentions Ritual (got ${detectMagic.castingTime})`)

  // 4. Guidance — cantrip with singular "**Component:**" typo in source
  //    (regression check for the metadata-block regex).
  console.log('\nGuidance:')
  const guidance = byName.get('Guidance')
  assert(guidance, 'Guidance exists')
  assert(guidance.level === 0, `level is 0 (got ${guidance.level})`)
  assert(guidance.components === 'V, S', `components is V, S (got ${guidance.components})`)
  assert(guidance.classes.includes('Cleric') && guidance.classes.includes('Druid'), 'classes include Cleric, Druid')

  // 5. Animate Objects — spell whose description contains nested non-spell
  //    #### sub-headings (stat block); must not have swallowed/duplicated
  //    those as separate spells, and its own higherLevels must be correct.
  console.log('\nAnimate Objects:')
  const animateObjects = byName.get('Animate Objects')
  assert(animateObjects, 'Animate Objects exists')
  assert(animateObjects.level === 5, `level is 5 (got ${animateObjects.level})`)
  assert(!byName.has('Animated Object'), 'Animated Object (nested stat block) was NOT parsed as its own spell')
  assert(!byName.has('Actions'), '"Actions" sub-heading was NOT parsed as its own spell')
  assert(
    animateObjects.higherLevels && /Slam damage increases by 1d4/.test(animateObjects.higherLevels),
    'Animate Objects higherLevels captured correctly despite trailing stat block',
  )

  // 6. Sanity: total count in SRD 5.2 ballpark.
  console.log('\nOverall:')
  assert(spells.length >= 300 && spells.length <= 400, `total spell count in plausible SRD range (got ${spells.length})`)
  assert(spells.every((s) => s.pack === 'srd-5.2'), 'all spells tagged pack: srd-5.2')
  assert(spells.every((s) => s.source && s.source.book === 'SRD 5.2.1'), 'all spells tagged source.book: SRD 5.2.1')
  assert(spells.every((s) => typeof s.level === 'number'), 'all spells have numeric level')

  console.log('\nAll checks passed.')
}

main()
