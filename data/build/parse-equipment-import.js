// Converts a vault-shaped equipment JSON file (shape:
//   { weapon_mastery_properties: {...}, weapons: [...], armor: [...],
//     adventuring_gear: [...] })
// into EquipmentEntry[] per the frozen schema (schema.ts). This is the
// Phase-4 importer for the PHB-2024 (and other non-SRD) equipment pack
// (M2b), a sibling of parse-feats-import.js/parse-backgrounds-import.js —
// separate from parse-equipment.js, which parses the *bundled* SRD-only
// equipment.md.
//
// Unlike backgrounds/feats, the vault's weapons/armor/adventuring_gear
// arrays are already clean structured JSON — this is a straight field-
// mapping exercise, not prose extraction. The `weapon_mastery_properties`
// object is a reference glossary of what each named mastery property does
// (e.g. "Nick": { mechanics, lore }) — it is NOT a list of equipment items
// and must not be imported as gear; each weapon entry only carries its own
// `mastery` property *name* (e.g. "Nick"), matching the bundled parser's
// EquipmentEntry.mastery field.
//
// The real vault file lives outside this repo and is never committed; pass
// its path via --input. See docs/planning/m2b-phase3-4-species-equipment-
// plan.md for the decisions this script encodes.
'use strict'
const fs = require('fs')
const path = require('path')

// Default pack id for the CLI (--pack-id overrides it) and for direct calls
// to parseEquipmentImport/parse*Entry that don't pass one — kept only as a
// fallback. The real per-import pack id comes from the caller: the admin
// import endpoint (server/src/routes/admin.js) passes whatever the admin
// typed into "Pack ID" on AdminPackImportPage, so two different imports
// don't collide under the same hardcoded id.
const DEFAULT_PACK = 'phb-2024'

function slugify(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
}

// Vault uses "—" (em-dash) as a "none"/"n/a" placeholder for optional
// strength/stealth values (and occasionally weight). Matches the bundled
// parser's clean() convention: convert it (and blank strings) to undefined
// rather than storing the literal em-dash character.
const NONE_PLACEHOLDERS = new Set(['', '—', 'none', 'n/a', 'na'])

function clean(v) {
  if (v === undefined || v === null) return undefined
  if (typeof v !== 'string') return v
  const t = v.trim()
  return NONE_PLACEHOLDERS.has(t.toLowerCase()) ? undefined : t
}

// Converts one vault weapon object into an EquipmentEntry. Throws (naming
// the offender) if "name" or "damage" is missing — both are load-bearing
// mechanical fields per the task's explicit throw list.
function parseWeaponEntry(vaultWeapon, packId) {
  const { name, category, damage, properties, mastery, weight, cost } = vaultWeapon
  if (!name || typeof name !== 'string') {
    throw new Error(`Weapon entry missing a valid "name": ${JSON.stringify(vaultWeapon)}`)
  }
  const cleanDamage = clean(damage)
  if (!cleanDamage) {
    throw new Error(`Weapon "${name}" is missing a "damage" value`)
  }
  const cleanMastery = clean(mastery)
  const descParts = []
  if (clean(category)) descParts.push(clean(category))
  if (cleanDamage) descParts.push(`Damage: ${cleanDamage}`)
  if (cleanMastery) descParts.push(`Mastery: ${cleanMastery}`)

  return {
    id: `${packId}:${slugify(name)}`,
    name,
    category: 'weapon',
    cost: clean(cost),
    weight: clean(weight),
    properties: clean(properties),
    description: descParts.join('. ') || undefined,
    damage: cleanDamage,
    mastery: cleanMastery,
    pack: packId,
    source: { book: `Vault import (${packId})` },
  }
}

// Converts one vault armor object into an EquipmentEntry. Throws (naming
// the offender) if "name" or "ac" is missing — both are load-bearing
// mechanical fields per the task's explicit throw list. "strength"/
// "stealth" are optional and the vault's "—" placeholder for "none"
// correctly becomes undefined via clean(), not a literal em-dash.
function parseArmorEntry(vaultArmor, packId) {
  const { name, category, ac, strength, stealth, weight, cost, don_doff } = vaultArmor
  if (!name || typeof name !== 'string') {
    throw new Error(`Armor entry missing a valid "name": ${JSON.stringify(vaultArmor)}`)
  }
  const cleanAc = clean(ac)
  if (!cleanAc) {
    throw new Error(`Armor "${name}" is missing an "ac" value`)
  }
  const cleanStrength = clean(strength)
  const cleanStealth = clean(stealth)
  const propParts = []
  if (cleanAc) propParts.push(`AC: ${cleanAc}`)
  if (cleanStrength) propParts.push(`Strength: ${cleanStrength}`)
  if (cleanStealth) propParts.push(`Stealth: ${cleanStealth}`)

  const descParts = []
  if (clean(category)) descParts.push(clean(category))
  if (clean(don_doff)) descParts.push(clean(don_doff))

  return {
    id: `${packId}:${slugify(name)}`,
    name,
    category: 'armor',
    cost: clean(cost),
    weight: clean(weight),
    properties: propParts.join('; ') || undefined,
    description: descParts.join('. ') || undefined,
    ac: cleanAc,
    strength: cleanStrength,
    stealth: cleanStealth,
    pack: packId,
    source: { book: `Vault import (${packId})` },
  }
}

