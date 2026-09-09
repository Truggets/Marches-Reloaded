# M11 Phase 2 — weaponAttack() and martial-character combat in the sandbox

## Scope framing (read this first)

Two different things have been called "issue #3" in conversation, and they are not the
same deliverable:

- **The GitHub issue's literal text** (`gh issue view 3`): no UI exists to select
  **Weapon Mastery** and **Fighting Style** choices during character creation/level-up.
  That's a character-wizard feature (a picker step), unrelated to the sandbox.
- **What this plan builds**: a `weaponAttack()`-equivalent engine function plus sandbox
  UI wiring so a **martial (non-caster) character can attack in the combat sandbox** —
  completing `docs/planning/m11-sandbox-v0-plan.md`'s explicitly-deferred half. This is
  the boss's framing and is what's built here.

The Fighting Style/Mastery-selection wizard feature is **not touched by this plan** and
stays tracked under issue #3 as-is. Weapon Mastery *names* (Vex, Nick, Slow, etc.) are
shown in the sandbox's attack log for flavor, matching the cantrip-lookup precedent
(curated data shown, not mechanically applied) — see "Not in scope" below.

## Goal

A character with no spellcasting (or a martial multiclass with some casting, e.g.
Fighter/Rogue) can open `/characters/:id/sandbox`, pick a weapon from their own starting
equipment choice, and resolve an attack roll + damage against a curated monster — the
same shape the caster-only v0 already does for cantrips.

## What already exists (no changes needed)

- `resolveMonsterAttack`/`resolveAttackRoll` in `client/src/engine/sandbox.ts` — attack
  roll resolution is already weapon-agnostic (bonus vs. AC, nat-20/nat-1 rules). Reused
  as-is for the player's weapon attack; only a new resolver for the *player's* side
  needs to be added (`resolveMonsterAttack` is monster-only today).
- `armorClass()` / `hitPointsMulticlass()` — already used correctly in
  `CombatSandboxPage.tsx`, no martial-specific gap here.
- `EquipmentEntry.damage`/`.mastery` (Phase 4, already shipped) — every one of the 38
  bundled weapons has both populated (verified below), so no data backfill needed.
- The caster-only v0's structure (picker → attack → log, "no cantrips" guard) is the
  template this plan follows for weapons.

## Orientation findings

1. **`CharacterData.equipmentChoice` is just a letter** (`parseEquipmentOptions()` in
   `character-wizard/parsing.ts` returns `{letter, text}[]`; `text` is unstructured
   prose mixing weapons/armor/gear/currency, e.g. Fighter (A):
   `"Chain Mail, Greatsword, Flail, 8 Javelins, Dungeoneer's Pack, and 4 GP"`). There is
   no structured "which weapons does this character have" field anywhere today.
2. **No class's `startingEquipment` text has an inline alternative inside one lettered
   option** (verified: grepped all 12 classes' prose for an "or" between two weapon
   names within a single `(X)` option — none exists; every "or" separates whole
   lettered options, e.g. "Choose A or B"). So one option → a fixed, enumerable set of
   items; no nested picker needed.
3. **The gold-only option is a real, common case, not an error.** Every one of the 12
   classes' equipment choices includes a pure-GP option (Fighter's (C) "155 GP", Rogue's
   (B) "100 GP", etc.). A character who picked it has zero starting weapons. This is
   the martial-page analogue of the caster page's "no cantrips selected" guard.
4. **Ability-score-for-attack heuristic, verified against all 38 bundled weapons'
   `properties`/`description` fields** (script run this session, zero exceptions):
   - `properties` contains `"Finesse"` → use `max(STR mod, DEX mod)`.
   - else `properties` contains `"Ammunition"` (and not `"Finesse"`, e.g. bows) → DEX.
   - else → STR.
   No weapon in the bundled set is ranged-without-Finesse-and-without-Ammunition, and
   every Finesse weapon (including thrown ones like Dart) is correctly handled by the
   Finesse branch regardless of melee/ranged status. **No schema change needed** — this
   reads only the existing `properties` string, no new structured field required.
5. **Every bundled weapon has `damage` defined** (verified: 0 of 38 have
   `damage === undefined`) — but the picker must still filter to `damage !== undefined`
   defensively, since an *imported* (M2b) pack's weapon entries aren't guaranteed to
   have it populated the same way.
6. **`equipmentChoice` must be resolved against `classes[0]`, not the character's
   "current" or highest-level class.** Confirmed in code: `CreateCharacterPage.tsx`
   writes `classes: [{ classId, level: 1 }]` at creation, and `equipmentChoice` is
   chosen against that same class's `startingEquipment` prose in the same flow.
   `LevelUpPage.tsx` only ever appends new classes (`withClassLevel` pushes, never
   unshifts) — `classes[0]`'s identity never changes after creation (already documented
   in-code at `LevelUpPage.tsx:418`, and already relied on by `spellsForClass()` for the
   same reason). A Fighter 3/Rogue 2 character's "C" resolves against **Fighter's**
   prose, not Rogue's, regardless of level-up order. If the letter doesn't resolve to a
   known option on `classes[0]`'s class (shouldn't happen given the invariant above, but
   defend anyway), fall through to the same friendly empty state as the gold-only case
   rather than crashing.
7. **Name-matching collision risk**: `getEquipment()` merges `[...bundled, ...imported]`.
   An imported (M2b) pack could contain a same-named weapon (e.g. a homebrew
   "Greatsword" variant) that would win a naive `.find()` by name. Since the picker is
   sourced from **bundled SRD** class prose only (`startingEquipment` text always
   describes SRD items), resolution must prefer/require `pack === 'srd-5.2'` on a name
   match, falling back to any match only if no SRD entry exists by that name.
