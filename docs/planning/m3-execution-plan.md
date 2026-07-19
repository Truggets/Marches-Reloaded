# M3 Execution Plan — Level 1 Character Creation

*Trugg Build · M3 · 2026-07-18*

## Goal (PROJECT_SPEC.md §4)
Full happy-path single-class L1 build (species/class/background/abilities/skills/equipment/spells), saved to the player's account.

## Load-bearing decisions (design against the hard case, not the easy one)
- **Character storage shape must survive M6 (multiclassing) without a data migration.** Model `classes` as an array (`[{ classId, level }]`) even though M3 only ever writes one entry. Stamp `pack_id` on every character (PROJECT_SPEC §M2b: "characters record which pack each choice came from").
- **Store choices, not computed results.** Server does no game math (CLAUDE.md: rules engine is client-side). The DB holds the player's *choices* (species id, background id, class+level, ability assignment, chosen skills, equipment pick, chosen spells, name). AC/HP/save DCs/spell slots are recomputed client-side on every read from the choices + the pack — never persisted, so they can't go stale if the pack changes later.
- **M3/M4 boundary held on purpose.** M3 needs only creation-time validation math (ability totals, skill/spell counts, background ASI). The full computed sheet (AC, HP, DCs, slot tracking) is M4's job — not built here.
- **Ability scores: random rolling (4d6, drop lowest) × 6, OR manual entry of a real dice roll.** Per your call — no Standard Array/Point Buy in this pass. Client either rolls in-browser (`crypto.getRandomValues`, not `Math.random`) or the player types in 6 numbers from a physical roll; either way the 6 results get assigned to abilities the same way. Background's Ability Score Improvement (+2/+1 on two of the background's three listed abilities, or +1/+1/+1 on all three) applies after assignment, capped at 20.
- **Warlock spell slots verified at L1** (this was flagged as an open risk after M2): Warlock's L1 `featureTable` row has `extraColumns: { Cantrips: "2", "Prepared Spells": "2", "Spell Slots": "1", "Slot Level": "1" }` instead of the typed `spellSlotTable` other casters use. The spell-selection step reads either shape: `class.spellSlotTable` if present, else falls back to `featureTable[0].extraColumns` for Warlock-style pact casters. Confirmed present in the data, not a gap.
- **Equipment kept simple for the happy path.** Class `startingEquipment` is raw SRD text ("Choose A or B: ..."). M3 lets the player pick option A or B and stores the raw string as their equipment choice — no itemized parsing against `equipment.json` yet. Itemizing it further is fine to defer to M8 polish.

## Data model (SQLite, additive migration — `CREATE TABLE IF NOT EXISTS`, doesn't touch users/sessions/invites)
```
characters(
  id INTEGER PRIMARY KEY,
  owner_id INTEGER NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  pack_id TEXT NOT NULL,        -- e.g. "srd-5.2", from data/manifest.json
  data TEXT NOT NULL,           -- JSON blob, see shape below
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
)
```

## Character `data` JSON shape (choices only — frozen before server/client split)
```ts
interface CharacterData {
  speciesId: string
  backgroundId: string
  classes: [{ classId: string; level: 1 }]   // array from day one, even at L1
  abilityScores: {
    rolls: [number, number, number, number, number, number]  // as generated/entered
    assignment: Record<'Strength'|'Dexterity'|'Constitution'|'Intelligence'|'Wisdom'|'Charisma', number>
    backgroundIncrease: { plusTwo?: string; plusOne?: string[] } // ability names, per background ASI rule
  }
  skillProficiencies: string[]   // union of class-chosen + background-fixed
  equipmentChoice: 'A' | 'B'
  spells?: { cantrips: string[]; prepared: string[] }  // spell ids; omitted for non-casters
}
```

## API contract (both subagents build against this)
- `POST /api/characters` `{ name, data: CharacterData }` → 201 `{ character }`. Server stamps `owner_id` from session, `pack_id` from the currently-bundled pack's manifest. No validation of game-rules correctness server-side (that's the client engine's job, and this is a private friend-group tool — server just checks it's well-formed JSON and `owner_id` matches session).
- `GET /api/characters` → 200 `{ characters: [...] }` — current user's characters only.
- `GET /api/characters/:id` → 200 `{ character }` if owned by the session user (or admin), 403 otherwise.
- `PUT /api/characters/:id` `{ name, data }` → 200 `{ character }`. Owner or admin only.
- `DELETE /api/characters/:id` → 204. Owner or admin only.

## Task breakdown

### A. Parallel, no local infra risk (starting immediately, no approval needed)
1. **Server character CRUD** (Sonnet, fresh subagent). Builds: migration addition (`characters` table, additive/idempotent), `server/src/routes/characters.js` implementing the 5 endpoints above behind `requireAuth`, ownership checks (owner or `requireRole('admin')`). Given the exact schema + API contract above and the existing `routes/auth.js`/`middleware/auth.js` as style reference.
2. **Client creation wizard** (Sonnet, fresh subagent — the larger piece). Builds a multi-step wizard following the SRD's own step order (Class → Origin [species+background] → Ability Scores → Skills → Equipment → Spells if caster → Name → Save), consuming `@data` (the M2 query layer: `listClasses`, `listSpecies`, `listBackgrounds`, `getSpellsByClass`, etc.) for all content, client-side validation (skill count against class's "Choose N" text, spell counts against the L1 row, ability total sanity), POSTs the finished `CharacterData` to `/api/characters`. Styled consistently with the existing pixel-panel/pixel-btn/pixel-input theme. A simple character list view (`GET /api/characters`) showing the player's saved characters is in scope too, since "saved to the player's account" implies being able to see what's saved — full sheet *display* (computed stats) is explicitly M4, so the list can just show name/species/class/background, not derived stats.

### B. Sequential, state-touching (each gets its own separate go-ahead)
1. **Run the `characters` table migration on prod** (`node src/db/migrate.js` under `deploy.sh`) — first prod migration since M1, additive and idempotent, but still the "any DB migration on prod" Ask-tier case.
2. **`git push`** once built and locally verified.
3. **Deploy** (`./scripts/deploy.sh`).
4. Read-only verification after: create a real L1 character through the deployed UI end-to-end (each step), confirm it saves and reappears in the character list, confirm a second account can't see/edit it, confirm the seeded admin account can. No approval needed — doesn't change state beyond what step 3 already did.

## What's explicitly NOT in M3
- Computed character sheet (AC, HP, save DCs, spell slot tracking) — M4.
- Leveling past 1, multiclassing — M5/M6.
- Avatars — M7.
- Itemized starting-equipment breakdown (beyond the raw A/B choice) — deferred to M8 polish.
- Server-side game-rules validation — client engine only, per CLAUDE.md.

## Definition of done
Against `https://marches.therinkinc.com`: a logged-in player can walk the full wizard (class → origin → ability scores [rolled or manually entered] → skills → equipment → spells if applicable → name) and save a valid L1 character to their account; it appears in their character list; another user can't see or edit it; the admin account can.
