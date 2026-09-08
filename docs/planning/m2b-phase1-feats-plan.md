# M2b Phase 1 — Feats Import (Truman Super Plan applied)

Scope: import the vault's 58 PHB-2024 feats as the first real content pack, closing #13.
Decisions already locked: namespaced ids (`phb-2024:<slug>`), pack lives outside git/
shipped `data/`, sync `@data` API preserved, validation happens at the import boundary.

## 1. Prior-art research
- **Emphasis rendering (#18 prerequisite)**: considered `react-markdown`,
  `markdown-to-jsx`, `simple-markdown`, `@croct/md-lite` (zero-dep). All are full markdown
  parsers (links, lists, code blocks, tables) — this app only ever needs `**bold**`/
  `_italic_`/`*italic*` inside otherwise-plain sentences pulled from these JSON files.
  Recommend a ~30-line hand-written regex tokenizer over adding any of these — same
  "no new dependency for something this narrow" call already made for A1/A2 in the UX
  doc, and it composes cleanly with the citation-bubble/collapsible work already planned.
- **Import validation**: considered Zod and Ajv (both good, well-reviewed, current in
  2026). Neither fits well here: the server is plain JS (no TypeScript, 5 minimal deps,
  "no game-rules logic lives here" per its own file header), and the actual validation
  needed isn't generic shape-checking (the `FeatEntry` TS interface already gives that at
  client build time) — it's "does this entry's `benefit` text survive the *same*
  render-time prose parsers the wizard already uses" (`parseFeatSpellLists`,
  `parseFeatSpellAbilities`). Recommend reusing the existing `data/build/verify-*.js`
  hand-assertion pattern instead of adding a schema-validation library — matches this
  repo's established convention and avoids a new dependency for a narrow, code-already-
  exists need.

## 2. Implementation research
- Parser shape confirmed via `data/build/parse-feats.js` (existing SRD parser) — same
  pattern applies to the vault's `feats-complete-v2.json`, just a different source shape
  (`{feats: [{name, category, source, prerequisite, mechanics, lore}]}` vs SRD markdown).
- Namespacing touches: id generation (`phb-2024:<kebab-case-name>`), and every place a
  feat id is currently assumed bare — `backgroundFeatSpellList`/
  `findFeatByBackgroundFeatText` in `CreateCharacterPage.tsx` (out of Phase 1's scope,
  since backgrounds aren't imported yet, but noting so Phase 2 doesn't forget it),
  `StepSpeciesBonus.tsx`'s `originFeatId === 'magic-initiate'`-style checks (none exist
  today — checked, it's category-based not id-based, so Phase 1 is safe here).
- `listFeats(category?)` and `getFeat(id)` (`data/index.ts`) need to read from a merged
  array (bundled SRD + any imported packs), not just the bundled one. Confirmed these are
  the only two feat-reading functions in the whole client (grepped `client/src`).

## 3. Initial plan
1. `data/build/parse-feats-import.js` — reads a vault-shaped feats JSON (from `--input`
   arg, never committed), emits `FeatEntry[]` with `id: "phb-2024:<slug>"`,
   `pack: "phb-2024"`, running every `benefit` string through the same regex validation
   `parseFeatSpellLists`/`parseFeatSpellAbilities` use, failing loudly per-entry (matches
   the "reject the whole pack, name the offender" convention from the M2b plan).
2. New `pack_content` table in SQLite (`shared/data/marches.sqlite`, survives deploy
   pruning) — one row per imported pack, storing the manifest + the parsed `FeatEntry[]`
   JSON blob, admin-scoped.
3. `POST /api/admin/packs/import` (new route in `server/src/routes/admin.js`, reusing
   `requireRole("admin")`) — accepts the raw vault JSON, runs the Phase-1 parser +
   validator server-side, stores on success, returns per-entry errors on failure.
4. `GET /api/packs` (any authenticated user) — returns the currently-imported pack(s) so
   the client can merge them at boot.
5. `data/index.ts` — on app init, fetch `/api/packs`, merge into the existing `feats`
   array before any `listFeats`/`getFeat` call resolves (module-level, keeps the sync API
   every call site already expects — per the "no destabilizing async rewrite" decision).
6. UI: admin-only pack-upload page (mirrors #14's `AdminEditJsonPage.tsx` admin-gating
   pattern) + feat pickers (`StepSpeciesBonus`, level-up General-feat picker) gain a
   collapsible per-pack section and a name-search input (per the UX doc, A1/A2) once more
   than the bundled pack is loaded.
