# M1 Execution Plan — Accounts & Login

*Trugg Build · M1 · 2026-07-19*

## Goal (PROJECT_SPEC.md §4)
Invite-gated register, log in/out, hashed passwords (no email), DM/admin role, admin password reset.

## Verified against the real deploy target before writing any code
- **Systemd hardening (M0 unit):** `ProtectSystem=strict` + `ReadWritePaths=/opt/marches-reload/shared` means the DB and `.env` MUST live under `shared/`, not the ephemeral `current/` release dir. `.env.example`'s current `DATABASE_PATH=./data/marches.sqlite` is wrong (relative, resolves under the read-only release) — fixing it.
- **Env loading:** confirmed live on the dashboard (`current/src/config.js`) — `require('dotenv').config({ path: <appRoot>/shared/.env })`, computed via `path.join(__dirname, '..','..','..')`. No `EnvironmentFile=` in its systemd unit. Mirroring this exactly: a `server/src/config.js` that loads `shared/.env` the same way.
- **argon2 native build — tested live on srv1820905:** gcc/g++/make/python3 present, `npm install argon2` succeeds, hash+verify round-trip confirmed working (`ARGON2_OK: true`). No fallback needed.
- **Session store & auth middleware — reused, not reinvented:** pulled the dashboard's real `src/lib/sessionStore.js` (custom `better-sqlite3`-backed `express-session` store, sync, self-pruning by `expires_at`) and `src/middleware/auth.js` (`requireAuth`/`requireRole`, 7-day absolute session cap) as reference. Adapting both almost as-is — this is exactly the kind of thing not to rewrite from scratch.
- **DB ownership gap the dashboard didn't have to solve:** its DB pre-existed. Ours doesn't — first migration must not leave `shared/data` root-owned while the service runs as `marches`. `deploy.sh` gets a `chown -R marches:marches "$APP_ROOT/shared"` after migration.

## Data model (SQLite, `shared/data/marches.sqlite`)
- `users(id INTEGER PK, username TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, is_admin INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL)`
- `sessions(sid TEXT PK, sess TEXT NOT NULL, expires_at INTEGER NOT NULL)` — same shape as the dashboard's.
- `invites(id INTEGER PK, code TEXT UNIQUE NOT NULL, created_at TEXT NOT NULL, used_by_user_id INTEGER NULL, used_at TEXT NULL)`

## API contract (both subagents build against this — defined up front so client/server don't drift)
- `POST /api/auth/register` `{ username, password, inviteCode }` → 201 `{ user: { id, username, isAdmin } }`, sets session cookie. 400 on bad/used invite code, 409 on taken username.
- `POST /api/auth/login` `{ username, password }` → 200 `{ user }`, sets session cookie. 401 on bad credentials (generic message, don't reveal which field was wrong).
- `POST /api/auth/logout` → 204, destroys session.
- `GET /api/auth/me` → 200 `{ user }` if authenticated, 401 otherwise.
- `POST /api/admin/users/:id/reset-password` `{ newPassword }` (admin only, via `requireRole('admin')`) → 200. 403 for non-admins.
- `GET /api/admin/users` (admin only) → 200 `{ users: [...] }` — party/user list, needed to exercise reset-password without a DB shell.

## Task breakdown

### A. Parallel, no local infra risk (starting immediately, no approval needed)
1. **Server auth implementation** (Sonnet, fresh subagent — real judgment: session lifecycle, idempotent admin bootstrap, invite-code consumption race). Builds: `server/src/config.js` (dotenv-from-shared pattern above), `server/src/db/index.js` (better-sqlite3 connection), `server/src/db/migrate.js` (creates the 3 tables + idempotently seeds the admin user from `ADMIN_USERNAME`/`ADMIN_PASSWORD` env if not already present), `server/src/lib/sessionStore.js` (adapted from the dashboard's), `server/src/middleware/auth.js` (adapted — JSON 401/403 instead of redirects, since this is an API not server-rendered), `server/src/routes/auth.js`, `server/src/routes/admin.js`, wires it all into `src/index.js` behind `express-session`. Given the exact reference files and the API contract above.
2. **Client auth UI** (Sonnet, fresh subagent). Builds: a login page, a register page (username/password/invite code), a minimal auth context/hook (`useAuth`) that calls `/api/auth/me` on load, a logout control, and a route guard that redirects unauthenticated users to `/login`. Styled consistently with the M0 placeholder (Tailwind, centered card layout). No admin UI yet (party view is M8) — just enough to prove the API contract end-to-end.
3. **Deploy tooling updates** (inline, not delegated — small, mechanical edits to files already adapted from real references in M0): add the migration step + `shared` chown to `scripts/deploy.sh`; fix `.env.example`'s `DATABASE_PATH` to the absolute `shared/data` path and add `APP_URL`-style comment noting the dotenv-from-shared pattern.

### B. Sequential, state-touching (each gets its own separate go-ahead)
1. **Generate real secrets directly on the VPS** (not typed into chat) — `SESSION_SECRET` via `crypto.randomBytes`, `INVITE_CODE` and `ADMIN_PASSWORD` picked by me randomly unless Truman wants to choose his own; written straight into `/opt/marches-reload/shared/.env`. I'll confirm they're set without echoing the values into this chat.
2. **`git push`** the M1 code once built and locally verified.
3. **Run the first migration on prod** (`node src/db/migrate.js` under the new `deploy.sh`, which now includes it) — DB schema creation + admin bootstrap is exactly the "any DB migration on prod" case `permissions.md` calls out as Ask-tier.
4. **Deploy** (`./scripts/deploy.sh`).
5. Read-only verification after: register a second (non-admin) test account through the real UI, log in/out, confirm `/api/auth/me` and the admin reset-password endpoint behave correctly against the deployed DB — no approval needed, this step doesn't change state beyond what step 4 already did.

## Definition of done
Against `https://marches.therinkinc.com`: register with the real invite code creates an account; wrong/missing invite code is rejected; login/logout work and persist via cookie; `/api/auth/me` reflects session state; the seeded admin account can reset another user's password via `/api/admin/users/:id/reset-password`; a non-admin gets 403 on that route.
