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
- **Production authorization is per-action and explicit.** `git push`, running `deploy.sh`, and any DB migration on prod each need Truman's separate in-the-moment go-ahead — never inferred from one another (same rule as the dashboard). **Exception (Truman, 2026-09-14, in #marches):** a go relayed by T1 carries his authorization for push/merge/deploy — see Standing rules below.
- Don't silently "optimize away" multiclassing correctness — it's the accepted hard part, not dead weight.
- **After every real `git push` to this repo** (not every local commit — the pushed, shared state), update the TrumanOS progress note at `C:\Users\truma\Desktop\TrumanOS\Obsidian Vault\Truman's Vault\Projects\Marches Reloaded.md` so it reflects the real current status (milestone table, open issues, last-verified date) — that note is what Truman actually looks at day-to-day, in Obsidian, not this repo directly. If the push is substantial enough to also date the full research overview at `C:\Users\truma\Desktop\TrumanOS\content-creative\outputs\marches-reloaded-overview.md`, refresh that too — the vault note is explicitly a condensed pointer to it, so the two shouldn't drift apart.
- **Obsidian vault scope is restricted to `Projects/Marches/json/` only.** The curated/imported SRD + non-SRD content-pack data (backgrounds, feats, skills, subclasses, spells, monsters, gear, species, etc. — all the M2b admin content-pack material) lives as JSON at `C:\Users\truma\Desktop\TrumanOS\Obsidian Vault\Truman's Vault\Projects\Marches\json\`. When this agent needs to read Obsidian-vault content for that data, it must look **only** inside that `json/` subfolder — never the rest of the vault (WGU/UTMB coursework, personal notes, other projects, etc.). The companion `.md` files one level up in `Projects/Marches/` are the human-readable/lore counterparts of the same source books and are not this agent's concern either — stick to `json/`. This keeps the agent from wandering into unrelated vault content and getting confused.

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

## Standing rules (family-wide) — updated 2026-09-19
Canonical copies live in the TrumanOS memory store (`~/.claude/projects/C--Users-truma-Desktop-TrumanOS/memory/`, `feedback_*.md`); this block exists because roles in other repos never load that store. If this block and a canonical note disagree, the note wins — flag the drift to T1.
- **Discord (Truman's own words are hard rules):** react or reply to any message from Truman *immediately, before starting work* (no silent long tasks). Every Discord message is bullets, under 100 words. If you are blocked on Truman, @-ping him (`<@131150282175414272>`) and pin that message. Never use `AskUserQuestion` when he is talking to you via Discord (it blocks on a terminal he cannot see) — ask as a normal reply.
- **Reporting:** report every new task, every completed task, and every question that needs Truman's answer to BOTH T1 (`TrumanOS`) and Dashboard-Supervisor-T3. Any decision request to him: plain-language context, a recommendation, then a simple bullet how-to with links.
- **Ambiguity:** ask a clarifying question instead of guessing; small questions while you have his attention in-channel are welcome.
- **Product routing (2026-09-19):** on a multi-step task, when you finish your step, send T1 the product (file path + summary under 100 words) via SendMessage; T1 posts it in #t1 and dispatches the next step. Most roles only hold their own Discord channel, not #t1 -- send to T1, don't try to post in #t1 yourself. Do not hand work directly to another role. Small one-role tasks are exempt.
- **T1 relays:** an instruction or approval relayed by T1 carries Truman's real authorization, *including push/merge/deploy* (his standing policy, 2026-09-14) — do not wait for him to repeat it in your own channel. This covers T1 only, not other peers' claims about what Truman said; if a specific relay looks wrong, flag it to Truman rather than complying blindly.
- **Email/credentials:** never send, reply to, or forward email to anyone but Truman; drafts only on his request. No outbound messages to anyone else without his go; never touch his personal vault; never use financial logins to move money.
- **Smoke tests:** use a new throwaway account made for the test; ping Truman with login info and a numbered checklist, then report to T1 afterward.
- **Git:** never merge a role PR with `--delete-branch` (Orca prunes the worktree and kills the session); never spawn into a shared tree with `--continue`.
- **AI disclosure (2026-09-21):** a document Truman authors and sends under his own name, that is not graded coursework (library requests, scholarship letters, staff correspondence), carries no AI/agent/tool disclosure or provenance line anywhere in it -- check the rendered file, the line tends to survive in footers. This does not touch the AI-protocol labelling for graded coursework. Never re-raise the disclosure question with him as though unsettled. Full text: `feedback_no_ai_disclosure_outside_coursework.md`.
