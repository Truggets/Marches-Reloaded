# Power-Level "Bones" Rating — Research Draft

Requested: a 1-5 power/exploitativeness rating ("bones," pixel-art icons darkening toward
red as they approach 5) for a character's chosen options, plus a 6th "demon bone" for
game-breaking/exploitative combos — flagging the DM, prompting a one-time
accept-to-continue notice ("must be verified before use in an actual game, free to
experiment in the sandbox"), with a flaming/pepper animation on the demon-bone tier.

## What was researched
- No structured open dataset of "power scores" for 5e feats/subclasses/combos exists.
  What's out there (Blog of Holding's Origin Feat ranking, TierMaker community votes,
  Nat1 Gaming, RPGBOT's optimization math) is all **prose tier lists and community
  opinion**, not queryable data — useful as *reference material for curating our own
  ratings*, not something to import directly.
- Combat-simulator projects (the C++/Python ones found) do batch win/loss statistics for
  a single build in isolation — not what "exploitative combo across a full character"
  needs, and not maintained/packaged for reuse here.
- **Architectural constraint, not a research gap:** this app has no live network calls
  (CLAUDE.md: "SRD 5.2 data is a self-owned bundled JSON dataset... not a live API").
  "Review the internet" can't mean a runtime call per character — it has to mean an
  **offline curation pass** (like the SRD pack itself) whose *output* gets bundled, then
  the app just reads static data at build time, same as everything else.

## Proposed design
1. **Per-entry power tier, curated once (offline), not computed live — stored in an
   overlay, not in the generated pack files.** `data/feats.json` and friends are
   *generated output*: `data/build/parse-*.js` writes them from the pinned SRD markdown,
   and a hand-curated `powerTier` written directly into those files would silently vanish
   the next time `build-srd.js` reruns. Instead: a new `data/power-tiers.json` overlay,
   keyed by entry id (`{"alert": 2, "phb-2024:magic-initiate": 3, ...}`), merged in at
   query-layer read time (`data/index.ts`), never written by the parsers themselves.
   This is also, worth naming explicitly: **the first field in this data model that isn't
   reproducible from the pinned source** — everything else in the pack is
   deterministic parse-or-throw; a power tier is a curated opinion, and
   `verify-pack.js` structurally can't check it the way it checks everything else. An
   accepted break from the existing convention, not an oversight.
2. **Combo detection is a separate, explicit list — not derived from individual tiers.**
   A character built entirely from tier-2 pieces can still be an exploitative *combo*
   (that's the actual "game-breaking" case, not just "everything is individually
   strong"). This needs a small, hand-curated table of known broken combinations (e.g.
   specific feat+subclass+fighting-style stacks), each mapped to the demon-bone
   trigger — a rules table, not a formula derived from the per-entry tiers.
3. **Aggregation method — open question, see below.** `max()` of individual tiers is the
   simplest honest option, but most deliberately-built characters will contain at least
   one tier-5 pick, so the scale would render almost everything as 5 bones and stop
   discriminating — defeating the point of giving a DM a quick read. Alternatives (count
   of tier-4+ picks, a build-level tier assigned by the same curation pass) exist; not
   prescribing one here.
4. **`verified` is a trust claim and cannot live in player-owned `CharacterData`.**
   `POST`/`PUT /api/characters` already accept arbitrary `data` with zero server-side
   rules validation (that's exactly what #14's admin JSON editor exploits, deliberately,
   for QA) — so a `verified: boolean` inside `data` would be a field the player can flip
   themselves in two clicks, which defeats the entire point of "must be verified before a
   real game." It has to be a column on the `characters` table (alongside the existing
   `pack_id`), writable only through an admin route — the same pattern `pack_id` and the
   party-view admin routes already use. `acknowledgedDemonBone` (did the player see and
   dismiss the one-time notice) is a different kind of fact — a UI-dismissal record, not
   a trust claim — and is fine to keep in `CharacterData`.
5. **UI**: 5 bone icons (pixel art, darkening toward red at tier 5) rendered on the
   sheet; on save, if the demon-bone combo table matches, show a one-time modal
   ("this build may need DM review before a real game — free to test in the M11 sandbox
   in the meantime"), setting `acknowledgedDemonBone: true` in `CharacterData` so it only
   prompts once, while `characters.verified` (server column, admin-only) tracks the
   actual DM sign-off separately. Flaming/pepper animation is a small CSS sprite-swap on
   that one icon, no new library.

## This does not block M2b Phase 1
Phase 1 (feats import — parser, storage, endpoint, picker UI) proceeds exactly as already
planned and agreed; this is additional, parallel scope, not a redirect of it.

## "Add one more agent" — what that actually maps to
The request conflates two different pieces of work. The **curation** work — assigning
power tiers across 17 bundled + 58 imported feats, and seeding the demon-bone combo
table — is genuinely a parallel research task an agent can do (using the tier-list
sources found above as reference material, flagged for Truman's spot-check rather than
trusted blindly). The **feature** — the overlay schema, bone icons, one-time modal, the
server-side `verified` column and admin route — is ordinary sequential implementation in
the normal chain, not agent work. "One more agent" points at the curation task
specifically, added as a track alongside Phase 1's existing 3.

## Advisor review — done, findings folded in above.

## Decisions (confirmed by Truman, 2026-09-08)
- Aggregation: **count of tier-4+ picks** drives the 1-5 bone display, not `max()`.
- Demon-bone notice: **per-character** — a level-up that newly creates a broken combo
  re-prompts, stored on that character's `CharacterData` (`acknowledgedDemonBone`), not
  the user account.
