# M8 — Polish & party view

## Goal (verbatim from PROJECT_SPEC.md)

DM party view (see all characters), edit/delete own character, error handling, responsive cleanup, optional dice roller.

Scoped this session (confirmed with Truman):
- **Edit** = rename only (not a full re-edit wizard). Delete already exists (M3+).
- **Dice roller** = skipped, it's explicitly optional in the DoD.

## What already exists

- Server: `requireAuth` + `requireRole("admin")` middleware (`server/src/middleware/auth.js`), already used by `/api/admin` (`server/src/routes/admin.js` — users list, password reset, invites). `PUT /api/characters/:id` already accepts `{name, data}` and requires `data` as a full object (not a partial patch) — a rename must resend the character's existing `data` verbatim.
- Client: `user.isAdmin` already available via `useAuth()` (used today to show/hide the "Invite codes" button in `App.tsx`) — same pattern for a "Party" nav link. `CharacterListPage.tsx` already has the delete flow and per-card layout to extend with rename. No global error boundary, no catch-all "not found" route in `main.tsx`. `CharacterSheetPage.tsx` already has a per-page 404 pattern (`notFound` state) worth reusing for the character-not-found case specifically; the catch-all route is for bad URLs generally.

## Task breakdown

### (A) Parallel, no-risk — build directly, no per-task approval needed

All of M8 is local file work with no shared/production state until the final push+deploy, so there isn't much genuine parallel-delegation surface (per the skill's own guidance: don't force artificial parallelism). Building these myself, in order:

1. **Party view (admin-only).**
   - Server: `GET /api/admin/characters` in `server/src/routes/admin.js` — all characters joined with owner username, admin-gated by the existing `router.use(requireAuth, requireRole("admin"))`. Read-only; no new mutation endpoints (DM does not edit/delete others' characters in this milestone).
   - Client: new `PartyViewPage.tsx` at `/party`, admin-gated client-side (redirect/hide if `!user.isAdmin`, mirroring `RequireAuth`'s pattern) — reuses `CharacterAvatar` and the same species/background/class summary line as `CharacterListPage`, plus the owner's username per character. Nav link in `App.tsx`, shown only when `user.isAdmin` (matches the existing "Invite codes" conditional).
   - **Verification (not cosmetic):** confirm as admin the page lists every character across every account; separately confirm a non-admin session hitting `GET /api/admin/characters` directly gets 403 — the hidden nav link is not the real gate.

2. **Rename own character.**
   - `CharacterListPage.tsx`: inline rename (edit icon/button → text input → save), calling `PUT /api/characters/:id` with `{name: newName, data: c.data}` — resending the full existing `data` object (the endpoint has no partial-patch mode; sending `{}` would clobber the character).
   - Verify: rename, reload the page, confirm it persisted; confirm the character's `data` (species/classes/etc.) is untouched after a rename.

3. **Error handling.**
   - App-wide `ErrorBoundary` — must be a **class component** (or `componentDidCatch`-equivalent); a function component cannot catch render errors, so this needs an explicit "throw in a child, confirm fallback renders instead of a white screen" check, not just "it compiles."
   - Catch-all 404 route in `main.tsx` (`path="*"`) for bad/unknown URLs, distinct from `CharacterSheetPage`'s existing per-character 404 (that one already exists and works, leave it).

4. **Responsive cleanup (timeboxed).**
   - Test at ~375px and ~768px viewport widths. Fix concrete horizontal-overflow / unusable-layout issues found, especially on the new party view (a multi-row list needs to wrap or scroll in its own container, not push the page wide). Don't rewrite layouts that already work — most pages are `flex-col` + `max-w-2xl` and are likely fine as-is; this is a fix pass, not a redesign.
   - Explicitly out of scope: the existing 940KB JS chunk-size build warning (code-splitting, not a responsive/layout issue).

### (B) Sequential, state-touching — one approval each, never bundled

1. `git push` once M8 is built, tested, and verified locally.
2. `./scripts/deploy.sh` on the VPS — separate go-ahead, same as every prior milestone.

## Definition of done (live-checked, not just "it built")

- [ ] Party view: admin sees every character across all accounts (own + others), with owner username shown.
- [ ] Party view: a non-admin session's direct request to `GET /api/admin/characters` returns 403 (checked directly, not just "the nav link is hidden").
- [ ] Rename: renaming a character persists across a page reload; the character's saved `data` is unchanged afterward.
- [ ] Error boundary: a deliberately-thrown render error shows the fallback UI, not a blank white screen.
- [ ] 404 route: navigating to an unknown URL (e.g. `/nonsense`) shows the not-found page, not a blank screen.
- [ ] Responsive: party view and the existing core pages checked at ~375px and ~768px; no horizontal overflow, no unusable layout.
- [ ] `npm --prefix client run test` and `npm --prefix client run build` both clean.
- [ ] `PROJECT_SPEC.md` M8 row updated with status + evidence; synced into `app/docs/planning/PROJECT_SPEC.md`.
- [ ] `docs/planning/build-retro.md` gets a dated M8 entry (skill §9).
