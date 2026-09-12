# M11 — Combat Sandbox, Caster-Only v0 — Execution Plan (built 2026-09-09, not yet browser-verified)

## Goal
Per `docs/planning/content-ux-and-sandbox-plan.md` §B (research + decisions already
confirmed by Truman 2026-09-08) and `PROJECT_SPEC.md`'s M11 row: a single-page,
single-player scratch space to test a saved character's spell attacks against a small
bundled set of SRD monsters on one open grid. No persistence, no multiplayer, no map
authoring. Ships caster-only first — martial-character support stays blocked on
`weaponAttack()` (issue #3), which M2b Phase 4 (shipped) only half-unblocks.

## What already exists
- `spellcastingInfo(classId, classes, abilityScores)` in `computeSheet.ts` returns
  `{ ability, attackBonus, saveDC }` — exactly what a caster needs to resolve an attack
  roll or force a save. No changes needed here.
- M2b Phase 1-4 (feats/backgrounds/species/equipment import) — unrelated to this
  feature directly, but established the `data/build/parse-*.js` + `verify-*.js` +
  `schema.ts` category pattern this plan reuses for monsters.
- The pinned upstream source (`downfallx/dnd-5e-srd-markdown`, commit `1b4b99d`, same
  one every other bundled category already builds from — CC-BY, zero new provenance
  question) has real bestiary content in two files: `monsters-A-Z.md` (humanoids/
  undead/fiends etc., `## <family>` → `### <monster>` heading structure) and
  `animals.md` (beasts, `## <monster>` heading directly, no family wrapper). Both
  confirmed structurally deterministic: AC/Initiative/HP/Speed lines, an ability-score
  `<table>`, Skills/Senses/Languages/CR lines, then `Traits`/`Actions`/(`Legendary
  Actions`) sections with consistently-formatted `_Hit:_ N (XdY [+ Z]) <Type> damage`
  phrasing in every action I sampled.

## Decision resolved this session (confirmed with Truman)
**Spell damage on a hit: curated lookup, not a schema-wide parse.** `SpellEntry` has no
damage field (`description` is prose only), and parsing all 339 spells' wildly-varying
phrasing is a much bigger, riskier task than the sandbox itself — not a "v0." Instead:
a small hardcoded `{ 'fire-bolt': '1d10 Fire', ... }`-shaped lookup for the ~6-10 attack
cantrips a level 1-10 caster actually uses in combat, matching `SPELL_GRANTING_FEATS`'s
existing precedent in `parse-feats-import.js`. A spell not in the lookup still resolves
hit/miss; damage falls back to showing the spell's own description text for the player
to read/roll manually — not a hard error, since the sandbox must not crash on a
legitimately-selected spell it doesn't have curated damage for.

## Curated monster set (10, CR 1/8 to CR 2 — spans a level 1-5 test range)
Sourced from the two files above at the pinned commit; only these 10 stat blocks get
vendored (not the full ~650KB combined bestiary) into a new curated
`data/build/source/monsters.md`, citing the source commit per-entry the same way
`equipment.md`/`feats.md` already do:

| Monster | CR | Source file |
|---|---|---|
| Bandit | 1/8 | monsters-A-Z.md |
| Goblin Minion | 1/8 | monsters-A-Z.md |
| Giant Rat | 1/8 | animals.md |
| Wolf | 1/4 | animals.md |
| Skeleton | 1/4 | monsters-A-Z.md |
| Zombie | 1/4 | monsters-A-Z.md |
| Goblin Warrior | 1/4 | monsters-A-Z.md |
| Goblin Boss | 1 | monsters-A-Z.md |
| Brown Bear | 1 | animals.md |
| Bandit Captain | 2 | monsters-A-Z.md |

## Architecture
- **`MonsterEntry` schema** (new category in `schema.ts`, same `pack`/`source` pattern
  as every other category — per Truman's confirmed decision, not throwaway sandbox-only
  data): `{ id, name, size, creatureType, alignment, ac, hp, hitDice, speed,
  abilityScores: Record<Ability, number>, skills?, senses?, languages?, cr: string,
  xp: number, traits: {name, description}[], actions: {name, attackBonus?, damage?,
  description}[], legendaryActions?: {...}[], pack, source }`. `damage` on an action is
  structured (e.g. `"1d6 + 2 Piercing"`) since monster action text is consistently
  formatted enough to extract deterministically (confirmed by sampling) — an
  intentionally asymmetric answer versus player spell damage (curated lookup, not
  full extraction), noted here explicitly rather than left implicit.
- **`data/build/parse-monsters.js`** — deterministic, heading/table-driven (mirrors
  `parse-species.js`'s table-extraction helpers), handles both the `##`-family/`###`-
  monster and flat `##`-monster heading shapes since the curated source file mixes
  entries from both origin files. Extracts AC/HP/Speed via the same `**Label**
  value` line convention already used elsewhere; ability scores from the `<table>` via
  the existing `table-parser.js` helpers; actions' `_Hit:_ N (dice) Type damage` via a
  new regex, throwing (naming the offender) if an action claims to be an attack
  ("_Melee/Ranged Attack Roll:_") but its damage doesn't match the expected shape —
  same "reject rather than silently emit wrong data" discipline as every other parser
  in this repo.
- **New engine functions in `computeSheet.ts`** (or a new `client/src/engine/sandbox.ts`
  if that reads cleaner — decide during implementation, not a plan-blocking question):
  `resolveSpellAttack(spellId, casterAttackBonus, targetAc)` → hit/miss + damage (from
  the curated lookup, or `undefined` if not curated); monster turn logic is a simple
  fixed rule ("attack the player if in range, else move toward them" — not real AI),
  resolved with the monster's own `actions[0].attackBonus`/`damage` against the
  player's computed AC.
- **New page**: a plain CSS-grid battle view (no canvas/pathfinding library, matching
  the plan's "5e combat on a grid is simple enough for hand-rolled turn logic"
  conclusion) — one player token, N monster tokens the player picks from the curated
  10, turn-by-turn resolution, no save/persist. Route it off an existing character's
  sheet (`CharacterSheetPage.tsx` already has the computed stats a sandbox run needs)
  rather than a fresh data-entry flow.

## Task breakdown (for next session's execution pass — not started this turn)
1. Vendor the curated `data/build/source/monsters.md` (10 entries, cited to the pinned
   commit) — local file creation, no risk.
2. `data/schema.ts`: add `MonsterEntry` + `Monster` to `ContentPack`.
3. `data/build/parse-monsters.js` + `verify-monsters.js`, wired into `build-srd.js`.
4. Curated spell-damage lookup (small, hand-written, lives with the sandbox engine
   code, not the data pack — it's UI-behavior data, not content-pack data).
5. Engine: `resolveSpellAttack` (or equivalent) + monster-turn resolution logic, with
   unit tests (this repo's highest-value test surface per `CLAUDE.md`'s testing
   section — apply the same standard here as multiclass math).
6. New sandbox page/route + battle-grid UI.
7. `PROJECT_SPEC.md` gets M11's row updated to reflect what shipped; `build-retro.md`
   gets a dated entry.

Tasks 1-5 are independent/parallelizable (no shared-state risk, git-reversible);
task 6 depends on 2-5 landing first. No step here touches push/deploy/migrate.

## Definition of done
- `node data/build/verify-monsters.js` passes; `npm --prefix client run build`/`test`
  clean. **Done** — 71/71 tests, clean build, both confirmed multiple times across
  the 3-round implementation.
- A live manual walkthrough: pick a saved caster character, enter the sandbox, select
  1-2 of the 10 monsters, resolve at least one full attack-and-response turn, confirm
  hit/miss and (where curated) damage match hand-calculation. **Not yet done** — this
  build was verified via unit tests + build/typecheck + code review, not an actual
  browser session. Worth doing before/at first real use, same caveat M2b's phases
  carried.
- Explicitly NOT in scope for v0 (confirmed by the original research + Truman's
  decisions): martial characters, persistence, multiplayer, homebrew/imported
  monsters, map authoring, real monster AI.

## What actually shipped vs. the original plan
- UI scope was deliberately narrowed from the original research's "CSS-grid battle
  view, tokens on a grid" to a two-panel You-vs-Monster layout with pickers and a
  turn log — the token-positioning idea added real UI surface for no gameplay value
  once the turn-resolution logic was already built; a flat picker/log UI is simpler
  and ships the same functional v0. Flagging this as a deliberate scope call made
  during implementation, not an oversight.
- Review across all 3 rounds caught real bugs every round: the monster parser's
  attack-roll detection was narrower than the phrasing it needed to catch (fixed);
  the sandbox page's HP/AC computation only validated `classes[0]`'s id before
  calling functions that iterate every class and throw on an invalid one (fixed);
  caster-class selection took the first spellcasting-shaped class only, silently
  wrong or falsely negative for real multiclass casters like Paladin/Ranger-first or
  Cleric/Wizard dual-caster builds (fixed) — see `docs/planning/build-retro.md` for
  the pattern-level takeaway.
