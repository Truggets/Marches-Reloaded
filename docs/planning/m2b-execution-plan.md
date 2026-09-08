# M2b Execution Plan — Admin Content-Pack Import

## 0. Framing (read this first)

The pipeline agent relayed that Truman wants "the classes/items/races/backgrounds in the
[vault] json files implemented." Read literally, that would mean transcribing them into
`data/*.json`, the bundled default pack. **That would violate this repo's own
constraints.** Every file in
`Projects/Marches/json/` is stamped `"source": "Player's Handbook (2024)"` (or a named
supplement — Tasha's, Xanathar's, Fizban's, Acquisitions Inc., Book of Many Things) — none
of it is SRD. CLAUDE.md is explicit: *"Do NOT bulk-transcribe the copyrighted 2024 PHB (or
other non-SRD books) into the shipped dataset... Non-SRD content reaches an instance via
the admin content-pack import (M2b)."* PROJECT_SPEC.md §32/§47 says the same.

So this plan is about building the **M2b milestone** — the import *machinery* — not about
merging the vault content into the repo. The vault files are the first real payload that
machinery will need to swallow, and they double as a good design-forcing test case (they're
messier and much larger than the SRD pack), but they never get committed to git or shipped
in `data/`. Confirmed via `du`/inventory below: ~600KB across 21 files, none SRD.

## 1. Decision needed from Truman before implementation starts

**Id namespacing.** The vault content is a superset of what's shipped — it has its own
`acolyte`, `human`, `alert`, `magic-initiate`, etc. `data/index.ts`'s `getBackground`,
`getFeat`, etc. are bare `.find()` calls over one flat array. If an imported pack reuses
the SRD's plain ids, importing it silently repoints every existing saved character's
`backgroundId`/`originFeatId`/etc. to whichever entry ends up first in the merged array —
this is a **live data-corruption risk for Test boi, Brondra Stonefaith, and every other
saved character**, not a hypothetical.

Also relevant: `characters.pack_id` already exists in the DB schema (stamped from
`manifest.id` today, e.g. `srd-5.2`) but every character currently gets the same value
regardless of what it actually uses — it's not yet doing real per-choice disambiguation.

Recommended fix, for Truman to confirm: **namespace every imported id with its pack id**
(e.g. `phb-2024:acolyte`, `tashas-cauldron:some-subclass`), never reuse bare SRD ids, and
resolve a character's choices by combining `pack_id` + the stored choice id. This decision
**blocks every parser** — parsers emit ids, so the namespacing contract has to be locked
before any parser is written, and before any of Phase 2's work is parallelized.

## 2. Scope question for Truman: what's actually in scope for M2b v1

The vault contains categories the app has no concept of at all:

| Category | Count | App has a consumer? |
|---|---|---|
| Feats | 58 | **Yes** — `listFeats`, both pickers, prose parsing already handle this shape |
| Backgrounds | 42 | Yes, but needs a new prose→struct parser (single `mechanics` blob) |
| Species | 18 | Yes, but "Elven Lineage" (High/Wood/Drow, each granting different spells + an ability pick) is a new sub-choice mechanic, same class of work as #15 |
| Weapons/Armor | 38/13 | Partial — clean structured fields (`damage`, `mastery`, `ac`, `stealth`), but the engine currently treats equipment as flavor text only; no mechanical consumer exists (see #3 below) |
| Subclasses | 77 (4 files) | **No.** Zero `subclass` references anywhere in `client/src`, no `subclassId` on `CharacterClassEntry`. Subclass *selection* doesn't exist as a feature yet, SRD-bundled or not. |
| Monsters | 35 (3 files) | No — `ContentPack` has no monster category; app is player-facing only, no DM bestiary/encounter tooling exists (M9 campaign hub is listed "future") |
| Hazards/conditions | 22 | No — same as monsters |
| Magic items | 8 | No — no inventory system exists (`equipmentChoice` is a single starting-gear letter, nothing else) |
| Legendary monsters | 7 | No — same as monsters |

**Recommendation:** M2b v1 imports feats, backgrounds, species, and equipment (weapons/
armor as richer flavor text now, real mechanical consumers later). Subclasses, monsters,
hazards, magic items, and legendary content are **excluded from M2b v1** — they need
feature work the app doesn't have yet, not just a data pipe. Filing two follow-up issues
rather than silently dropping this content (see §5). **Wants Truman's confirmation before
Phase 2 starts**, since "implement everything in the JSONs" was the literal ask.

## 3. Sequencing — by whether a consumer already exists, not by file size

1. **Feats (58)** — full consumer already exists. Closes #13 (feat-picker data gap) with
   zero new UI. Highest value, lowest risk. Do first, and not in parallel with anything
   downstream of it (backgrounds depend on it — see below).
2. **Backgrounds (42)** — needs a new parser (`mechanics` markdown blob →
   `abilityScores[]`/`feat`/`skillProficiencies[]`/`toolProficiency`/`equipment`), **and
   depends on feats landing first**: `findFeatByBackgroundFeatText` matches by bare feat
   name, and backgrounds like Artisan ("Crafter") and Entertainer ("Musician") grant
   Origin feats that don't exist in the current 17-feat pack — confirmed via grep. Import
   backgrounds before their feats exist and those Origin-feat grants silently vanish (no
   error, just missing UI).
3. **Species (18)** — consumer exists (`listSpecies`/`getSpecies`), but two couplings need
   fixing first, both silent-failure risks, not just missing features:
   - `CreateCharacterPage.tsx` tests `t.name === 'Skillful'` / `t.name === 'Versatile'`
     literally. The vault's Human traits are titled `"Versatile Traits - Skilled"` /
     `"Versatile Traits - Origin Feat"` — a naive parser won't produce an exact
     `'Skillful'`/`'Versatile'` match, and the entire Species Bonus step (the #15 work
     just shipped) silently disappears for an imported Human. The species parser must
     normalize trait names to match what the wizard checks for, or the wizard's match
     needs to become pattern-based — decide which during implementation, flag either way.
   - Elven Lineage (High/Wood/Drow) is a new "species grants a sub-choice with its own
     spell list + ability pick" mechanic — same shape of work as #15, needs its own mini
     design pass, not a mechanical port.
4. **Equipment (weapons 38, armor 13)** — clean structured data, straightforward parser.
   Import lands better flavor text and structured fields (`damage`, `mastery`, `ac`,
   `stealth`) the engine doesn't yet read. No mechanical change until #3 (weapon
   mastery/fighting style picker) is built — file that dependency explicitly so nobody
   expects mastery properties to *do* anything right after this import lands.
