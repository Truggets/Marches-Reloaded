# Plan: content-pack importers for vault monsters (35) and skills (18)

**Status:** draft for Truman's approval, 2026-11-19. No code written. Extends `docs/planning/issue-22-and-subclass-import-plan.md` (which flagged the monster data gap on 2026-09-15). Authorized by Truman in #marches ("yes to both", "lets plan the importer").

## Findings (verified 2026-11-19 against the vault `json/` folder)

**Skills** — `skills-complete-v2.json`, key `skills`, 18 entries, shape `{name, ability, source, mechanics_first[], lore_and_flavor}`. All 18 SRD skills, each with its ability (matches the hardcoded map in `client/src/engine/computeSheet.ts:515`). The text is expanded rules/uses (DCs, tool synergies), not mechanics the engine consumes. Nothing in the repo reads this file today.

**Monsters** — 35 entries in 4 files, two shapes:
- `Core-Redesigned-Monsters` (10), `Core-and-Expansion-Giants-and-Undead` (10), `Planar-and-Setting-Monsters` (8): `{name, source, category, mechanics_first[], lore_and_flavor}` (Giants file adds `class`). Stats are bullet strings, e.g. `**Armor Class (AC):** 15 (Leather Armor, Shield)`, actions as free text.
- `Legendary-Icons-and-Arch-Fiends` (7, key `legendary_monsters`): structured string fields (`challenge_rating`, `ac`, `hp`, `speed`, `saving_throws`, `skills`, `senses`, `languages`, ...) plus `special_traits[]`, `actions[]`, `legendary_actions[]`, `lore`.
- **No entry in any of the 4 files has ability scores, size, creature type, or alignment.** I checked all 35: the only "Strength" matches are save-DC text. The bundled `MonsterEntry` (`data/schema.ts`) requires `abilityScores`, `size`, `creatureType`, `alignment`, so these files cannot populate it. The combat sandbox needs ability scores (e.g. the Topple Con save, #28).

## Proposal

Follow the existing M2b importer pattern exactly (as `parse-hazards-import.js` / PR #39): a `parse-*-import.js` that rejects the whole pack and names the offender, a `verify-*-import.js`, a fixture under `data/build/fixtures/`, a new textarea in `AdminPackImportPage.tsx`, a field in `POST /api/admin/packs/import`, and display on the existing `/reference` page. Vault files stay outside the repo (non-SRD content, per CLAUDE.md).

### Phase A — Skills (small, ship first)
- New `SkillReferenceEntry {id, name, ability, description, pack, source}` in `data/schema.ts`; `listSkillReferences()` in `data/index.ts`; import-only, same as hazards.
- Parser guard: reject an entry whose `ability` disagrees with the engine's skill-to-ability map (catches data errors).
- Display-only: a "Skills" section on `/reference`. Does not feed the engine. The bundled skill list stays the source of truth for sheet math.

### Phase B — Monsters, display-only bestiary (no ability scores needed)
- New `BestiaryEntry` type, separate from `MonsterEntry`, so the sandbox and its required fields are untouched.
- Parse the stats that exist: CR, XP, AC, HP and hit dice, speed, saves, skills, damage resistances/immunities, senses, languages. Traits, actions and legendary actions kept as text. Both shapes handled by one parser with two input adapters.
- Display on `/reference` ("Bestiary"): searchable stat blocks, grouped by category.
- Lore text stored with the entry, same description-assembly convention as hazards.

### Phase C — Sandbox-eligible imported monsters (only if Truman wants it)
Blocked on ability scores that do not exist in the vault files. Options: (1) Truman adds an optional `ability_scores` field to the vault entries and the parser picks it up; (2) accept imported monsters in the sandbox without ability-based saves; (3) leave imported monsters display-only. Also needs a structured action parse (attack bonus and damage per action). I recommend deciding this after Phase B ships.

## Verification
- Fixture files per parser plus bad-input fixtures (missing name, bad ability), matching the existing importers.
- `verify-*-import.js` run in the same build pipeline; client tests for list functions.
- Independent Opus review posted as a formal `gh pr review` on each PR (per Truman's 2026-11-19 decision); one PR per phase.
- Smoke test on a throwaway account after deploy; production import is Truman's own step in the admin UI.

## Open questions for Truman
1. Approve Phase A then B as above (display-only), with C deferred?
2. For Phase C: would you add ability scores to the vault monster files, or leave imported monsters out of the sandbox?
3. The Legendary file includes deity-tier creatures (CR 23-30): any entries you want excluded from the bestiary?
