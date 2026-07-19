# M0 Execution Plan — Skeleton + Deploy

*Trugg Build · M0 · 2026-07-19*

## Goal (from PROJECT_SPEC.md §4)
Empty app builds and serves at the target URL on the VPS via the git-deploy pipeline; TLS working.

## What already exists
- `app/client`, `app/server`, `app/data` — empty placeholders, plus `app/CLAUDE.md`, `README.md`, `.gitignore`, `.env.example`, `.claude/settings.json`.
- GitHub remote created: `github.com/Truggets/Marches-Reloaded` (private), not yet pushed.
- VPS `srv1820905` (2.25.83.31) — running, hosts the existing Rink Dashboard via a proven git-deploy pipeline. Confirmed live by reading the real files (not reconstructed from memory):
  - `/opt/therink-dashboard/scripts/{deploy.sh,rollback.sh,backup.sh}`
  - `/etc/systemd/system/therink-dashboard.service`
  - Single `/etc/caddy/Caddyfile` (no sites-enabled split) — vhosts are appended blocks.
  - Layout: `/opt/<app>/{repo,releases/<ts-sha>,current -> releases/X,shared/{.env,data,logs,backups},scripts}`. `current` is a symlink swapped by deploy/rollback. Runs as an unprivileged per-app user (`therink` for the dashboard).
- DNS (`therinkinc.com`, checked live via Hostinger MCP): no `marches` record yet. `dashboard` A/AAAA records exist as the pattern to copy.

## Why reuse, not reinvent
Per Truman's decision, mirror the dashboard's pipeline exactly rather than author a new one — it's already proven on this exact box. Deviating would mean debugging two deploy systems instead of one.

## Task breakdown

### A. Local scaffolding (parallel, no infra risk — safe to delegate to subagents, no approval needed)
1. **Client skeleton** — `npm create vite@latest` (React+TS) in `app/client`, Tailwind installed and configured, one placeholder route/page, `npm run build` verified to produce `dist/`.
2. **Server skeleton** — Express app in `app/server` with a health-check route (`GET /api/health`), serves nothing else yet, starts on `PORT` env var, `npm run build`/start script verified locally.
3. **Deploy tooling** — adapt the three real dashboard scripts into `app/scripts/{deploy.sh,rollback.sh,backup.sh}` for this app (`APP_ROOT=/opt/marches-reload`, service name `marches-reload`, `npm ci --omit=dev` for **both** `client` and `server` workspaces, `npm run build --prefix client` before the `rsync`/symlink swap since this app ships a static build + thin API rather than a single Node process). Also write:
   - `app/deploy/marches-reload.service` (systemd unit, same hardening flags as the dashboard's)
   - `app/deploy/Caddyfile.snippet` (vhost block for `marches.therinkinc.com`, same header/log pattern as the dashboard block)
4. Copy `docs/planning/` into `app/docs/planning/` (repo-setup.md item 1) so the pushed repo is self-contained.

### B. Sequential, infra-touching steps (each needs Truman's explicit go-ahead — no composite authorization)
1. `git init` in `app/`, commit — **local, no approval needed** (reversible, not pushed).
2. **Push to GitHub** (`git push -u origin main`) — *ask before running.*
3. **Create DNS A + AAAA records** for `marches.therinkinc.com` → `2.25.83.31` / VPS IPv6, via Hostinger MCP (mirrors the `dashboard` records) — *ask before running.*
4. **On the VPS** (via Chrome/hPanel terminal, driven by me): create `therink`-style unprivileged user `marches` (or reuse `therink` — decide with Truman), `mkdir -p /opt/marches-reload/{releases,shared/{data,logs,backups},scripts}`, clone the repo into `/opt/marches-reload/repo` — *ask before running.*
5. **Install systemd unit + reload systemd** — *ask before running.*
6. **Append Caddy vhost block + `systemctl reload caddy`** — *ask before running.*
7. **First deploy** (`./deploy.sh`) — *ask before running.*
8. **Verify TLS + serving** at `https://marches.therinkinc.com` (Caddy auto-provisions via Let's Encrypt once DNS + vhost are live) — read-only check, no approval needed.

## Model tiering for delegated work
- **Client/server scaffolding (A1, A2):** fresh `general-purpose` agents, Sonnet-tier. Enough judgment involved (matching `app/CLAUDE.md` conventions, Tailwind config, TS strictness) to be worth a real briefing.
- **Deploy tooling adaptation (A3):** done inline by me, not delegated — it requires holding the two real reference scripts in context and adapting them faithfully; the briefing cost of handing that to a fresh agent would exceed just doing it.
- **Docs copy (A4):** inline, mechanical, not worth a delegation round-trip.
- Sequential VPS-touching steps (B): inline by me, one at a time, gated on approval — not parallelizable, not delegable to a subagent (they need the live Chrome terminal session I'm already driving).

## Definition of done
- `https://marches.therinkinc.com` resolves, serves the placeholder React page over TLS, and `/api/health` returns 200 from the Node service — via the same deploy.sh a future `git push` + `./deploy.sh` will update.
