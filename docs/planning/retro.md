# Planning Retro — Marches Reload

*Trugg Plan · Phase 7 · 2026-07-18*

A retro on the **planning process**, not the product. Punch list, not an essay.

## What worked

- **Batching the Phase-2 clarifiers up front** (one multi-question prompt covering hosting / storage / access / build-vs-fork) surfaced the load-bearing **access-vs-storage contradiction** immediately, instead of discovering it mid-spec. High-leverage.
- **The escalation mechanism did its job.** Phase 4 research found the 2024 SRD data isn't turn-key complete — a fact that really belonged among the key questions. The workflow's "push it back into `key-questions.md` and flag it" step caught it cleanly rather than burying it in a report.
- **Existing infra made several phases short.** Reusing the VPS + Caddy + git-deploy pattern from the dashboard meant Phase 4 hosting and Phase 5 secrets/deploy conventions were mostly "match what already works," not fresh decisions.
- **Templates were the right starting shape**, especially `settings.json` — the deploy/migrate "ask" tier and secret/DB "deny" rules were real tailoring on top of the generic template, which is exactly how it should be used.

## What was slow / redundant

- **Phase 3 felt thin for this project.** By the time we got there, the plan doc + key questions already implied most of the spec; the milestones table was the only genuinely new output. Not wasted, but light.
- **A brief phase-order wobble** (jumped toward Phase 4, then back to 3). No harm — the research done early wasn't lost — but a reminder the phases are meant to run in order.

## Decisions that arrived later than ideal

- The **pixel-art avatar** feature entered as new scope in Phase 2 and the **data-completeness** reality in Phase 4. Both were absorbed fine, but both are the kind of thing a "what does 'done' actually include?" nudge in Phase 1 might have surfaced sooner.

## Environment friction (not a trugg-plan issue)

- Consolidating duplicate planning docs hit the Cowork **file-deletion guard** twice before the right tool (`allow_cowork_file_delete`) resolved it. Purely environmental; noting so a future session reaches for that tool first instead of retrying `rm`.

## Suggestion for the trugg-plan skill itself (structural)

The pre-Phase-1 "solo vs. multi-user" question was valuable. A **parallel early prompt — "does this live inside / reuse existing infrastructure?"** — would have front-loaded the VPS-reuse decision that quietly shaped Phases 4–6 here. This is a change to the **skill**, not just this project's execution of it; acting on it means re-running the skill-creator workflow on `trugg-plan` in a session where skill files can be saved. Flagged, not silently noted.

## Net

Seven phases, ~right depth for a real multi-week build. Nothing here would have been better as "just start coding." The docs now stand on their own for a future session (or a cold agent) to build from.
