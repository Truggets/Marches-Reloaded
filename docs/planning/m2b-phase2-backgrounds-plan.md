# M2b Phase 2 — Backgrounds Import (draft, not yet committed)

Scope: import the vault's 42 PHB-2024 backgrounds. Depends on Phase 1 (feats), which is
shipped — background-granted Origin feats (e.g. Artisan → Crafter, Entertainer →
Musician) now resolve against the imported `phb-2024` feat pack instead of vanishing.

## 1. Prior-art research
The existing SRD parser (`data/build/parse-backgrounds.js`) already has the right shaped
helper — `findField(blockText, label)`, extracting a `**Label:** value` line. Reusing that
exact pattern name/shape for the vault parser, not reinventing it.

## 2. Implementation research — the real difference from Phase 1
Feats' `benefit` field was used **verbatim** — no secondary parsing needed at import time
(the wizard's own `parseFeatSpellLists`/`parseFeatSpellAbilities` do that later, from
prose, same as the bundled pack). Backgrounds are different: `BackgroundEntry` wants
**structured fields** (`abilityScores?: string[]`, `feat?: string`,
`skillProficiencies?: string[]`, `toolProficiency?: string`, `equipment?: string`), but
the vault's `mechanics` field is one blob where each labeled section is a full
**descriptive sentence**, not a clean value — e.g. Acolyte's real text:
> **Ability Scores:** Increase one score by 2 and a different one by 1, or increase three
> different scores by 1. These increases are chosen from **Wisdom, Intelligence, and
> Charisma** (to a maximum of 20).

Tested and confirmed against this real text: a first-pass regex
(`/\*\*Label:\*\*\s*([\s\S]*?)(?=\n\*\*[A-Z]|$)/`) correctly slices out each labeled
section as a whole (multi-sentence) block — verified for all 5 labels (Ability Scores,
Skill Proficiencies, Tool Proficiency, Origin Feat, Starting Equipment) on the real Acolyte
text. But three of those five need a **second pass** to pull the actual short value out of
the surrounding sentence:
- `abilityScores`: extract the bolded list inside "chosen from **X, Y, and Z**" →
  `['Wisdom', 'Intelligence', 'Charisma']`.
- `skillProficiencies`: extract the bolded skill names inside "proficiency in the
  **Insight** and **Religion** skills" → `['Insight', 'Religion']`.
- `feat`: extract the bolded feat name+parenthetical inside "gain the **Magic Initiate
  (Cleric)** feat" → `'Magic Initiate (Cleric)'` (matches the existing display shape used
  by Sage's SRD entry, `"Magic Initiate (Wizard)"`).
`toolProficiency` and `equipment` stay as the whole extracted sentence (the existing
`BackgroundEntry` schema already treats both as free-text strings, same as the SRD pack —
no further extraction needed).

**Caveat (advisor-flagged):** the second-pass extraction was only verified against
Acolyte. Real phrasing variance expected across the other 41 entries: a tool proficiency
can be a *choice* ("**Artisan's Tools (one type of your choice)**"), a feat sentence can
omit the parenthetical entirely ("You gain the **Skilled** feat, which instantly
grants…"), and skill/ability sentences may not all use "chosen from" or may bold multiple
names differently. Design the parser to extract per-label and **throw naming the specific
background and label** whenever a second-pass extraction comes back empty, rather than
silently producing an empty/wrong value — and expect the first real 42-entry run to
surface several of these and need pattern additions, the same way Phase 1's parser was
hardened after its first real run. Don't design for one-shot success on the full set.

## 3. Known coupling risks (from `m2b-execution-plan.md`, re-confirmed + corrected here)
- **Real bug, not "should already work":** `findFeatByBackgroundFeatText`
  (`CreateCharacterPage.tsx`) does `listFeats().find(f => f.name === bareName)`. Post-
  Phase-1, `listFeats()` returns `[...bundledFeats, ...importedFeats]` — so an *imported*
  background whose feat text says "Magic Initiate (Cleric)" resolves to the **bundled**
  `magic-initiate` first (first-match-wins across packs on a bare name), not the imported
  pack's own entry. That's a silent cross-pack resolution — exactly the class of bug
  namespacing (Phase 1) was adopted to prevent, just one level up (backgrounds pointing
  at feats, rather than feats colliding directly). The fix isn't just gating on the
  feat's `name` instead of a hardcoded bundled `id` (that alone still leaves the *lookup*
  returning a possibly-wrong-pack feat) — it's resolving a background's feat **within its
  own pack first** (the background carries `pack`, and once imported has its own `pack`
  value too), falling back to searching any pack only if that misses. One decision, not
  two half-fixes.

