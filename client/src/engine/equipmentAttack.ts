// M11 Phase 2: turns a character's chosen starting-equipment letter (e.g.
// "A") into the concrete weapon EquipmentEntry objects it grants, so the
// combat sandbox can offer a weapon-attack picker
// (docs/planning/m11-phase2-weapon-attack-plan.md). Lives in `engine/`
// (sandbox-consumption logic) rather than `character-wizard/parsing.ts`
// (wizard-input parsing) even though it reuses that module's option parser.
import { listEquipment } from '@data'
import type { ClassEntry, EquipmentEntry } from '@data/schema'
import { parseEquipmentOptions } from '../character-wizard/parsing'

// Small local singularize map for the plural item names that actually occur
// in the 12 bundled classes' startingEquipment prose (Fighter's "Javelins",
// Rogue/Wizard/etc.'s "Daggers", Ranger's "Arrows", Barbarian's "Handaxes").
// Deliberately not a general English inflector — see plan doc step 2.
const SINGULARIZE: Record<string, string> = {
  javelins: 'javelin',
  daggers: 'dagger',
  arrows: 'arrow',
  handaxes: 'handaxe',
}

function singularize(name: string): string {
  const lower = name.toLowerCase()
  return SINGULARIZE[lower] ?? name
}

/**
 * Cleans one comma/semicolon-separated prose token from a startingEquipment
 * option's text into a candidate item name for matching:
 *  - strips a leading "and " (the last item in a list, e.g. "and 4 GP")
 *  - strips a leading quantity numeral ("8 Javelins" -> "Javelins")
 *  - singularizes known plurals ("Javelins" -> "Javelin") for name matching
 */
function cleanToken(raw: string): string {
  let token = raw.trim()
  token = token.replace(/^and\s+/i, '')
  token = token.replace(/^\d+\s+/, '')
  token = token.trim()
  return singularize(token)
}

/**
 * A prose token can name a real weapon two ways: directly ("Greatsword"), or
 * parenthetically inside a focus/tool description ("Arcane Focus
 * (Quarterstaff)", "Druidic Focus (Quarterstaff)"). Returns both the
 * whole-token candidate and, when present, the parenthetical's contents, so
 * the caller can try each against the weapon list — a parenthetical with
 * non-weapon flavor text ("Arcane Focus (crystal)", "Druidic Focus (sprig of
 * mistletoe)") simply matches nothing and falls through, same as any other
 * non-weapon token.
 */
function candidatesForToken(raw: string): string[] {
  const parenMatch = raw.match(/\(([^)]+)\)/)
  const withoutParen = raw.replace(/\([^)]*\)/, '').trim()
  const candidates = [cleanToken(withoutParen)]
  if (parenMatch) candidates.push(cleanToken(parenMatch[1]))
  return candidates
}

/**
 * Adds the attack's ability modifier to a bundled weapon damage string
 * ("1d8 Slashing") as a flat addend, matching the curated monster-damage
 * format's convention of putting the flat number before the damage type
 * ("1d6 + 2 Piercing") — SRD 5.2 weapon attacks add the same ability
 * modifier used for the attack roll to the damage roll, unlike cantrip
 * damage (spellDamage.ts's curated lookup deliberately excludes it, since
 * cantrip damage doesn't scale with the casting ability). A modifier of 0 is
 * left off entirely rather than shown as "+ 0". Every bundled weapon's
 * `damage` string is exactly "<dice> <type>" with no existing modifier
 * (verified against all 38 entries), so this always finds a dice/type split
 * on real data; an unexpected shape (e.g. a malformed imported-pack weapon)
 * falls back to the untouched string rather than guessing.
 */
export function weaponDamageWithAbilityModifier(damage: string, abilityMod: number): string {
  if (abilityMod === 0) return damage
  const match = damage.match(/^(\d+d\d+)\s+(.+)$/)
  if (!match) return damage
  const [, dice, type] = match
  const sign = abilityMod > 0 ? '+' : '-'
  return `${dice} ${sign} ${Math.abs(abilityMod)} ${type}`
}

/**
 * Parses a class's chosen starting-equipment letter into the weapon
 * EquipmentEntry objects it grants. Returns `[]` (never throws) when the
 * letter doesn't resolve to a known option, or when the resolved option's
 * text contains no weapon matches at all (the pure-GP options every class
 * has, e.g. Fighter's "(C) 155 GP").
 *
 * Name-matching prefers the bundled `pack === 'srd-5.2'` entry when a name
 * collides with an imported (M2b) pack's same-named weapon, since the
 * source prose always describes SRD items (plan doc finding 7). Results are
 * filtered to entries with `damage !== undefined` defensively, since
 * imported-pack weapons aren't guaranteed to have it populated.
 */
/**
 * Which ability score a weapon's attack roll uses, derived from its
 * `properties` string — verified against all 38 bundled SRD weapons with
 * zero exceptions (docs/planning/m11-phase2-weapon-attack-plan.md finding
 * 4), so no structured schema field is needed for this:
 *  - "Finesse" present -> the higher of Strength/Dexterity.
 *  - "Ammunition" present (and not Finesse, e.g. bows) -> Dexterity.
 *  - otherwise -> Strength.
 * Melee vs. ranged is deliberately NOT distinguished here — the sandbox
 * resolves attacks against a stationary target with no range/reach model,
 * so only the ability choice matters, not the weapon's melee/ranged status.
 */
export function abilityForWeapon(weapon: EquipmentEntry, strengthMod: number, dexterityMod: number): number {
  const properties = weapon.properties ?? ''
  if (/Finesse/.test(properties)) return Math.max(strengthMod, dexterityMod)
  if (/Ammunition/.test(properties)) return dexterityMod
  return strengthMod
}

export function parseWeaponsFromEquipmentChoice(classEntry: ClassEntry, letter: string): EquipmentEntry[] {
  const options = parseEquipmentOptions(classEntry.startingEquipment)
  const option = options.find((o) => o.letter.toUpperCase() === letter.toUpperCase())
  if (!option) return []

  const tokenCandidates = option.text
    .split(/[,;]/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0)
    .map(candidatesForToken)

  const weapons = listEquipment('weapon')

  const results: EquipmentEntry[] = []
  for (const candidates of tokenCandidates) {
    for (const candidate of candidates) {
      const matches = weapons.filter((w) => w.name.toLowerCase() === candidate.toLowerCase())
      if (matches.length === 0) continue
      const srdMatch = matches.find((w) => w.pack === 'srd-5.2')
      results.push(srdMatch ?? matches[0])
      break
    }
  }

  return results.filter((w) => w.damage !== undefined)
}
