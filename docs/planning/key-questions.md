# Key Questions — Marches Reload

*Trugg Plan · Phase 2 · 2026-07-18*

Resolved one at a time. Each entry: the question, why it matters, and the resolution reached.

## 1. Access & ownership model — how do friends log in and own their characters?

**Why it matters:** "Fully open page" (Phase 1 pick) + shared server storage means anyone with the link could edit or delete anyone's sheet, because nothing ties a character to a person. This decision drives the auth system, the database schema (characters belong to a user), and the whole security posture.

**Resolution:** **Username + password accounts, no email required.** Each friend picks a username and password; characters are owned by that account. Resolves the contradiction — the page is reachable by anyone, but you must log in to create/edit, and you can only edit your own characters.

Consequences to design around:
- **No email = no automated password reset.** If a friend forgets their password, Truman (as admin) resets it manually. Acceptable for a private friend group; note it in the app ("ask the DM to reset").
- Passwords must still be **hashed securely** (argon2 or bcrypt) — "no email" doesn't mean "no security."
- Consider a simple **admin/DM role** for Truman (reset passwords, view/delete any character, later: manage campaign content).
- Registration should be gated (e.g. an invite code) so randoms who find the URL can't create accounts.

## 2. Rules edition — SRD 5.1 (2014) or 5.2 (2024)?

**Why it matters:** Determines the entire rules dataset and the math (species, backgrounds, feats, ability-score generation all changed in 2024). Picking wrong means re-doing the data layer.

**Resolution:** **SRD 5.2 (2024 rules), under CC-BY 4.0** as the shipped default content. **Updated 2026-07-18:** the content-pack system is **promoted from a future add-on (was M10) into core architecture (M2/M2b)**. The engine is fully content-driven — all content lives in "packs" with a `pack`/`source` id, nothing hardcoded per class. SRD 5.2 is the built-in pack; the owner/admin can **import additional packs** into their private instance.

**Licensing stance (why it's built this way):** Truman noted he and all his friends own the 2024 PHB. Ownership grants the right to *use* your copy, not a license to reproduce the book's text into a distributed system — copyright keeps "copy" and "distribute" as separate rights, and there's no "the whole group owns it" exception. Practical risk for a private group is near zero, but the *shipped* app therefore bundles **only** the CC-BY SRD; Claude will not bulk-transcribe the copyrighted PHB into the dataset. The content-pack machinery lets Truman, as the owner, load content he owns into his own instance — same functional result at the table, without the shipped product redistributing copyrighted text.

## 3. Character-model depth — how far does the builder go?

**Why it matters:** Drives the complexity of the data model and UI. Single-class level 1 is a weekend; full leveling + multiclassing is a substantially bigger engine (spell-slot progression, multiclass prerequisites, proficiency rules, per-level features).

**Resolution:** **Full leveling to level 10, with multiclassing.**

Consequences to design around:
- **Multiclassing is the single biggest complexity driver.** It needs: multiclass ability prerequisites, the multiclass spell-slot table, proficiency-on-multiclass rules, and careful per-class feature stacking. Doable, but it means the character engine is real work — budget for it in the milestones (Phase 3).
- Level cap 10 keeps spell levels to 5th and avoids the messiest high-level interactions — a sensible ceiling.
- Data model must represent a character as an ordered list of class levels (e.g. `[{class: Fighter, level: 3}, {class: Wizard, level: 2}]`), not a single class + level.

## New feature added this phase — 8-bit pixel-art character avatars

Truman wants each character represented as an **8-bit pixel-art avatar**. Captured here so it's in scope from the start. It raises a **new open question for Phase 3/4** (flagged, not resolved here):

- **How are the sprites produced?** Three broad approaches, very different in effort and asset-licensing:
  1. **Pick from a set** — a library of pre-made 8-bit sprites the user chooses from. Simplest. Needs sprites Truman owns or that are under a permissive/CC license (asset sourcing required).
  2. **Paper-doll / layered avatar creator** — mix-and-match parts (body, hair, armor, weapon) that reflect species/class/equipment. More work, more personal, biggest asset-authoring burden.
  3. **AI-generated pixel art** — generate a sprite per character. Least asset-sourcing, but adds a generation dependency/cost and less consistency.
- **Licensing note:** just like the rules content, avatar art must be assets Truman owns or that are appropriately licensed — pixel-art sets on itch.io/OpenGameArt often are, but each has its own license to check.

This doesn't change Q1–Q3; it's an added scope item to spec in Phase 3 and design in Phase 4.

## New question surfaced in Phase 4 — the 2024 SRD data isn't turn-key complete

**Why it matters:** The plan assumed the rules data (species, classes, per-level features, feats, spells) could be pulled ready-made from a free source. Phase 4 research found that's only partly true: 5e-bits' `/api/2024` dataset is still the *forthcoming* version, and Open5e's `srd-2024` data is live but has acknowledged gaps still being filled. If the data is incomplete, the leveling engine (M5) and multiclassing (M6) can't be built on it as-is.

**Resolution:** **Own the dataset.** Build a curated SRD 5.2 JSON dataset bundled into the app (seeded from Open5e `srd-2024` + the `downfallx/dnd-5e-srd-markdown` full SRD 5.2.1 text), rather than depending on a live third-party API. This turns "import a file" into a real **data-curation task inside milestone M2** — authoring/validating class-feature-by-level tables and multiclass rules where the free sources fall short. It also directly serves the homebrew-extensibility goal (we control the schema). Trade-off accepted: more upfront data work in exchange for control, offline operation, and no third-party dependency. See `tech-research-report.md` → "SRD 5.2 data source."
