# Project Spec — Marches Reload

*Trugg Plan · Phase 3 · 2026-07-18*

## 0. Purpose

Marches Reload is a private, SRD-legal home for Truman's D&D campaign and the tools around it. Its first component is a web-based **character builder** that lets his friend group create, level, and store fully rules-legal D&D 2024 (SRD 5.2) characters — including multiclassing up to level 10 — each represented by an 8-bit pixel-art avatar. Characters live server-side on Truman's own VPS behind simple accounts, so sheets persist across devices and the group has one shared home. A later component adds the campaign itself (session notes, world/lore, NPCs, house rules). It is not a product and will never be sold; all game-rules content stays inside the Creative Commons SRD.

## 1. Functionality / Jobs-to-be-done

**Who is this for?** Truman (as DM/admin) and a small, fixed group of his friends (players). Private and trusted — not the public. Realistically a handful of accounts.

**What does it need to solve?** Character creation is the friction point for casual players: rules scattered across books they may not own, fiddly math (modifiers, proficiency, spell slots, multiclass rules), and no shared place to keep sheets. Commercial tools gate content behind purchases. The group needs a free, private, SRD-legal builder on Truman's own domain where everyone's characters live together.

**What does it actually do?** (behavior, not tech)

- A friend visits the site, logs in (or registers with an invite code — username + password, no email).
- They start a new character and walk a guided flow: pick species, class, background, generate/assign ability scores, choose skills and proficiencies, pick starting equipment, and (for casters) choose spells — all limited to SRD 5.2 options.
- They can **level the character up to level 10**, gaining the correct features, ability-score improvements/feats, and spells at each level.
- They can **multiclass** — add levels in additional classes, with the builder enforcing multiclass prerequisites, combining spell slots correctly, and granting the right multiclass proficiencies.
- Each character gets an **8-bit pixel-art avatar**.
- The finished character shows as a clean, computed **character sheet** (all derived stats filled in) that can be viewed and printed/exported.
- Characters are **saved to the player's account** on the server; a player sees and edits only their own, while Truman (DM/admin) can see the whole party and reset passwords.

## 2. Scope & Non-Goals

**In scope (builder MVP → v1):** account login (no email), invite-gated registration, DM/admin role, a **content-driven data engine** that reads all game content from "content packs," **SRD 5.2 shipped as the default pack**, an **admin content-pack import** so the owner can load additional content the group owns, guided character creation, leveling to 10, multiclassing, computed character sheet with print/export, per-character 8-bit avatar, server-side storage of characters per user.

**Out of scope / not this project's job:**

- No commercial features — no billing, public sign-ups, or marketing.
- **The distributed/shipped app bundles SRD 5.2 content only.** Non-SRD content (e.g. full 2024 PHB material) is *not* shipped with the app; instead the app provides the machinery for the owner to import content packs into their own private instance. Rationale: owning a book grants use, not a license to redistribute its text — so the app ships the CC-BY SRD and lets the private instance carry whatever its owner loads. See `key-questions.md`.
- Not a virtual tabletop — no maps, initiative/combat tracker, or in-app dice-based play (a simple dice roller is optional polish, not core).
- No leveling past 10.
- No mobile-native app (responsive web is enough).
- The **campaign hub** (session notes/lore/NPCs) is a later phase of Marches Reload, not part of the builder MVP.

## 3. Technical Design

Full research and rationale in `tech-research-report.md`. Summary:

**Stack:** React + TypeScript + Vite + Tailwind (frontend/rules engine) · Node + thin JSON API (Express) · SQLite · minimal session auth (argon2 + HTTP-only cookie, no email) · self-hosted on the existing Hostinger VPS behind Caddy via the proven git-deploy pipeline · DiceBear Pixel Art (CC0) for avatars · **build from scratch** (existing builders are all 2014-edition; this is 2024/SRD 5.2). SRD data is a **self-owned bundled JSON dataset** (seeded from Open5e `srd-2024` + the SRD 5.2.1 markdown), not a live API.

**Architecture / system design:**

