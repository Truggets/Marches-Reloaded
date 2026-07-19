# Repo Setup — Marches Reloaded

*Trugg Plan · Phase 5 · 2026-07-18*

The 7-item checklist. Note: this sandbox can't reach github.com (allowlist-only), so the GitHub steps below are commands **you** run locally / on the VPS — everything else is already scaffolded in `app/`.

## 1. GitHub repo  ✅ created — remote: https://github.com/Truggets/Marches-Reloaded

Repo exists at **`github.com/Truggets/Marches-Reloaded`** (sibling to `Truggets/therink-dashboard`).

Init and connect the local `app/` scaffold (you run this — sandbox can't reach GitHub):

```
# from inside the app/ folder once you're ready to init:
cd "Marches Reloaded/app"
cp -r ../docs/planning docs/planning        # make the repo self-contained
git init
git add -A
git commit -m "Initial scaffold: Marches Reloaded character builder (planning + repo skeleton)"
git branch -M main
git remote add origin git@github.com:Truggets/Marches-Reloaded.git   # or https://github.com/Truggets/Marches-Reloaded.git
# git push -u origin main    # ← run only when you're ready; pushing needs your explicit go-ahead
```

Confirm the GitHub repo is set to **Private** (private use only).

## 2. Secrets convention  ✅ (done)

Environment variables only — never in a git-tracked file, never pasted into chat/sandbox (matches the dashboard rule). `.env` is gitignored; `.env.example` documents every key (SESSION_SECRET, INVITE_CODE, ADMIN_*, DATABASE_PATH). Real secrets live only in the `.env` on the VPS. Rule is written into `app/CLAUDE.md` → Constraints.

## 3. CLAUDE.md  ✅ (done)

`app/CLAUDE.md` written — goals, milestones, architecture, repo layout, style guide, constraints, commands, testing, docs index. Scoped to the app; parent `../CLAUDE.md` holds campaign-hub/project context.

## 4. Documentation policy  ✅ (done)

Written into `app/CLAUDE.md`: kickoff docs in `docs/planning/`; each future feature gets `docs/<feature>/` with overview/architecture/components/status; the `PROJECT_SPEC.md` milestones table is the single source of truth for "what's done" and is updated last each session. (A status-reconciliation subagent is a good future addition — see item 7.)

## 5. Plugins  — none required

No Claude Code plugin is essential for a solo build of this stack. The productivity plugin is already installed for task tracking. Frontend/feature-workflow plugins exist but none are must-haves; revisit only if the build gets unwieldy.

## 6. MCP servers  — optional, none essential

Searched the connector registry. Nothing is required to build this. If you later want issue tracking tied to the repo, a **GitHub** connector would be the natural fit — but the sandbox can't reach GitHub anyway, and you already track work in Todoist, so this is low priority. Deployment connectors (Vercel etc.) don't apply — this self-hosts on your VPS. No Hostinger MCP exists (confirmed previously); VPS work stays on the hPanel web Terminal via Chrome.

## 7. Slash commands & subagents  — one worth building later, none now

Nothing to build *yet* (no code exists). One clear future candidate once the build is underway:

- **`status-reconciler` subagent** (future) — reads git history + the milestones table and flags where `PROJECT_SPEC.md` §4 is out of date. Model: mid-tier (**Sonnet**) — it exercises real judgment about whether a milestone is genuinely "done," not just mechanical transcription.
- A mechanical **`changelog`** slash command (git log → changelog entry) could run on the cheapest tier (**Haiku**) — defer until there's history to summarize.

Deferred deliberately: building these before the code exists would produce the wrong shape.

### Bonus — hooks (optional)

Could add a session-end reminder hook that nags if the milestones table wasn't updated. Nice-to-have; set up later if status docs start drifting.
