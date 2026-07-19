// Dev-only: regenerates the bundled SRD 5.2 pack from build/source/*.md.
// Not wired into deploy.sh — the VPS never runs this or fetches from GitHub;
// output JSON is committed as static data. Run manually after editing a
// parser or updating build/source/*.md.
'use strict'
const { execFileSync } = require('child_process')
const path = require('path')

const scripts = [
  'parse-classes.js',
  'parse-species.js',
  'parse-backgrounds.js',
  'parse-feats.js',
  'parse-spells.js',
  'parse-equipment.js',
]

for (const script of scripts) {
  console.log(`\n=== ${script} ===`)
  execFileSync(process.execPath, [path.join(__dirname, script)], { stdio: 'inherit' })
}

console.log('\n=== verify-pack.js ===')
execFileSync(process.execPath, [path.join(__dirname, 'verify-pack.js')], { stdio: 'inherit' })
