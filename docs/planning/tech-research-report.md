# Tech Research Report — Marches Reloaded (Character Builder)

*Trugg Plan · Phase 4 · 2026-07-18*

Categories were derived from this project's actual needs (a stateful, multi-step rules engine + small multi-user web app on an existing VPS) — **not** a default web-app checklist. The categories that mattered here: SRD data source, frontend, backend/runtime, database, auth, hosting/deploy, pixel-art avatars, and build-vs-fork. Categories a generic web app would list but this project *doesn't* need: transactional email (no email by design), object storage (avatars are generated/small), and any AI-model dependency (not required for MVP).

---

## SRD 5.2 data source  ⭐ (the load-bearing decision)

**Options considered:**

- **Live 3rd-party API at runtime (Open5e `srd-2024`, or 5e-bits `/api/2024`)** — free, no auth, JSON. But: 5e-bits' 2024 endpoint is still the *forthcoming* "next version," and Open5e's 2024 data is live but has acknowledged gaps still being filled. Runtime dependency on someone else's uptime and rate limits.
- **Bundle a self-owned structured dataset** built from the official SRD 5.2.1 (CC-BY 4.0), seeded from open sources — Open5e's `srd-2024` export plus the community `downfallx/dnd-5e-srd-markdown` (full SRD 5.2.1 markdown) — then curated into our own JSON schema and shipped inside the app.

**Decision:** **Bundle a self-owned SRD 5.2 dataset** (curated JSON), seeded from Open5e + the SRD 5.2.1 markdown, not a live API call.

**Why:** Full control and zero runtime dependency (works offline, no rate limits, no third-party outage risk). The data model can be shaped for our own needs — crucially, an extensible `source` field so **future homebrew** slots in without a rewrite. Legally clean (CC-BY 4.0 with attribution). And since the free 2024 APIs are still incomplete, we'd have to fill gaps by hand *anyway* — better to own the dataset than to patch around someone else's.

**Why not the others:** A live API makes us hostage to another project's uptime, rate limits, and incomplete-and-changing 2024 data, and fights the homebrew-extensibility goal.

> ⚠️ **Escalated to key-questions.md:** the 2024 SRD data is *not* turn-key complete in any free source. Milestone M2 therefore includes real data-curation work (authoring/validating class-feature-by-level tables, multiclass rules, etc.), not just "import a JSON file." This is a genuine scope item, not a footnote.

---

## Frontend

**Options considered:**

- **React + TypeScript + Vite + Tailwind** — huge ecosystem, matches every fork candidate, TS types catch rules-engine bugs, Vite is fast. Component-driven multi-step wizard fits naturally.
- **Vue / Svelte** — both perfectly capable and lighter, but smaller D&D-tool ecosystem to borrow from, and no advantage for this project.
- **Server-rendered EJS (like the existing Rink Dashboard)** — reuses a known pattern, but a heavily interactive stateful builder (live-updating derived stats, multi-step wizard, multiclass math) is painful in server-rendered templates.

**Decision:** **React + TypeScript + Vite + Tailwind CSS.**

**Why:** The builder is fundamentally a rich, stateful client — derived stats recompute as you make choices. TypeScript is worth a lot here because the rules engine (esp. multiclassing) is exactly where silent bugs live. Matches the reference projects so we can borrow patterns.

**Why not the others:** Vue/Svelte fine but no edge here; EJS is the wrong tool for this much interactivity even though it's the dashboard's stack.

---

## Backend / Runtime

**Options considered:**

- **Node.js + lightweight API (Express, Fastify, or Hono)** — matches the existing VPS toolchain and deploy muscle memory; only needs to serve auth + character CRUD (a thin JSON API behind a React SPA).
- **Something new (Go, Python/FastAPI)** — no benefit, breaks stack consistency with the VPS.

**Decision:** **Node.js with a thin JSON API** (Express to match the dashboard, or Fastify/Hono if we want lighter — final pick at build time; Express is the safe default).

**Why:** Reuses the runtime, deploy pipeline, and operational knowledge already proven on the VPS. The rules engine lives client-side; the server just authenticates and stores characters, so it stays small.

**Why not the others:** New languages add ops overhead for zero gain at this scale.

---

## Database

**Options considered:**

- **SQLite** — file-based, zero-ops, already the store pattern on the existing dashboard; trivially enough for a handful of users. Characters stored as JSON blobs against a relational `users` table.
- **PostgreSQL** — more power, but operational overhead unjustified for ~a dozen accounts.

