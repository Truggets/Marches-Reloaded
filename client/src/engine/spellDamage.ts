// M11 sandbox v0: hand-curated spell-damage lookup.
//
// SpellEntry (data/spells.json) has no structured damage field — `description`
// is prose only, and its phrasing varies wildly across all 339 spells. Parsing
// that generically is a much bigger, riskier project than the combat sandbox
// itself (see docs/planning/m11-sandbox-v0-plan.md's "Decision resolved this
// session"). Instead this file hand-extracts damage for the SRD 5.2 cantrips
// that actually require an attack roll (as opposed to a saving throw, e.g.
// Vicious Mockery, or no damage at all, e.g. Mage Hand) — the only spells
// `resolveSpellAttack` in sandbox.ts needs a damage string for.
//
// This is NOT derived/generated data and NOT exhaustive of the spell list —
// it is scoped to attack-roll cantrips only, since those are what a level
// 1-10 caster repeatedly uses in the sandbox's basic-attack loop. A spell id
// not present here is expected, not a bug: `resolveSpellAttack` still
// resolves hit/miss correctly and simply omits `damage`, and calling UI
// should fall back to showing the spell's own description text so the player
// can read/roll it manually.
//
// Covers every SRD 5.2 cantrip in the bundled pack (data/spells.json, level
// === 0) whose description requires a "melee spell attack" or "ranged spell
// attack" (checked directly against that file as of 2026-09-08 — 9 total).
// True Strike and Shillelagh also mention "attack" but use a *weapon's*
// attack/damage roll, not a spell attack roll, so they're deliberately
// excluded; Vicious Mockery is a saving-throw spell, also excluded.
//
// Every string below is the LEVEL 1-4 base damage die only. SRD cantrips
// upgrade at caster levels 5, 11, and 17 (e.g. Fire Bolt becomes 2d10 at
// level 5) — this app levels to 10, so a level 5+ caster in the sandbox will
// see understated damage from this lookup. That scaling is not implemented
// in v0 (no level parameter flows into resolveSpellAttack); this is a
// deliberate scope line, not a bug, but worth knowing before trusting a
// level 5+ result at face value.
export const SPELL_DAMAGE: Record<string, string> = {
  'chill-touch': '1d10 Necrotic',
  'eldritch-blast': '1d10 Force',
  'fire-bolt': '1d10 Fire',
  'poison-spray': '1d12 Poison',
  'produce-flame': '1d8 Fire',
  'ray-of-frost': '1d8 Cold',
  'shocking-grasp': '1d8 Lightning',
  // Sorcerous Burst lets the caster pick the damage type per cast (Acid,
  // Cold, Fire, Lightning, Poison, Psychic, or Thunder) — the die is fixed,
  // the type isn't, so it's recorded here rather than picking one type.
  'sorcerous-burst': '1d8 (choice of Acid/Cold/Fire/Lightning/Poison/Psychic/Thunder)',
  'starry-wisp': '1d8 Radiant',
}

/** Curated damage string for a spell id, or undefined if it's not an attack
 * cantrip covered by `SPELL_DAMAGE` above (a non-attack spell, a save-based
 * spell, or simply not yet curated). */
export function spellDamageFor(spellId: string): string | undefined {
  return SPELL_DAMAGE[spellId]
}
