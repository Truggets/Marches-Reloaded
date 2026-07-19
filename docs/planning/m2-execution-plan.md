# M2 Execution Plan — Content-driven data engine + SRD 5.2 pack

*Trugg Build · M2 · 2026-07-18*

## Goal (PROJECT_SPEC.md §4)
Engine reads all content (species, classes/subclasses, backgrounds, feats, spells, equipment) from a content-pack format; SRD 5.2 ships as the default pack; data is queryable and pack-scoped. Core architecture, not a late add-on.

## Research findings (confirmed live, not assumed)
- **Live 2024-SRD APIs are not usable as a data source.** Open5e's `srd-2024` document is missing 5+ of the 12 core classes as base entries; 5e-bits has no `/api/2024` endpoint at all. Confirms the locked decision: bundle a self-owned dataset, don't call a live API from the app.
- **Source**: [`downfallx/dnd-5e-srd-markdown`](https://github.com/downfallx/dnd-5e-srd-markdown), CC-BY 4.0 (SRD 5.2.1), matches our legal constraint exactly. **Pinning to tag `v1.0.0` / commit `1b4b99dcb786cdd1a2fb26f8acec1551191f1ca4`** (not `master`) so regeneration is deterministic and doesn't silently drift if upstream changes.
- **Source structure is parser-friendly, not prose-only**: real HTML `<table>` elements for structured data (class core traits, features-by-level, ability tables, equipment/coin tables), plus consistent markdown conventions for prose (`#### Heading` per entry, `_Trait Name._ Description...` for traits/features/feats). This means extraction can be **deterministic parser code**, not LLM transcription — critical for correctness at this volume (12 classes, 500+ spells).
- Six files scoped in: `classes.md` (298KB), `character-creation.md` (51KB, incl. multiclassing), `character-origins.md` (17KB, backgrounds+species), `feats.md` (7.6KB), `equipment.md` (72KB), `spells.md` (325KB). Deferred out of scope: `magic-items.md`, `monsters.md`, `gameplay-toolbox.md`, `rules-glossary.md` — not character-builder inputs.

## Why classes first, not all six in parallel
Classes is the hard case: per-level features, embedded choices ("choose 2 skills"), subclass feature-levels, caster spell-slot progression, multiclassing prerequisites. If the JSON schema is designed and frozen against the easy cases (species, equipment) first, it will likely break when classes hits it, and every already-built parser has to be redone. So: **I build the schema + classes parser myself first** (hardens the schema against the hardest content type), then fan the remaining five out to parallel subagents against a frozen, proven schema.

## Definition of done (not "build succeeds" — parser correctness is verified)
For every content type: **source-entry-count == output-entry-count**, with every source heading that produced no object logged and explained (not silently dropped). Plus a small set of known-value spot checks run as an actual test, e.g.:
- Barbarian gets Rage at level 1, Extra Attack at level 5, has exactly N subclasses.
- Fireball is a 3rd-level spell, 150 ft range, deals fire damage.
- Dragonborn has a Breath Weapon trait and a Draconic Ancestry table with N ancestor entries.
- Multiclassing prerequisite table matches the SRD (ability score minimums per class).

This is the actual "engine reads all content correctly" bar — a clean `npm run build` alone does not prove it.

## Scope: full SRD breadth this pass
Since extraction is parser-driven (not hand-transcription), going from "a few classes" to "all 12" is mostly the same code running against more input — the marginal cost is spot-check verification, not authoring. Recommending **full breadth**: all 12 classes + subclasses to level 10, all SRD spells, all SRD equipment, all SRD feats, all SRD species, all SRD backgrounds. If the classes-parser prototype reveals this is more expensive than expected (e.g. subclass tables are inconsistent per-class), I'll flag it before fanning out rather than push through silently.

## Content-pack schema (frozen after the classes prototype, then reused everywhere)
- Every entry carries `pack: "srd-5.2"` / `source: { book: "SRD 5.2.1", page?: string }`.
- Top-level pack manifest: `{ id, name, version, license: "CC-BY 4.0", attribution: <full SRD attribution text>, sourceCommit: "1b4b99d..." }`.
- TypeScript types defined in `app/data/schema.ts`, exported for both the build scripts and the client query layer to import — one source of truth, no drift between what the parser emits and what the engine expects.
- Exact per-type shape (class/subclass/species/background/feat/spell/equipment) drafted during the classes prototype and included in the plan update I'll post before fan-out.

## Task breakdown

### Phase 1 — schema + classes (done by me, not delegated; hardens the schema)
1. Write `app/data/schema.ts` (TS types) against `classes.md`'s actual structure.
2. Write `app/data/build/parse-classes.js` — parses core traits table, features-by-level table (handling per-class extra columns), subclass sections, spell-slot progression tables.
3. Run it, reconcile count (12 classes × subclasses × levels 1-10), spot-check 3 classes against the source by hand.
4. Post a short update to Truman with the frozen schema + prototype results before fanning out (this is the "present before executing" checkpoint for the schema-risk part of M2).

### Phase 2 — parallel fan-out (starts after schema is frozen, no approval needed — local files only, no state-touching)
Each gets: the frozen `schema.ts`, the relevant scratchpad source file, the pinned commit SHA, and the count-reconcile + spot-check definition of done above.
1. **Species parser** (Sonnet) — `character-origins.md` species section → `app/data/build/parse-species.js` + `app/data/species.json`.
2. **Backgrounds parser** (Sonnet) — `character-origins.md` backgrounds section → `parse-backgrounds.js` + `backgrounds.json`.
3. **Feats parser** (Sonnet) — `feats.md` (Origin/General/Fighting-Style/Epic-Boon) → `parse-feats.js` + `feats.json`.
4. **Equipment parser** (Sonnet) — `equipment.md` (coins/weapons/armor/gear/tools tables) → `parse-equipment.js` + `equipment.json`.
5. **Spells parser** (Sonnet, likely the largest single job at 325KB/500+ spells) — `spells.md` → `parse-spells.js` + `spells.json`.

### Phase 3 — engine + integration (sequenced after Phase 2 outputs exist)
1. **Query layer** (Sonnet or done by me) — `app/data/index.js` (or `client/src/data/`): loads all pack JSON, exposes typed query functions (`getClass(id)`, `getSpellsByClass(id)`, `getSpeciesTraits(id)`, etc.), pack-scoped so M2b's future pack-import can add more packs without touching this layer.
2. **CC-BY attribution surfaces in the app** — pack manifest attribution text rendered somewhere visible (e.g. a small "Credits" link/footer), since this is the first milestone shipping actual SRD content. Small UI addition, no gate needed.
3. **Multiclassing prerequisite table** — parsed as part of `character-creation.md` (Phase 1 extension or its own small parser), needed by the query layer even though multiclass *math* is M6's job — M2 just needs the data present and queryable.
4. `data/build-srd.js` (or equivalent) is explicitly a **dev-only tool** — runs locally against the scratchpad source, output committed as static JSON. Not wired into `deploy.sh`; the VPS never fetches from GitHub or runs the parser.

### B. Sequential, state-touching (each gets its own separate go-ahead — expected to be minimal for M2)
1. **`git push`** once all phases are built and locally verified (a small local Node script importing the query layer and running the spot-check assertions — no server/DB involved, no migration, no systemd/Caddy change).
2. **Deploy** (`./scripts/deploy.sh`) — only needed if we want the static JSON pack live behind the existing app before M3 starts consuming it; otherwise this can also just merge to main and deploy alongside M3. Will ask which you prefer once Phase 3 is done.

## What's explicitly NOT in M2
- Character creation UI (M3).
- Multiclass math / level-up engine (M5/M6).
- Admin pack-import UI (M2b).
- Avatars (M7).
