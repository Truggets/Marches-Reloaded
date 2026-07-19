# M5 Execution Plan — Leveling to 10 (single class)

## Goal

(Verbatim from `PROJECT_SPEC.md` §4) "Level-up flow grants correct features, ASI/feat choices, and spells per level up to 10."

## What already exists

- **M3** wizard produces `CharacterData` with `classes: [{ classId, level: 1 }]` (literal `1`), stored via `POST /api/characters`; `PUT /api/characters/:id` already exists for updates (no new server work needed).
- **M4** engine (`client/src/engine/computeSheet.ts`) computes level-1-only numbers: `finalAbilityScores`, `abilityModifier`, `proficiencyBonus(classId)`, `hitPoints(classId, conModifier)`, `armorClass(...)`, `spellSlots(classId)`, `skillBonus(...)`. All are level-1-hardcoded (read `featureTable`/`spellSlotTable` row `level === 1`) and must be generalized to accept a target level.
- **Real pack data confirmed this session** (via direct inspection of `app/data/classes.json` and `feats.json`, not memory):
  - `featureTable` rows exist for every class, levels 1–10, each listing that level's named features (e.g. Fighter L4/6/8 = "Ability Score Improvement", L3/7/10 = subclass features already resolved via each class's `subclasses[]` array from M2 — no new data needed for subclass features).
  - `spellSlotTable` rows exist levels 1–10 for full casters (Wizard, Cleric, etc.) and half-casters (Paladin, Ranger — real shape confirmed, no `cantrips` field, that's correct per SRD). Warlock has no `spellSlotTable`; its Pact Magic progression lives in `featureTable[n].extraColumns` (`Eldritch Invocations`/`Cantrips`/`Prepared Spells`/`Spell Slots`/`Slot Level`) for all 10 rows — confirmed real values levels 1–10.
  - **"Ability Score Improvement" is itself a General-category feat** (`feats.json`, id `ability-score-improvement`, repeatable, "increase one ability score by 2, or two scores by 1, no score above 20"). This means the ASI-vs-feat choice at levels 4/6/8 collapses to one uniform step: *pick a General feat you qualify for* (Grappler or Ability Score Improvement, in SRD 5.2 — Origin/Fighting Style/Epic Boon are out of scope here, see below). If the picked feat is Ability Score Improvement, a follow-up sub-choice records which ability score(s) increase.
  - `character-creation.md` "Gaining a Level" (source markdown, lines 769–808) confirms the real step order (choose class → adjust HP → record features → adjust proficiency bonus) and the **Fixed Hit Points by Class** table: Barbarian 7+Con, Fighter/Paladin/Ranger 6+Con, Bard/Cleric/Druid/Monk/Rogue/Warlock 5+Con, Sorcerer/Wizard 4+Con. This is exactly `floor(hitPointDie/2)+1`, so it's derived from the existing `hitPointDie` string already in `classes.json` — **no new data extraction needed**.
  - `species.json`: only **Dwarf** has a per-level HP trait (Dwarven Toughness: "+1 HP max, and +1 again every level gained"). Confirmed via full-catalog scan of every species trait mentioning HP — no other species affects HP.
- **Known pre-existing bug to fix as part of this milestone**: M4's `hitPoints()` never applied species HP traits, so a Dwarf's HP has been under-computed by 1 at level 1 (and would compound by 1/level if leveling shipped without a fix). This must be corrected in the same function rewrite, not carried forward.

## Design decisions (settled before drafting tasks)

1. **`CharacterData` schema extension** (in `client/src/character-wizard/types.ts`):
   - `classes: [{ classId: string; level: number }]` — drop the literal `1` type, allow 1–10. (M5 stays single-class; the array shape from M3 already anticipated M6 multiclassing, so no further restructuring needed here.)
   - New field `levelUps: LevelUpEntry[]`, one entry per level gained above 1, **not** a flat re-append to existing arrays — an ordered, explicit list keyed by level, e.g.:
     ```ts
     interface LevelUpEntry {
       level: number                                   // 2..10
       hitPointGain: number                             // fixed value used (die-average+1, +1 more if Dwarf), no roll option in scope
       featChoice?: { featId: string; abilityIncreases?: Ability[] }  // only present at ASI-granting levels
       spellsAdded?: { cantrips: string[]; prepared: string[] }        // only present for casters at levels where slot/cantrip counts grow
     }
     ```
   - This shape survives M6 multiclassing unchanged in spirit (an entry will just gain a `classId` field then) — same lesson M3 already applied to `classes: []`.
2. **HP uses the fixed table only, no die-roll option.** SRD explicitly allows rolling *or* fixed; rolling adds random-number UI/state for no rules value in a builder tool. Fixed-only is a deliberate scope cut, stated here so it's not mistaken for an oversight.
3. **Species HP traits fold into the HP function now**, since it's being rewritten anyway (per advisor: don't defer a fix you're already touching). Function becomes `hitPoints(classId, level, conModifier, speciesId)`.
4. **No spell re-preparation/swapping.** 2024 rules allow swapping one prepared spell per level-up; out of scope. M5 only *adds* newly-available spell picks as slot/cantrip counts grow with level.
5. **Feature-choice machinery at L1 (e.g. Fighter's Fighting Style) is NOT retrofitted into M3.** The level-up flow's "this feature needs a choice" step is built generally enough that backfilling L1 later is cheap, but M3 characters keep the known gap. Flagged, not fixed, this milestone.
6. **Feat scope = General category only** (matches where ASI/feat choices actually occur in SRD 5.2). Origin/Fighting-Style/Epic-Boon feats are out of scope (Epic Boon is level 19+, entirely above M5's ceiling anyway).
7. **Paladin/Ranger spell save DC/attack bonus stays out of scope**, same reasoning as M4 (`primaryAbility` is a combined string, not a clean single-ability resolution) — leveling still needs their slot *counts*, which come cleanly from `spellSlotTable`, just not the derived attack/DC numbers.

## Task breakdown

### (A) Parallel, no-risk — local code, safe to delegate, no per-task approval needed

**A1 — Engine: generalize `computeSheet.ts` to accept level (Sonnet, fresh subagent).**
- `proficiencyBonus(classId, level)` — read the target level's `featureTable` row instead of hardcoded level 1.
- `hitPoints(classId, level, conModifier, speciesId)` — level 1 = hit-die-max + conModifier (unchanged from M4) + Dwarf's flat +1; levels 2..N = Σ(fixed-HP-per-level, derived from `hitPointDie` via `floor(dieMax/2)+1`, + conModifier, min 1 per level) + Dwarf's +1/level.
- `spellSlots(classId, level)` — same row-lookup generalization for both `spellSlotTable` and the Warlock `extraColumns` fallback.
- `finalAbilityScores(data)` — fold in ability increases recorded across `data.levelUps[].featChoice.abilityIncreases`, still capped at 20, on top of the existing background-increase logic.
- New: `featuresForLevel(classId, level)` — returns the named features gained exactly at that level (for the level-up UI to show "here's what you got").
- New: `isAsiLevel(classId, level)` — true if that level's `featureTable` row includes "Ability Score Improvement" as a feature name.
- Unit tests (vitest) against real values already gathered this session: Wizard L5 proficiency +3, Wizard L5 has 2× 3rd-level slots, Paladin L5 has 2× 2nd-level slots, a Dwarf Fighter leveled to 5 (hand-computed HP including Dwarven Toughness), Fighter `isAsiLevel` true at 4/6/8 false at 5.

**A2 — Level-up UI flow (Sonnet, fresh subagent).**
- New component/route reachable from `CharacterSheetPage.tsx` (e.g. a "Level Up" button, hidden once `level === 10`).
- Stepper walking from `currentLevel + 1` to a chosen target level (≤10), one level at a time:
  - Show that level's new features (via `featuresForLevel`).
  - If `isAsiLevel`, present a feat picker scoped to General-category feats (`listFeats('General')`); if "Ability Score Improvement" is chosen, a follow-up ability-increase sub-choice (+2 one / +1 two, capped at 20 using the character's *current* final scores).
  - If the class is a caster and the new level's slot/cantrip counts exceed the previous level's, present spell pickers for the newly-available count deltas (reusing the existing spell-selection UI pattern from the M3 wizard, filtered to spells at-or-below the new max spell level, same filter-level bug class the M3 fix already guards against).
  - Records one `LevelUpEntry` per level into `levelUps[]`, computing `hitPointGain` automatically (no user input) from the fixed table.
- On finishing the stepper, `PUT /api/characters/:id` with the updated `classes[0].level` and appended `levelUps` entries — this triggers Task B1 below (gated, not part of this task).
- `CharacterSheetPage.tsx` updated to call the new level-aware engine functions (pass `classes[0].level`) instead of the old level-1-only signatures.

Both A1 and A2 launch together (Sonnet, real briefing on file paths/contracts above, frozen function signatures so they don't need to coordinate mid-flight); A2 depends on A1's function signatures, so I'll hand A2 the exact new signatures up front from this plan rather than let it guess.

### (B) Sequential, state-touching — each gets its own explicit go-ahead

1. Local verification: `npm run build` + `npm test` (vitest) in `client/` — not gated, but done before any B-step below.
2. `git push` (own approval).
3. `./scripts/deploy.sh` on the VPS (own approval).
4. Live production verification (see Definition of Done) — no DB migration needed, since `characters` is already a JSON blob column (no schema change).

## Definition of done

- Local: `npm run build` and `npm test` both pass, including new unit tests against the real values captured above.
- Live, in production, at least one full level-up pass on a **real Dwarf character** (per advisor's specific recommendation, since Dwarven Toughness + the proficiency-bonus bump at level 5 are exactly the two things a non-Dwarf test would miss): level a Dwarf Fighter from 1 to 5, confirm at each stopped level the shown features match `classes.json`, confirm the level-4 ASI choice UI appears and correctly applies a chosen increase (capped at 20), confirm final HP matches hand-calculation including Dwarven Toughness, confirm proficiency bonus reads +3 at level 5.
- One caster level-up pass (e.g. Wizard 1→5) confirming new cantrip/prepared-spell picks appear at the correct levels and slot counts match `spellSlotTable`.
- `PROJECT_SPEC.md` M5 row updated to **Done** with the evidence above; synced into `app/docs/planning/`.