// Converts one vault adventuring-gear object into an EquipmentEntry. The
// vault shape for this section is { name, cost, weight, use, lore } — no
// damage/ac/strength/stealth fields (those are weapon/armor-only per the
// schema comment), so this entry never sets them. "use" (the item's rules
// text, e.g. "**Action:** ...") becomes description; the vault has no
// separate "properties"-shaped field for gear so properties stays unset.
function parseGearEntry(vaultGear, packId) {
  const { name, cost, weight, use } = vaultGear
  if (!name || typeof name !== 'string') {
    throw new Error(`Adventuring gear entry missing a valid "name": ${JSON.stringify(vaultGear)}`)
  }

  return {
    id: `${packId}:${slugify(name)}`,
    name,
    category: 'gear',
    cost: clean(cost),
    weight: clean(weight),
    properties: undefined,
    description: clean(use),
    pack: packId,
    source: { book: `Vault import (${packId})` },
  }
}

// Converts a whole vault-shaped { weapon_mastery_properties, weapons, armor,
// adventuring_gear } document into EquipmentEntry[]. weapon_mastery_
// properties is intentionally never converted into entries here (see file
// header) — it's reference metadata, not a list of items.
function parseEquipmentImport(vaultDoc, packId = DEFAULT_PACK) {
  if (!vaultDoc || typeof vaultDoc !== 'object') {
    throw new Error('Expected a document shaped { weapons: [...], armor: [...], adventuring_gear: [...] }')
  }
  if (typeof packId !== 'string' || !packId.trim()) {
    throw new Error('packId is required and must be a non-empty string')
  }
  const weaponsIn = Array.isArray(vaultDoc.weapons) ? vaultDoc.weapons : []
  const armorIn = Array.isArray(vaultDoc.armor) ? vaultDoc.armor : []
  const gearIn = Array.isArray(vaultDoc.adventuring_gear) ? vaultDoc.adventuring_gear : []

  const entries = [
    ...weaponsIn.map((w) => parseWeaponEntry(w, packId)),
    ...armorIn.map((a) => parseArmorEntry(a, packId)),
    ...gearIn.map((g) => parseGearEntry(g, packId)),
  ]

  // Reject the whole pack, naming both offenders (and their categories,
  // since a cross-category name collision would otherwise be confusing),
  // rather than silently dropping or overwriting one entry with another.
  // Matches the "reject the whole pack, name the offender" convention this
  // parser follows throughout (see parse-backgrounds-import.js/parse-feats-
  // import.js).
  const seenById = new Map()
  for (const entry of entries) {
    const prior = seenById.get(entry.id)
    if (prior) {
      throw new Error(
        `Duplicate equipment id "${entry.id}" from "${prior.name}" (${prior.category}) and "${entry.name}" (${entry.category}) — names must be unique after slugification, even across weapon/armor/gear categories`
      )
    }
    seenById.set(entry.id, entry)
  }

  return entries
}

function main() {
  const args = process.argv.slice(2)
  const getArg = (flag) => {
    const i = args.indexOf(flag)
    return i !== -1 ? args[i + 1] : undefined
  }

  const inputPath = getArg('--input')
  const outputPath = getArg('--output')
  const packId = getArg('--pack-id') ?? DEFAULT_PACK
  // Both flags required, no default output path: this is PHB-2024 (non-SRD)
  // content, which must never land in data/ (the shipped SRD-only dataset)
  // by accident. See CLAUDE.md's SRD-only bundling constraint.
  if (!inputPath || !outputPath) {
    console.error('Usage: node parse-equipment-import.js --input <vault-equipment.json> --output <out.json> [--pack-id <id>]')
    process.exit(1)
  }

  const vaultDoc = JSON.parse(fs.readFileSync(path.resolve(inputPath), 'utf8'))
  const entries = parseEquipmentImport(vaultDoc, packId)

  fs.writeFileSync(outputPath, JSON.stringify(entries, null, 2))
  const byCategory = entries.reduce((acc, e) => {
    acc[e.category] = (acc[e.category] || 0) + 1
    return acc
  }, {})
  console.log(`Parsed ${entries.length} equipment entries from ${inputPath}`)
  console.log('By category:', byCategory)
  console.log(`Wrote ${outputPath}`)
}

if (require.main === module) {
  main()
}

module.exports = {
  parseEquipmentImport,
  parseWeaponEntry,
  parseArmorEntry,
  parseGearEntry,
  clean,
  slugify,
  DEFAULT_PACK,
}
