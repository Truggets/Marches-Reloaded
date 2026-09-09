# CLAUDE.md — Marches Reloaded (Character Builder app)

Focused guide for agents working in **this repo** — the standalone D&D 5e (2024/SRD 5.2) character builder. This file is scoped to the app codebase. Broader project/campaign context lives one level up in `../CLAUDE.md`; the campaign hub is a separate future component.

## Goals

- Let a small, private friend group build fully rules-legal **D&D 2024 (SRD 5.2)** characters in the browser.
- Support **full leveling to level 10, including multiclassing**.
- Store characters **server-side per user** (accounts, no email); each character has an **8-bit pixel-art avatar**.
- Stay strictly inside **SRD 5.2 (CC-BY 4.0)** content; keep the data model **extensible for future homebrew**.
- Private use only — never a commercial product.

Full requirements: `docs/planning/PROJECT_SPEC.md`.

## Milestones

M0 skeleton+deploy → M1 accounts/login → M2 content-driven engine + SRD 5.2 default pack (incl. real data-curation) → M2b admin content-pack import → M3 L1 creation → M4 sheet view → M5 leveling to 10 → M6 multiclassing → M7 avatars → M8 polish/party view → (future) M9 campaign hub, M10 content-authoring UI.

Current status: **`docs/planning/PROJECT_SPEC.md` §4 milestones table** — check it first at the start of a session, update it last.

## Architecture overview

React + TypeScript SPA holds the whole builder **and the rules engine** (all derived-stat/multiclass math is client-side, typed). A thin **Node/Express** JSON API only does auth + per-user character CRUD + admin actions — no game rules on the server. **SQLite** stores users/sessions/characters/invites. SRD 5.2 data is a **self-owned bundled JSON dataset** in `data/` (seeded from Open5e `srd-2024` + the SRD 5.2.1 markdown), not a live API. Full design: `docs/planning/PROJECT_SPEC.md` §3 and `docs/planning/tech-research-report.md`.

## Repo layout

- `client/` — React + Vite + TypeScript + Tailwind frontend (builder UI + rules engine).
- `server/` — Node + Express JSON API (auth, character CRUD, admin).
- `data/` — bundled SRD 5.2 dataset (JSON) + the curation/build scripts that produce it.
- `docs/planning/` — Trugg Plan kickoff docs (spec, tech report, key questions, plan, retro).

## Design style guide

- **TypeScript everywhere**, strict mode on — the rules engine is where silent bugs live, so lean on types.
- Match the operational conventions of the existing **therink-dashboard** (unprivileged service user, Caddy TLS, git-based `deploy.sh`/`rollback.sh`/`backup.sh`, systemd) — this app is a sibling service, deployed the same way to the same VPS.
- Keep rules logic **data-driven** (read from the SRD dataset), not hardcoded per class — this is what makes homebrew possible later.

## Constraints and policies

- **The shipped app bundles SRD 5.2 content only** (CC-BY, attribution in the UI). Do NOT bulk-transcribe the copyrighted 2024 PHB (or other non-SRD books) into the shipped dataset — owning a book grants use, not redistribution rights. Non-SRD content reaches an instance via the **admin content-pack import** (M2b): the owner loads content they own into their own private instance. Build the pack *infrastructure*; don't ship non-SRD *content*. Rules mechanics (leveling/multiclass math) are systems, not copyrightable, and are fine to encode. Truman's own campaign content is unrestricted (that's the other component).
- **Secrets via environment variables only** — never in a git-tracked file, never pasted into chat/sandbox. `.env` is gitignored; `.env.example` documents the keys. (Matches the dashboard convention.)
- **No paid services / no ongoing costs** — everything self-hosted on the existing VPS; SRD data bundled, avatars self-hosted (DiceBear CC0).
- **No email** → forgotten passwords are reset manually by the admin/DM. Registration is invite-code gated.
- **Production authorization is per-action and explicit.** `git push`, running `deploy.sh`, and any DB migration on prod each need Truman's separate in-the-moment go-ahead — never inferred from one another (same rule as the dashboard).
- Don't silently "optimize away" multiclassing correctness — it's the accepted hard part, not dead weight.
- **After every real `git push` to this repo** (not every local commit — the pushed, shared state), update the TrumanOS progress note at `C:\Users\Truman\Desktop\TrumanOS\Obsidian Vault\Truman's Vault\Projects\Marches Reloaded.md` so it reflects the real current status (milestone table, open issues, last-verified date) — that note is what Truman actually looks at day-to-day, in Obsidian, not this repo directly. If the push is substantial enough to also date the full research overview at `C:\Users\Truman\Desktop\TrumanOS\content-creative\outputs\marches-reloaded-overview.md`, refresh that too — the vault note is explicitly a condensed pointer to it, so the two shouldn't drift apart.
- **Obsidian vault scope is restricted to `Projects/Marches/json/` only.** The curated/imported SRD + non-SRD content-pack data (backgrounds, feats, skills, subclasses, spells, monsters, gear, species, etc. — all the M2b admin content-pack material) lives as JSON at `C:\Users\Truman\Desktop\TrumanOS\Obsidian Vault\Truman's Vault\Projects\Marches\json\`. When this agent needs to read Obsidian-vault content for that data, it must look **only** inside that `json/` subfolder — never the rest of the vault (WGU/UTMB coursework, personal notes, other projects, etc.). The companion `.md` files one level up in `Projects/Marches/` are the human-readable/lore counterparts of the same source books and are not this agent's concern either — stick to `json/`. This keeps the agent from wandering into unrelated vault content and getting confused.

## Commands frequently used

```
# (scaffolding TBD at M0 — placeholders to fill in once client/server are initialized)
# client:  npm --prefix client run dev        # Vite dev server
# server:  npm --prefix server run dev         # Express API (nodemon)
# build:   npm --prefix client run build
# data:    node data/build-srd.js              # regenerate bundled SRD dataset
# deploy:  ./deploy.sh                          # git-based release (prod, needs explicit OK)
```

Permissions are preconfigured in `.claude/settings.json` — see `docs/planning/` Phase 6.

## Documentation policy

Every new feature gets a short reference doc under `docs/<feature-name>/` (overview, architecture, core components, status). Kickoff/planning docs stay in `docs/planning/`. Keep the milestones table in `PROJECT_SPEC.md` current — it's the single source of truth for "what's done."

## Testing

- **Unit-test the rules engine** (client): ability modifiers, proficiency bonus, AC/HP, spell-slot tables, and — especially — **multiclass spell-slot and prerequisite logic**. This is the highest-value test surface.
- Manual smoke checklist for the wizard happy path and the auth flow until those stabilize.

## Documentation index

> **Note:** during planning the canonical docs live at the project level, `../docs/planning/` (i.e. `Marches Reloaded/docs/planning/`). When this `app/` folder is initialized as the real standalone git repo at M0, copy `../docs/planning/` into the repo as `docs/planning/` so the pushed repo is self-contained. Paths below are relative to that final in-repo location.

- `docs/planning/PROJECT_SPEC.md` — requirements + milestones (source of truth for status).
- `docs/planning/tech-research-report.md` — stack decisions and why.
- `docs/planning/key-questions.md` — the load-bearing decisions (auth, edition, depth, data ownership).
- `docs/planning/plan-doc.md` — the original idea/goals/scope.
- `docs/planning/retro.md` — planning-process retro (Phase 7).
