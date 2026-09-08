# Plan: Issue #10 — Spellcasting Details (spell attack bonus / spell save DC)

## Goal
Show spell attack bonus and spell save DC on the character sheet for each caster class.

## Data available
Every caster class's SRD text already states its spellcasting ability verbatim in a feature description: *"Charisma is your spellcasting ability for your Bard spells."* (and similarly for each class). Confirmed via `grep -n "spellcasting ability" data/classes.json` — present for Bard, Cleric, Druid, Paladin, Ranger, Sorcerer, Warlock, Wizard. Warlock's feature is named "Pact Magic" rather than "Spellcasting" and phrases it slightly differently ("...is **the** spellcasting ability..." vs "...is **your** spellcasting ability...").

## Implementation
`client/src/engine/computeSheet.ts`:
- `parseSpellcastingAbility(classEntry)` — scans every one of a class's `features` (not a fixed feature name, to cover Warlock's "Pact Magic") for `/(\w+) is (?:your|the) spellcasting ability/i`, validates the captured word against `ABILITIES`, throws on an unparseable match (same convention as the #12/#2 parsed-from-prose helpers). Returns `undefined` for a non-caster class.
- `spellcastingInfo(classId, classes, abilityScores)` — `attackBonus = profBonus + abilityMod`, `saveDC = 8 + profBonus + abilityMod`, using `proficiencyBonusMulticlass(classes)` (total-character-level based, consistent with every other multiclass-aware number on the sheet).

`client/src/pages/CharacterSheetPage.tsx`: renders "`<Class> Spell Attack +N · Spell Save DC N`" above each caster class's cantrips/prepared spells block (the same per-class loop that already exists there).

## Test cases (`computeSheet.test.ts`)
- Wizard L1 uses Intelligence, arithmetic checked exactly.
- Cleric L1 uses Wisdom.
- Warlock L1 uses Charisma — specifically exercises the "the spellcasting ability" wording variant.
- Non-caster class (Fighter) returns `undefined`.

## Verification
Live-tested locally: a Wizard with Int 17 (mod +3) at prof +2 shows "Wizard Spell Attack +5 · Spell Save DC 13" — matches hand-computed math exactly.