7. Emphasis renderer (#18) lands first as its own small standalone commit — both because
   it's a prerequisite for bold-important-info to actually work, and because it improves
   the already-shipped 17 feats immediately, independent of the import work landing.

## 4. Advisor review — blocking findings (confirmed against real data)

1. **PHB Magic Initiate's `mechanics` text does not match either parser.**
   `parseFeatSpellLists` needs `"from the X, Y, or Z spell list"`; PHB says *"from that
   class's spell list"* (no match → `[]`). `parseFeatSpellAbilities` needs `"X is your
   spellcasting ability for this feat"`; PHB says *"The spellcasting ability modifier...
   is the one associated with the chosen class"* (no match → `[]`). Confirmed via direct
   grep of the vault text — not hypothetical.
2. **The parse-return-`[]`-on-no-match design means this fails silently, not loudly.**
   Both functions return `[]` for "this feat doesn't grant spells" by design (true for 56
   of 58 feats) — they only throw on a *malformed match*, not a *missing* one. So importing
   PHB Magic Initiate passes validation clean, and the #15 Versatile-trait spell picker
   just never appears for it. Needs an identity-based check ("a feat named Magic Initiate
   must yield a non-empty list"), not a parse-based one.
3. **It's a different mechanic, not just different prose.** PHB: 6 classes (adds Bard,
   Sorcerer to the SRD's 3), ability is *derived from the chosen class*, not freely picked.
   `originFeatSpellAbility` (added in #15) models a free Int/Wis/Cha choice — wrong shape
   for this version.
4. **`FeatEntry.repeatable` is required; the vault has no such field anywhere** (confirmed:
   zero of 58 feats have it, and Magic Initiate's `mechanics` text has no "Repeatable"
   clause at all, unlike the SRD version). #15's whole collision rule depends on this being
   `true` for Magic Initiate.

Also confirmed while checking: one of the 58 feats uses `category: "General / Racial"`,
not in the `FeatEntry.category` union — needs an explicit mapping decision, not a silent
default. `prerequisite: "None"` appears on ~20 feats and should map to `undefined` rather
than literally printing "Prerequisite: None" in the UI.

## 5. Decisions (confirmed by Truman, 2026-09-08)
- **Magic Initiate (PHB variant):** derive its spellcasting ability from the chosen class
  via the existing `parseSpellcastingAbility`-equivalent logic in `computeSheet.ts`
  (verified: all 6 classes it can target — Bard, Cleric, Druid, Sorcerer, Warlock,
  Wizard — already exist in the bundled SRD pack and parse correctly), not from the
  feat's own prose. `FeatEntry`/`CharacterData` gain an explicit "ability derived from
  class, not chosen" mode alongside the existing free-choice mode from #15.
- **`repeatable`:** default every imported feat to `false`; maintain a small hardcoded
  allowlist (starting with Magic Initiate) for feats known to actually be repeatable per
  the real rules, since the source text doesn't say either way.
- **New category:** extend `FeatEntry.category` to include `'General / Racial'` as its
  own value rather than collapsing it into `'General'`.
- **Duplicate names:** bundled and imported same-named entries (e.g. two "Magic
  Initiate"s) coexist under separate per-pack collapsible sections — no supersession.
- **Pack-fetch failure:** degrade gracefully to SRD-only content with a small
  non-blocking warning, rather than blocking the app.

## 6. Attack plan — parallel work breakdown

Per the "up to 8 workers" ceiling in the Truman Super Plan: the honest decomposition here
is **3 genuinely independent tracks**, not 8 — padding to a worker count would create
artificial splits in what's actually a short dependency chain (parser → storage →
endpoint → client merge → picker UI). Reporting the real shape instead:

- **Track A (independent):** the `#18` emphasis renderer (`**bold**`/`_italic_` → real
  markup) — no dependency on anything else here, and improves the already-shipped 17
  feats immediately.
- **Track B (independent until it lands, then everything downstream depends on it):** the
  feats parser (`data/build/parse-feats-import.js`) + its verify script, encoding all 5
  decisions above (namespacing, ability-derivation mode, repeatable allowlist, new
  category, prerequisite normalization).
- **Track C (depends on B's output shape, not on B finishing):** the storage table +
  import endpoint + `/api/packs` read endpoint + client boot-gate merge + admin upload
  page + picker UI (collapsible sections, search, coexisting duplicates) — this is itself
  a short sequential chain, not further parallelizable without artificial splits.

Supervisor: this session, coordinating directly (no separate supervisor subagent needed
for a 3-track job). Code review: `feature-dev:code-reviewer` on the diff before any push,
per the Super Plan's standing rule. The DB migration (new `pack_content` table) gets its
own explicit go-ahead, separate from push/deploy, per CLAUDE.md.

Tracks A and B can start immediately in parallel. Track C starts once B's parser output
shape is settled (doesn't need to wait for B's tests/verify script to fully land, just the
`FeatEntry` shape it will emit).