8. **Proficiency is true by construction, not computed** — this is a load-bearing
   constraint, not a shortcut to revisit casually: the weapon picker only ever offers
   items parsed out of the character's own chosen starting-equipment option, so there's
   no way to reach the picker with a weapon the character isn't proficient with. This is
   what makes it valid to skip parsing `ClassEntry.weaponProficiencies` prose entirely
   for v0. **If a future feature lets a player attack with an arbitrary/looted weapon,
   this constraint breaks and proficiency must be computed for real at that point.**

## Architecture

- **New parser: `parseWeaponsFromEquipmentChoice(classEntry, letter): EquipmentEntry[]`**
  (lives in `client/src/engine/` alongside `sandbox.ts`, not `character-wizard/parsing.ts`
  — it's sandbox-consumption logic, not wizard-input logic). Steps:
  1. Re-run `parseEquipmentOptions(classEntry.startingEquipment)` to find the option
     matching `letter`.
  2. Split `text` on `,`/`;` and `and`, strip leading quantity numerals ("8 Javelins" →
     "Javelins") and trailing plurals-to-singular normalization only as needed for
     matching (reuse whatever normalization, if any, `getEquipment()` lookups already
     assume elsewhere — otherwise a small local singularize map for the ~15 known
     plural item names in these 12 classes' prose, not a general inflector).
  3. Name-match each cleaned token against bundled (`pack === 'srd-5.2'`)
     `category === 'weapon'` entries; non-matches (packs, tools, currency, "of your
     choice" phrases) are silently dropped — this is expected, not an error, since the
     prose mixes categories by design.
  4. Filter to entries with `damage !== undefined`.
  5. Returns `[]` for a pure-GP option or a non-resolving letter (case 6/3 above) — the
     UI treats empty exactly like the caster page's empty-cantrips case.
- **New engine function `resolveWeaponAttack(weapon, attackBonus, targetAc, rollOverride?)`
  in `client/src/engine/sandbox.ts`**, mirroring `resolveSpellAttack`'s shape: returns
  `AttackResult` (reusing the existing interface — `damage` from `weapon.damage`, always
  present after the picker's filter in step 4 above, so never `undefined` on a hit here,
  unlike the curated-spell case).
- **`CombatSandboxPage.tsx` additions**, mirroring the existing `casterClasses`/
  `cantripToClass` pattern:
  - Compute `weapons = parseWeaponsFromEquipmentChoice(getClass(data.classes[0].classId), data.equipmentChoice)`.
  - Compute attack bonus per weapon: `proficiencyBonus + abilityMod(weapon-derived ability per finding 4)`.
    Proficiency bonus is unconditional here per finding 8 (the picker already guarantees
    proficiency) — reuse the existing `proficiencyBonusForLevel`-style helper already in
    `computeSheet.ts` rather than a new one.
  - A weapon picker alongside (not replacing) the existing cantrip picker — a character
    can have both if multiclassed with a caster class; empty weapons list renders the
    same friendly "no weapons available" message the caster page uses for no cantrips,
    not an error state.
  - Attack log line includes the weapon's `mastery` name as flavor text (e.g. "Hit! 1d8
    Piercing (Mastery: Slow — not applied)") — explicit about it being unapplied, not
    silently omitted, so a reviewer/player doesn't mistake it for "mastery already
    works."

## Not in scope for v0 (mirrors the caster v0's deferral pattern)

- Applying Weapon Mastery properties' actual rules (Vex, Nick, Slow, Sap, etc.) —
  named in the log only.
- Fighting Style selection/effects — untouched; stays under issue #3 as a wizard
  feature, not a sandbox one.
- Two-weapon fighting, thrown-weapon retrieval/range, reach, cover — the sandbox has no
  positional/range model at all today (same as the caster v0).
- Computing weapon proficiency from `ClassEntry.weaponProficiencies` prose — deferred by
  finding 8's constraint; only becomes necessary if a future feature offers weapons
  outside the character's own starting choice.
- Any change to `data/schema.ts` — none needed (see finding 4).

## Task breakdown

1. `parseWeaponsFromEquipmentChoice()` + unit tests (the 12 real class prose strings as
   fixtures, including all 3 of Fighter's options and both gold-only cases) — no
   shared-state risk, fully parallel-safe.
2. `resolveWeaponAttack()` in `sandbox.ts` + unit tests (hit/miss/crit against a fixed
   roll, mirroring `resolveSpellAttack`'s existing test shape) — parallel-safe.
3. `CombatSandboxPage.tsx` wiring (picker UI, attack-bonus computation, log rendering) —
   depends on 1-2 landing first.
4. `PROJECT_SPEC.md`'s M11 row updated; `build-retro.md` gets a dated entry.

Tasks 1-2 run in parallel (review-as-landed on each); task 3 starts once both land.

## Definition of done

- Unit tests pass for the parser (all 12 classes' real prose, including both edge
  cases: a gold-only pick, and Fighter's 3-option shape) and the new resolver.
- `npm --prefix client run build`/`test` clean.
- **Live browser walkthrough with a real martial multiclass** (Fighter/Rogue, per the
  boss's specified test case): create or reuse a saved Fighter 3/Rogue 2 character,
  open the sandbox, confirm the weapon picker shows exactly the weapons from
  `classes[0]`'s (Fighter's) chosen starting-equipment option, resolve at least one
  full weapon-attack-and-monster-counterattack turn, and separately verify a
  gold-only-equipment character renders the empty state instead of crashing.
- If the walkthrough surfaces something that changes scope (not just a bug), stop and
  flag it before pushing — same standing instruction as the caster v0 round.