## 4. Proposed plan
1. `data/build/parse-backgrounds-import.js` — mirrors `parse-feats-import.js`'s CLI shape
   (`--input`/`--output`/`--pack-id`, no default output path), using the two-pass
   `findField` + bolded-value extraction above. Throws (rejecting the whole pack, naming
   the offender) if a background's `mechanics` doesn't contain all 5 expected labels, or
   if the ability-scores/skill-proficiencies bolded-list extraction comes back empty.
2. Extend `pack_content`'s stored `content` shape from `{feats: [...]}` to also carry
   `backgrounds: [...]` (additive, no migration needed — it's a JSON blob column).
3. `POST /api/admin/packs/import` gains a `backgrounds` field alongside `feats` (both
   optional per request, so a single import can carry either or both).
4. `data/index.ts` gains the same bundled+imported merge pattern for
   `listBackgrounds`/`getBackground` that Phase 1 built for feats.
5. Fix `backgroundFeatSpellList`'s hardcoded id check (item 3 above) — this is a real bug
   fix independent of the import machinery, worth landing regardless.
6. **Decision: two separate textareas** (Feats JSON, Backgrounds JSON), not a combined
   one — mirrors the vault's own per-content-type file layout (the admin pastes each
   book's feats and backgrounds sections separately anyway), keeps per-field validation
   errors unambiguous (which textarea's JSON is malformed), and matches the CLI's
   `--input`/two-parser shape from item 1 rather than requiring a combined schema.
7. `StepOrigin.tsx` (read this session — both species and background pickers are flat
   `grid grid-cols-2/3` button lists, the same shape `FeatPicker` replaced for feats).
   **Decision: generalize.** Read `FeatPicker.tsx` in full — it's already effectively
   generic: category filtering happens entirely in the *caller* (`listFeats('Origin')`
   etc., before the array is ever passed in), and the component body only touches
   `id`/`name`/`pack` plus the button label. No feat-specific logic actually lives inside
   it. Rename to `ContentPicker<T extends { id: string; name: string; pack: string }>`,
   parameterize the `items`/`selectedId`/`onSelect` props and the render callback (so
   callers can still show feat-specific extras like the benefit text below the picker,
   same as `StepSpeciesBonus.tsx` does today), and use it for both `FeatPicker` (thin
   wrapper or direct replacement) and the new background/species picker in
   `StepOrigin.tsx`.

## Not yet done
- Live-verify §3's fix once implemented (a background from a second imported pack whose
  feat text names a feat that also exists in a different pack, resolving to the correct
  pack's copy).
- **Holding this doc uncommitted** until the 3 parallel review agents (browser-tester,
  code-reviewer, UI/graphics QA) report back on Phase 1, per Truman's instruction to batch
  commits at the start of each new cycle. Status: code-reviewer and UI/graphics QA have
  reported (code-reviewer's 2 critical + 1 important findings — including confirmation of
  this doc's own §3 bug — already fixed in `CreateCharacterPage.tsx`/`data/index.ts`/
  `LevelUpPage.tsx`/`server/src/index.js`, build+test clean; UI/graphics QA hit a
  shared-tab conflict with the still-running browser-tester and stopped before finishing,
  to be resumed once the tab is free). Browser-tester still running.
