# #5 (Wizard spellbook) + #6 (change prepared spells) — scoping plan

Status: plan only, nothing built. 2026-09-25.

## What exists today (verified in code)

- Spells live in `CharacterData` as `spells: {cantrips, prepared}` (creation) plus `levelUps[].spellsAdded` (append-only). `spellsForClass()` (`CharacterSheetPage.tsx:70`) just concatenates them per class.
- "Prepared" is therefore really an **append-only known list**: nothing can ever remove or swap a spell. That is the root of #6.
- Wizards pick their level-1 "prepared" spells (4) straight from the whole Wizard list. There is no spellbook, so #5 has nothing to attach to. `LevelUpPage` offers `preparedOptions` from the full class list too.
- Sheet spell section is read-only.

## SRD 5.2 rules to encode (from the bundled class text)

| Class | Change prepared spells | Notes |
|---|---|---|
| Wizard | Long Rest: swap any, **from spellbook** | Spellbook: 6 level-1 spells at L1, +2 per Wizard level after 1 (levels you have slots for). Prepared count from table. |
| Cleric, Druid | Long Rest: swap any | from full class list |
| Ranger | Long Rest: swap one | |
| Bard, Sorcerer, Warlock | On gaining a level: swap one | |
| Paladin | **No change clause found in our data** | Verify against SRD source before coding (extraction may have dropped it). |

Out of scope: Spell Mastery / Signature Spells / Memorize Spell (wizard L5/18/20), spells copied from scrolls, spellbook cost/time.

## Data model (additive, absent-safe like every other field)

- `spellbook?: string[]` on `CharacterData` (Wizard L1 six) and `levelUps[].spellsAdded.spellbook?` (+2 per level). Wizard-only; other classes ignore it.
- `preparedByClass?: Record<classId, string[]>`: the **current** prepared list once a player edits it. Absent = fall back to today's derived list, so every existing character keeps working unchanged. Level-up picks append to it when present.
- `spellsForClass()` stays the single reader and returns the override when set. New pure engine helpers with tests: `preparedLimit`, `eligibleToPrepare(classId, level, spellbook?)`, `validatePreparedList`.

## Proposed PRs (small, per this project's lesson that small PRs review better)

1. **PR 1 — #5 Wizard spellbook.** Creation step and level-up: pick 6 (then +2/level) into the spellbook, then choose prepared spells *from the spellbook*. Sheet shows spellbook. Engine helpers + tests. Migration: existing wizards get `spellbook` = their current prepared list (no data loss).
2. **PR 2 — #6 edit prepared spells on the sheet.** "Change prepared spells" button per caster class: Long-Rest classes edit freely within the limit/eligibility (Wizard restricted to spellbook); Ranger swap-one. Level-up swap-one for Bard/Sorcerer/Warlock in `LevelUpPage`. Persists `preparedByClass`.

Order: PR 1 first (PR 2's Wizard rule depends on the spellbook).

## Risks

- Multiclass: prepared limits are per class; helpers must key by `classId` (existing convention).
- Old saves: everything absent-safe, plus a regression test loading a pre-change character.
- Always-prepared spells (domain/oath/feat) must not count against the limit; check how `originFeatSpells` etc. are kept separate today.

## Open questions for Truman

1. Long-Rest edit: honor system (edit any time) or a "Long Rest" button? Recommend honor system, no rest tracking exists yet.
2. Spellbook: enforce the exact 6 + 2/level counts, or allow extras (found scrolls)? Recommend enforce at creation/level-up, allow manual adds later.
3. Paladin: confirm the rule from your SRD copy.