- **Client (React SPA)** holds the whole character-building experience and the **rules engine** — all derived-stat computation (modifiers, proficiency, AC, HP, spell slots, multiclass math) happens client-side against the bundled SRD dataset. This keeps the server thin and the rules logic in typed code where bugs are catchable.
- **Content-pack engine (core).** All game content is expressed as **content packs** — a defined JSON schema for species, classes + per-level features, subclasses, backgrounds, feats, spells, equipment. Every entry carries a `pack`/`source` id. **SRD 5.2 is the built-in default pack** (bundled, CC-BY). The engine is content-driven: the rules logic reads packs, nothing about a specific class is hardcoded. An admin can **import additional packs** into their instance; a character records which pack each choice came from so sheets stay reproducible. This makes "use content we own" a first-class capability of the owner's private instance without the shipped app redistributing non-SRD text.
- **Server (Node/Express JSON API)** does only three things: authenticate (register/login/logout, session cookies), store/retrieve **characters** (per-user CRUD, character saved as a JSON document), and admin actions (password reset, party view). No game rules live on the server.
- **Database (SQLite):** `users` (id, username, argon2 hash, is_admin), `sessions`, `characters` (id, owner_user_id, JSON blob, timestamps), `invites` (codes for gated registration). Nightly file backup.
- **Auth flow:** invite-code-gated registration → argon2-hashed password → signed HTTP-only session cookie → middleware gates character write/read to the owner; `is_admin` unlocks party view + password resets.
- **Deploy:** standalone repo → git-based `deploy.sh` (mirroring the dashboard) → systemd service as an unprivileged user → Caddy terminates TLS and serves the static React build + reverse-proxies `/api` to Node → own subdomain (e.g. `marches.therinkinc.com`). Production push and deploy each require Truman's explicit per-action go-ahead.

**Data flow (build a character):** player logs in → client loads bundled SRD data → guided wizard collects choices, rules engine computes the sheet live → on save, the client POSTs the character JSON to `/api/characters` → server stores it against the user in SQLite. Viewing/leveling re-hydrates that JSON into the client engine.

## 4. Milestones

Ordered so each depends only on those before it. Early ones precise; later ones intentionally loose.

| # | Milestone | What "done" looks like | Status |
|---|---|---|---|
| M0 | Skeleton + deploy | Empty app builds and serves at the target URL on the VPS via the git-deploy pipeline; TLS working. | **Done** (2026-07-19) — live at https://marches.therinkinc.com, `/api/health` returns 200 via Caddy reverse proxy, TLS auto-provisioned. |
| M1 | Accounts & login | Invite-gated register, log in/out, hashed passwords (no email), DM/admin role, admin password reset. | **Done** (2026-07-19) — verified live at https://marches.therinkinc.com: invite-gated register/login/logout, `/api/auth/me`, admin (`truman`) reset-password, 403 for non-admins. |
| M2 | Content-driven data engine + SRD 5.2 pack | Engine reads all content (species, classes/subclasses, backgrounds, feats, spells, equipment) from a **content-pack format**; **SRD 5.2 ships as the default pack**; data is queryable and pack-scoped. This is now core architecture, not a late add-on. | Not started |
| M2b | Content-pack import (admin) | Admin/DM can import an additional content pack into their instance (validated against the pack schema) so the group can use content it owns; characters record which pack each choice came from. | Not started |
| M3 | Level 1 character creation | Full happy-path single-class L1 build (species/class/background/abilities/skills/equipment/spells), saved to the player's account. | Not started |
| M4 | Character sheet view | Read-only computed sheet (modifiers, proficiency, AC, HP, spell slots), printable/exportable. | Not started |
| M5 | Leveling to 10 (single class) | Level-up flow grants correct features, ASI/feat choices, and spells per level up to 10. | Not started |
| M6 | Multiclassing | Add levels in additional classes with prerequisite checks, combined spell slots, and multiclass proficiencies. | Not started |
| M7 | 8-bit avatars | Each character has a pixel-art avatar (approach chosen in Phase 4); shown on sheet and in character list. | Not started |
| M8 | Polish & party view | DM party view (see all characters), edit/delete own character, error handling, responsive cleanup, optional dice roller. | Not started |
| M9 | Campaign hub (future) | Session notes, lore, NPCs, house rules — separate later phase of Marches Reload. | Placeholder |
| M10 | Content-authoring UI (future) | In-app editor to *create/edit* content packs (vs. importing a pre-made file at M2b). Nice-to-have polish. | Placeholder |

## 5. Key Risks / Assumptions

- **SRD 5.2 data completeness.** Assumes the free datasets (Open5e `srd-2024`, 5e-bits `/api/2024`) cover the 2024 character-creation rules well enough (species traits, class features per level, backgrounds, feats, spells). Gaps here directly hit M2–M5 — to be verified in Phase 4.
- **Multiclassing correctness is the hardest part.** The rules engine (prerequisites, shared spell-slot table, proficiency-on-multiclass) is the biggest source of subtle bugs. Budget accordingly; consider it the milestone most likely to slip.
- **No-email password recovery.** Forgotten passwords require manual admin reset — acceptable for a private group but a real operational assumption.
- **Avatar asset licensing.** Pixel-art assets must be owned or permissively licensed (CC0/MIT/CC-BY); to be locked down in Phase 4.
- **Open-page + accounts.** Registration must be gated (invite code) so a leaked URL doesn't let strangers create accounts.
- **Legal.** Everything shipped stays inside SRD 5.2 (CC-BY 4.0) with attribution; Truman's own campaign content is unrestricted.