5. **Excluded from M2b v1** (subclasses, monsters, hazards, magic items, legendary) — see
   §2 and §5.

## 4. Architecture

- **Validation moves to the import boundary, not the render path.** `parseFeatSpellLists`
  and `parseFeatSpellAbilities` (added in #15) are called *during render* in
  `StepSpeciesBonus` and `throw` on an unparseable match — correct for a 17-feat
  build-verified pack, wrong for 58 user-supplied ones: one malformed `benefit` string
  would white-screen the character wizard for every user, not just fail an import. The
  import endpoint must run every entry through the same parsers used at render time and
  reject the whole pack (naming the offending entry) if any of them throw. This is a
  deliberate reversal of the "throw on unparseable" convention used everywhere else in
  this codebase — call it out explicitly in the PR/commit so it doesn't read as a mistake.
- **Storage: `shared/data/`, not the release directory.** `deploy.sh` prunes
  `releases/*` on every deploy (`KEEP_RELEASES=5`), and only `shared/` is
  writable/persistent per `server/src/config.js` (the SQLite DB already lives at
  `shared/data/marches.sqlite` for exactly this reason). An imported pack must live
  alongside it — either as rows in SQLite (new table, gets `backup.sh` coverage for free)
  or as JSON files under `shared/data/packs/` — not anywhere under `releases/`.
- **Runtime loading, keep the sync `@data` API.** `data/index.ts` today is static
  Vite-bundled imports; every call site (`listFeats('Origin')`, `getBackground(id)`, etc.)
  is synchronous. Converting every call site to async would be a large, destabilizing
  change against the "don't break M0-M8" constraint. Prefer: gate app boot on one fetch of
  the instance's imported pack(s) from the server, merge into the same module-level arrays
  `data/index.ts` already holds, leave every existing function signature untouched.
- **The admin upload UI is the actual delivery path, not optional polish.** The vault
  lives on Truman's Windows desktop; there is no other route for this content to reach the
  VPS. Build on the existing `server/src/routes/admin.js` (`requireAuth,
  requireRole("admin")`) and the admin-only patterns from #14's JSON editor. This also
  gates any real end-to-end test of the whole pipeline.

## 5. New issues to file (not doing this work inside M2b itself)

- **Subclass selection is a prerequisite feature, not a byproduct of import.** No
  `subclassId` field, no engine logic, no UI. File as its own issue so the plan can point
  at it instead of quietly deferring 77 subclass entries.
- **Monsters/hazards/magic items/legendary** — no schema category, no consumer, no
  DM-facing surface in the app at all today. File as a "future: DM/bestiary content"
  issue, explicitly out of scope for M2b v1, pending Truman's read on whether that's ever
  wanted for this app vs. staying in the campaign-hub (M9, "future") territory.

## 6. Once §1's namespacing decision is locked

Phases 1 (feats) through 4 (equipment) each split into: write the parser (`data/build/
parse-<category>-import.js`, mirroring the existing `parse-*.js` scripts but reading vault
JSON instead of SRD markdown) → validate against `schema.ts` + the render-time prose
parsers → wire the import endpoint → admin upload UI → live-verify. Feats can start
immediately; backgrounds are blocked on feats; species and equipment are independent of
both and of each other, so once feats + backgrounds are done, species and equipment can run
in parallel (candidates for `trugg-build` delegation — confirming that skill is available
in this session before planning further parallel execution around it).

Every phase gets its own live verification pass and its own push/deploy go-ahead, same as
every other issue this session has shipped — no change to that standing rule.
