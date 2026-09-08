# Content-Import UX + Combat Sandbox — Research Draft

This extends `docs/planning/m2b-execution-plan.md` (id namespacing: confirmed
`phb-2024:`-style; v1 scope: confirmed feats/backgrounds/species/equipment) with two more
requests: (A) UI conventions for browsing a much larger, multi-pack content library, and
(B) a new "target dummy" combat sandbox feature. (B) is not part of M2b — it's a separate
gameplay feature — and is written up here as its own section rather than folded into the
M2b milestone, so milestone tracking in `PROJECT_SPEC.md` stays honest.

## A. Content-browsing UX conventions

### A1. Collapsible modular sections
No new dependency. Native `<details>`/`<summary>` gives free keyboard support, no JS
state management, and themes trivially with the existing `pixel-panel`/`pixel-label`
classes — matches this repo's "don't add a dependency you can build in an afternoon"
posture and its zero-UI-library stack (checked `client/package.json`: no component
library, Tailwind + hand-rolled `pixel-*` classes only). Considered shadcn/ui's Accordion
(free, MIT, Tailwind-based, matches the stack) but its visual system doesn't match this
app's pixel-art aesthetic and the app has no shadcn setup today — not worth introducing a
components pipeline for what `<details>` already does. One collapsible section per pack
per category (e.g. "Feats — PHB 2024 (58)"), collapsed by default once more than ~1 pack
is loaded; the always-bundled SRD content stays expanded (it's small and primary).

### A2. Search bars
Plain controlled `<input>` + client-side substring filter. Even after import, category
sizes stay in the hundreds (58 feats, 42 backgrounds, 339+ spells) — no virtualization or
search library needed. Add to: feat pickers (Origin/General), background/species pickers,
spell pickers (`StepSpells` — already the largest lists), and the equipment list. Filters
by name only, not full mechanics text, to keep it predictable.

### A3. Wilbur relays mechanical deltas — more expensive than it first looked
Currently `WilburTip` (`client/src/WilburTip.tsx`) shows static advice text keyed off the
current step. The idea: whenever a choice changes a computed stat, diff before/after using
`computeSheet.ts` and have Wilbur state the delta in one line. But mid-wizard there is no
full `CharacterData` to diff — `CreateCharacterPage` holds a dozen separate `useState`
values and only assembles the real `data` object at `handleSave`; `abilityScores` is
`null` until step 3, `equipmentChoice` is `null` until step 6, and `armorClass()` throws on
an incomplete/unparseable input rather than returning a partial result. Building this for
real means a provisional-character builder plus null-safety at every `computeSheet.ts` call
site used this way — a real, cross-cutting change, not a small addition to one component.
(Also: the equipment step offers lettered gear *bundles*, not individual armor pieces, so
"Choosing Chain Mail: AC 10 → 16" isn't literally how the UI works — bundle-level deltas
like "Option A: AC 10 → 16" would be the accurate version.) Recommend treating this as its
own scoped follow-up rather than bundling it into the content-import work.

### A4. Mechanics-first, flavor-last, bold-key-terms
Already the vault content's own natural shape (`mechanics`/`mechanics_first` fields come
before `lore_and_flavor` in every file, and mechanics text is already bolded at the
important nouns/numbers in the source). The parsers (Phase 1-4 of the M2b plan) should
preserve that ordering into the structured fields the app renders, and the flavor text
should render **pre-collapsed** (same `<details>` pattern as A1) under a "Flavor" label,
closed by default, so a fast reader sees mechanics first without a click.

**Prerequisite gap found while reviewing this:** the app has no markdown-emphasis
renderer today. `StepSpeciesBonus`/`WilburTip`/the sheet all render `feat.benefit` and
similar fields as plain text — the `**bold**`/`_italic_` markers print as literal
asterisks/underscores (visible in this session's own #15 screenshots: `_Two Cantrips._`
renders as literal characters). The current pack's 17 feats are lightly marked so it's
tolerable; the vault content is `**bold**` on nearly every key noun/number across all 58
feats, 42 backgrounds, 18 species. Importing it as-is makes "bold the important
information" *worse*, not better — this needs a small emphasis renderer (or a strip pass in
the parser that converts `**bold**` into real `<strong>`) *before* any of A4 lands, and
it's a good candidate for its own quick standalone fix, since it also improves the
currently-shipped SRD content.

### A5. Citations
The vault data carries page-reference citations (e.g. `["[304]", "[305]", "[1269]"]`) —
not full bibliographic entries, just page/paragraph markers into the source book. `schema.
ts`'s `SourceRef` currently has only `book`/`section`; extend it with an optional
`citations?: string[]`. Surface them as a small popover/tooltip anchored near
`WilburCompanion` (`client/src/WilburCompanion.tsx`) — **note for the questions list**:
that component currently renders bottom-*right* and is hidden below 640px width; "bottom
left" may just mean "near Wilbur" rather than a literal corner change — flagging rather
than assuming. The bubble shows citations for whatever entry is currently open/expanded.

## B. Combat sandbox ("target dummy" mode)

