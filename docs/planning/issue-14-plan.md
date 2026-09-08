# Plan: Issue #14 — Admin character editor for bug testing

## Goal
An admin can directly view/edit a character's raw `CharacterData` JSON — skip the multi-step creation wizard entirely — for fast bug reproduction and QA. Purely dev/QA tooling, not player-facing.

## Key finding: this is client-only work
The server already supports everything needed, with zero changes required:
- `canAccess()` (`server/src/routes/characters.js:40-42`) already grants an admin session access to **any** character, not just their own — `character.owner_id === req.session.userId || req.session.role === "admin"`.
- `PUT /api/characters/:id` and `POST /api/characters` already accept an arbitrary `data` object with **no game-rules validation** — the server's own file header states this is deliberate: "Server does NOT validate game-rules correctness inside `data` — the rules engine is strictly client-side." Only checks: `data` is a non-null object and JSON-serializable, `name` is a non-empty string.

So there's no new endpoint, no new validation layer, no schema to design server-side. The whole feature is: a client UI that shows/edits the raw JSON and calls the endpoints that already exist.

## Scope decision (confirmed with Truman)
"Edit JSON" appears on **any** character's sheet when viewed by an admin, not just the admin's own — matches what the server already permits and is the most useful shape for reproducing a specific player's bug directly on their real character.

## Proposed design

### 1. `/characters/:id/edit-json` — new admin-only route
Follows the exact gating pattern already established by `PartyViewPage.tsx:51` (`if (!user?.isAdmin) return <Navigate to="/characters" replace />` — cosmetic client gate, real authorization is server-side via `canAccess`).

- On load: `GET /api/characters/:id` (same fetch pattern as `CharacterSheetPage`), pre-fill a `<textarea>` with `JSON.stringify({ name, data }, null, 2)` — same payload shape `handleDownloadJson` already produces, so "Download JSON" and this editor are symmetric.
- A prominent, unmissable note: **"Admin/QA tool — bypasses all validation. Can save data that crashes the character sheet (by design; the rules engine throws loudly on invalid data)."**
- "Save" button: `JSON.parse` the textarea content, then mirror the server's own two checks client-side before submitting — `name` is a non-empty string, `data` is a non-null object (per `characters.js`'s own validation) — so a malformed edit produces a friendly inline message instead of an opaque 400. **Nothing beyond those two checks is validated** — that's the entire point of the tool; do not add game-rules checks here.
- On success: `PUT /api/characters/:id` with `{name, data}` (matches the established "PUT has no partial-patch mode, resend the whole `data` object" pattern already documented at `CharacterListPage.tsx:63-65`), then navigate to `/characters/:id`.

### 2. Entry points
- **`CharacterSheetPage.tsx`**: an admin-only "Edit JSON" button next to the existing "Download JSON" button (`user?.isAdmin`, not owner-gated — per the scope decision above).
- **`CharacterListPage.tsx`**: an admin-only "Duplicate" button per character row, next to "Rename"/"Delete". POSTs `{ name: c.name + " (copy)", data: c.data }` to `/api/characters`, then navigates straight to `/characters/${newId}/edit-json`.

### 3. No separate "create from blank template" route
Dropped from the initial sketch. A hardcoded template literal (e.g. a Human/Fighter/Soldier skeleton) would silently drift out of sync every time `CharacterData` gains a new optional field — issue #2 added `originFeatSpells` just this session, which is exactly the kind of change a template would miss. **Duplicate-then-edit** reuses a real, currently-valid character as the starting point instead, with no template to maintain. Every admin account that's used this app for real testing already has at least one saved character to duplicate from (confirmed: the seed/test characters used throughout this session).

## Files touched
- `client/src/pages/AdminEditJsonPage.tsx` — new page, the editor described above.
- `client/src/main.tsx` — new route `/characters/:id/edit-json`.
- `client/src/pages/CharacterSheetPage.tsx` — add the "Edit JSON" button.
- `client/src/pages/CharacterListPage.tsx` — add the "Duplicate" button + handler.

No server changes. No new tests — this project's convention (per `CLAUDE.md`'s testing section) is unit tests for the rules engine and a manual smoke check for wizard/admin flows; there's no React component test infra in this repo (confirmed while implementing #2).

## Explicitly out of scope
- Any game-rules validation of the edited JSON — the tool's entire value is bypassing that.
- A field-by-field admin form (class picker, ability score inputs, etc.) — that's just reimplementing the wizard; raw JSON is strictly more powerful for constructing deliberately edge-case data, and is what the issue actually asked for ("directly set/override... raw fields").
- Restricting which characters an admin can edit — resolved above (any character).

## Verification
Stand up a fresh local instance (client + server + throwaway SQLite, same recipe used for issue #2 this session — that instance was torn down at the end of that work, not left running):
- Log in as the seeded admin, open an existing character's sheet, confirm "Edit JSON" appears; edit a field (e.g. change `classes[0].classId` to `"monk"`), save, confirm the sheet reflects it (AC recalculates via the already-fixed `armorClass()` from issue #12).
- From the character list, confirm "Duplicate" creates a copy and lands on its JSON editor.
- Submit deliberately invalid JSON (bad syntax) and confirm a friendly inline error, not a crash.
- Submit valid JSON with a nonsense `classId` (e.g. `"not-a-class"`) and confirm the sheet page's `ErrorBoundary` catches the resulting `computeSheet` throw gracefully — this is expected, by-design behavior, not a bug to fix.
- Confirm a non-admin user never sees the "Edit JSON"/"Duplicate" buttons and is redirected away from `/characters/:id/edit-json` if navigated to directly.