**Decision:** **SQLite** (with a nightly file backup, mirroring the dashboard's `backup.sh` pattern).

**Why:** Matches existing infra, no server to run, more than enough for the scale, easy to back up/restore.

**Why not Postgres:** Overkill; adds a service to manage for no benefit here.

---

## Auth (username + password, no email)

**Options considered:**

- **Better Auth** — modern, full-featured, but email/OAuth-centric; heavier than needed for pure username+password.
- **Lucia v3** — full control, but you wire up everything yourself (it's more of a pattern than a batteries-included lib now).
- **Minimal hand-rolled session auth** — `argon2` (or bcrypt) password hashing + a signed, HTTP-only session cookie backed by a `sessions` table in SQLite; invite-code-gated registration; an `is_admin` flag for the DM.

**Decision:** **Minimal session-based auth** (argon2 + HTTP-only cookie + SQLite session table), invite-gated, with an admin/DM role.

**Why:** The requirements are deliberately small — username/password, no email, no OAuth, no MFA, one trusted group. A vetted hashing library plus standard session cookies is fewer moving parts and dependencies than bending an email-first framework to a no-email flow. Admin resets passwords directly (matches the no-email decision).

**Why not the others:** Better Auth/Lucia are solving problems (OAuth, magic links, passkeys, orgs) this project intentionally doesn't have.

---

## Hosting / Deploy

**Options considered:**

- **Reuse the existing Hostinger VPS (srv1820905)** — Caddy for TLS + reverse proxy, git-based deploy (`deploy.sh`/`rollback.sh`/`backup.sh`) exactly like the Rink Dashboard, running as an unprivileged service user under systemd. New subdomain (e.g. `marches.therinkinc.com`). React build served statically by Caddy; Node API proxied behind it.
- **New host (Vercel/Netlify + managed DB)** — free tiers exist, but splits infra, adds accounts, and abandons the proven VPS pipeline for no reason.

**Decision:** **Reuse the VPS** — new systemd service + subdomain, same Caddy + git-deploy + backup pattern already working for the dashboard.

**Why:** Zero new cost, reuses a battle-tested deploy/rollback/backup pipeline, keeps everything on infrastructure Truman controls. Standalone from the dashboard app (own repo, own service) per the Phase 1 decision.

**Why not managed hosting:** Fragments infrastructure and adds third-party accounts for no benefit; the VPS already does this well.

---

## Pixel-art avatars

**Options considered:**

- **DiceBear "Pixel Art" style** — CC0 1.0, deterministic 8-bit avatars generated from a seed, available as a self-hostable JS library (no per-call API cost, no asset-sourcing burden). Half-body retro sprites.
- **Universal LPC Spritesheet Generator** — rich mix-and-match paper-doll parts (body/hair/armor/weapon) that could reflect species/class/gear, but licensing is a patchwork (many parts CC-BY-SA 3.0 / GPL 3.0) requiring careful per-asset attribution, and it's a lot more integration work.
- **AI-generated pixel art** — least asset-sourcing, but adds a generation dependency/cost and gives inconsistent results.

**Decision:** **DiceBear Pixel Art (CC0) for the MVP (M7)**, with the LPC paper-doll approach as a possible later upgrade if the group wants deeper customization.

**Why:** Clean CC0 license, self-hostable (no ongoing cost, no rate limit), and deterministic so each character gets a stable avatar for free. Gets the feature shipped without an art-authoring project.

**Why not the others:** LPC is more personal but a licensing/integration project in its own right — good as a v2, wrong for MVP. AI-gen adds cost/inconsistency.

---

## Build vs. Fork

**Options considered:**

- **Fork an existing open-source builder** (e.g. TheTechChild/dnd-character-builder, Cobyswan/DnD-5e-Character-Builder, Adventurer's Codex) — a head start on UI.
- **Build from scratch**, using those projects only as reference.

**Decision:** **Build from scratch** (React/TS), treating the existing builders as reference implementations for UI/UX patterns.

**Why:** Every mature open-source builder targets **2014** PHB/SRD rules. This project is **2024 (SRD 5.2)** with multiclassing and an extensible-for-homebrew data model. Forking a 2014 rules engine and converting it to 2024 is likely *more* work than building clean around a purpose-built 2024 dataset — and inherits someone else's architecture and scope. We borrow patterns, not the codebase.

**Why not fork:** Edition mismatch (2014 vs 2024) is deep — it's in the data model, not just the content — so a fork's head start is smaller than it looks.

---

## Cost check

Everything above is **free / self-hosted on the existing VPS** — no new paid services, no per-call API costs (DiceBear self-hosted, SRD data bundled). No ongoing-cost commitment needs Truman's sign-off. The only "cost" is the data-curation effort flagged under the SRD data source.