### B1. What was researched
- **Monster data — better than first thought.** The pinned upstream source this app
  already builds from (`downfallx/dnd-5e-srd-markdown` at commit `1b4b99d`, per
  `PROJECT_SPEC.md`) includes `monsters.md`, `monsters-A-Z.md` (full bestiary), and
  `animals.md` — none of which were vendored into `data/build/source/` yet (that directory
  currently only has the character-creation-relevant files: classes, species/origins,
  feats, spells, equipment). So the correct move is pulling `monsters-A-Z.md` from the
  *same already-pinned commit* into `data/build/source/` and writing `data/build/
  parse-monsters.js` in the exact same pattern as the existing `parse-*.js`/`verify-*.js`
  scripts — zero new provenance or license question, no second data source. [Open5e](https:
  //open5e.com/) (free, open-source, CC-BY, SRD-2024-aware) is a reasonable fallback if the
  pinned source's bestiary format turns out to be unparseable, but isn't the first choice.
  Curate a small subset (8-12 common low-tier monsters — goblin, wolf, skeleton, etc.) into
  a new `data/monsters.json`, bundled like everything else — not a live API call (this
  app's architecture is explicitly "bundled JSON, not a live API," per CLAUDE.md).
- **Blocked on the weapon-mechanics chain, not parallel to it.** `computeSheet.ts` has no
  weapon-attack function today — `spellcastingInfo` covers spell attacks only, and
  `CharacterData.equipmentChoice` is a single letter resolving to prose ("Option A: Chain
  Mail, Greatsword, Flail..."), not structured item references. A martial character has no
  attack bonus or weapon damage the engine can compute. Real order: M2b Phase 4
  (structured weapon `damage`/`mastery` data) → parse `equipmentChoice`'s prose into actual
  item references → a new `weaponAttack()` in the engine → *then* the sandbox can resolve a
  martial character's attacks. A caster-only sandbox v0 (spell attacks work today via
  `spellcastingInfo`) is possible sooner; a martial character in the sandbox is not.
- **Full VTT engines** (Owlbear Rodeo, DungeonFog, MapTool, RPGMapEditor): all either
  non-commercial-licensed, require self-hosting a separate server/Docker stack, or are full
  multiplayer fog-of-war map editors. All of that is far more than "test my character
  against a few monsters on one map" needs, and would violate the "no ongoing costs /
  self-hosted on the existing VPS, nothing extra" constraint by adding a second service to
  run and maintain.
- **Existing combat-simulator npm packages** (`5e-combat-simulator`, `dnd-combat-
  simulator`): both effectively abandoned (years since last release) and designed for
  batch win/loss statistics, not an interactive single-player UI — not a fit.
- **Conclusion: build it in-house, small.** A single-page React view: one player token +
  N monster tokens on a plain CSS-grid battle grid (no canvas library, no pathfinding
  library — 5e combat on a grid is simple enough for hand-rolled turn logic), reusing the
  character's already-computed stats (AC, HP, attack bonus, save DC — all already produced
  by `computeSheet.ts`) against the new bundled monster stat blocks. Monsters act with a
  simple fixed rule ("attack the player if in range, else move toward them") — not real AI,
  not homebrew-monster support in v1.

### B2. Scope boundaries (deliberately excluded from v1)
- No multiplayer/shared sessions — single browser tab, local to the player testing their
  own character.
- No fog of war, no map authoring/upload, no terrain — one fixed open grid.
- No persistence — a sandbox run doesn't save to the character or the DB; it's a
  scratch space.
- No homebrew/imported monsters in v1 — only the bundled SRD subset, to avoid the same
  non-SRD-content-shipping problem M2b exists to solve (a monster pack would need the same
  import machinery M2b is building, which isn't done yet).

## Advisor review requested on
1. Whether A3 (Wilbur stat-delta) is worth building now vs. deferring — it touches every
   wizard step, not just the new content.
2. Whether B (sandbox) should be its own milestone in `PROJECT_SPEC.md` (recommend: yes,
   append a new row rather than silently expanding M2b's definition).
3. Any risk in the A1/A2 "no new dependency" call given the scale of content this is about
   to hold.

## Decisions (confirmed by Truman, 2026-09-08)
- Flavor text: truncate/collapse the real source text, no generated summaries.
- Citations: player-facing, not admin-only.
- WilburCompanion stays bottom-right; the citation bubble anchors there too.
- Sandbox ships as a caster-only v0 first; martial support follows the weapon chain
  (M2b Phase 4 + issue #3) later.
- Monsters get a real `MonsterEntry` schema category in `schema.ts`, same pack/source
  pattern as every other category — not throwaway sandbox-only data.
- A3 (Wilbur mechanical-delta relay) is deferred — filed as its own follow-up issue,
  not built as part of this wave.
- The sandbox gets its own row in `PROJECT_SPEC.md`'s milestones table.
- Implementation starts with **M2b Phase 1: feats import** (see
  `docs/planning/m2b-execution-plan.md` §3) — highest value, zero new UI, closes #13,
  no dependency on anything else in this doc.
