# Plan Doc — Marches Reloaded (D&D campaign hub; first build = Character Builder)

*Trugg Plan · Phase 1 · 2026-07-18*

## The idea

A web-based D&D 5e character builder, hosted on Truman's own site (therinkinc.com), that his friends use to create and store characters for their private campaign. SRD-only content — no copyrighted book material. Not a product; private use for one friend group.

## Goals

- Friends can build a legal 5e character start-to-finish in the browser (species, class, background, ability scores, skills, equipment, spells) without needing to own the books or wrangle a PDF.
- Finished characters persist on Truman's VPS so they survive across devices and the group has a single shared home for the party.
- Stays firmly inside content Truman is legally clear to use (SRD 5.1 / 5.2 under Creative Commons), so there's zero rights risk even though it's private.
- Bonus motivation: a real, self-owned full-stack project on infrastructure Truman already runs — good portfolio/skill value alongside the campaign utility.

## Problem it solves

Character creation for new/casual players is the friction point at the table: rules scattered across books, math to track (modifiers, proficiency, spell slots), and no shared place to keep sheets. Commercial tools (D&D Beyond) gate content behind purchases and accounts. Truman wants a free, private, SRD-legal tool his group controls, living on his own domain.

## Known constraints

- **Multi-user:** must support Truman + his friend group (small, trusted, private). Not public, not sold.
- **Legal:** SRD content only (CC-BY 4.0 — SRD 5.2 / 5.1). Attribution required. No Player's Handbook-exclusive species/subclasses, no protected monsters/settings.
- **Budget:** no new paid services expected; reuse the existing Hostinger VPS (srv1820905, Ubuntu 24.04) and free SRD data APIs.
- **Hosting decision (made):** standalone app served from therinkinc.com (own repo, own deploy), *not* folded into the existing Rink Dashboard Express app.
- **Storage decision (made):** characters saved server-side on the VPS (shared/persistent).
- **Access decision (made, with caveat):** fully open page — see open question below, this conflicts with shared server storage and needs resolving.
- **Infra reality:** VPS uses Caddy for TLS + a git-based deploy pipeline (deploy.sh/rollback.sh) already proven for the Rink Dashboard; production push/deploy each require Truman's explicit per-action go-ahead.

## Out of scope / non-goals

- Not a commercial product; no billing, no public sign-ups, no marketing.
- No non-SRD content (no homebrew engine on day one, no book-exclusive races/subclasses/spells).
- Not a full virtual tabletop (no maps, combat tracker, dice-rolling battles, or DM campaign management) — just character creation + storage.
- Not a D&D Beyond clone in scope; MVP is "build + save + view/print a sheet."
- No mobile-native app; responsive web is enough.

## Open questions — status after Phase 2

RESOLVED (see `key-questions.md`):
- **Access & ownership:** username + password accounts, no email required. Log in to create/edit; you own your own characters. Admin/DM role for Truman; gated registration.
- **SRD version:** SRD 5.2 (2024), CC-BY 4.0. Data model kept extensible for future homebrew add-ons.
- **Character depth:** full leveling to level 10, with multiclassing.

STILL OPEN (later phases):
- **Pixel-art avatars (new scope):** how sprites are produced — pick-from-set vs. layered paper-doll vs. AI-generated — and where licensed assets come from. Spec in Phase 3, design in Phase 4.
- **Build vs. fork:** build from scratch vs. adapt an open-source React builder — Phase 4 research.
- **Data source:** bundle a static SRD JSON snapshot vs. call a live API (dnd5eapi.co / Open5e) at runtime — Phase 4.
