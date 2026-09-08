---
name: daily-issue-review
description: Daily one-issue-at-a-time triage workflow for Marches Reloaded — picks the next unplanned open GitHub issue, researches it in the code, has Truman log into the live site to explore it together, drafts a solution, re-verifies it against SRD rules, gets an advisor second opinion, and presents a written plan without implementing. Use when Truman wants to work the GitHub issue backlog, says "daily issue review", or asks what to tackle next on open issues.
---

# Daily Issue Review

Works exactly one open GitHub issue per run, end to end, from "what's next" to a reviewed written plan — never past that. This exists because the open issues (`Truggets/Marches-Reloaded`, currently #2,3,4,5,6,10,12,13) were largely filed by a real playtester and mostly reconcile with this project's own list of accepted scope gaps — the backlog isn't a mystery, it just needs one issue at a time turned into an actionable, verified plan.

This skill never edits code. It ends at a written plan for Truman to act on separately.

## 1. Pick the issue

`gh issue list --repo Truggets/Marches-Reloaded --state open`, cross-referenced against `docs/planning/issue-triage-log.md` (create it — see template below — if it doesn't exist yet). Filter out anything with a log entry — don't re-present one that's already planned. From what's left, use judgment to rank the remaining issues by importance (e.g. correctness/bug impact, how many other issues or accepted gaps depend on it, how many players it likely affects) and present Truman a short ranked list with a one-line reason each. Wait for him to pick one before continuing to step 2. If every open issue already has a log entry, say so and stop.

## 2. Research pass 1 — orient in the code

`gh issue view <n>` for the full body/comments. Then find the relevant code: rules-engine logic lives under `client/` for a mechanics gap, the bundled dataset lives under `data/` for a data-curation gap (issue #13, for example, is explicitly a data-curation problem, not a picker bug). Note existing patterns worth reusing — this project's `CLAUDE.md` requires rules logic to stay data-driven, not hardcoded per class, so a fix that hardcodes a special case is very likely the wrong shape.

## 3. Live exploration with Truman

Use the `claude-in-chrome` skill/tools to open `https://marches.therinkinc.com`, then explicitly ask Truman to log in — auth is session-based with no stored credentials per this project's constraints, so this step always needs him. Either walk him through reproducing the issue on a real character, or watch page state/console/network while he reproduces it. Don't skip this even when the bug looks obvious from source alone — the issues were filed by a live playtester and can hide UI/data nuance that isn't visible from code.

## 4. Draft a candidate solution

Concrete: which files change, what the fix looks like. Explicitly flag if the issue is actually one of the already-accepted scope gaps that shouldn't be closed yet (e.g. Weapon Mastery needs a whole attack-bonus system that doesn't exist — per `CLAUDE.md` that's out of scope until built, not a quick fix).

## 5. Research pass 2 — verify the solution

Only once a concrete fix exists: re-check it against SRD 5.2 rules text (the bundled dataset, or the `downfallx/dnd-5e-srd-markdown` source it's built from). If the fix touches spell slots, proficiencies, or feature stacking, specifically re-verify multiclass interactions — `CLAUDE.md` calls out multiclass correctness as the deliberately hard part, not something to optimize away.

## 6. Advisor review

Call `advisor()` with the drafted solution now in context — it's backed by a stronger reviewer model and reads the full transcript (research, live exploration, candidate fix), so no separate briefing is needed. Fold its feedback in; if it disagrees with the approach, reconcile the disagreement rather than silently overriding it.

## 7. Write and present the plan

Save to `docs/planning/issue-<n>-plan.md` before presenting — durable before the turn ends, same as any other plan artifact on this project. Include: goal, root cause, proposed fix with file paths, verification approach, and an explicit call-out if this is actually out of scope per the accepted-gaps list. Present a concise summary to Truman. Stop here — implementation is a separate, later step he'll ask for explicitly.

## 8. Log it

Append a row to `docs/planning/issue-triage-log.md`:

```markdown
| Issue | Date | Status | Plan |
|---|---|---|---|
| #2 | 2026-09-08 | planned | docs/planning/issue-2-plan.md |
```

Status is one of `planned` / `needs more info` / `wontfix`. This is what step 1 reads next time, so tomorrow's run picks the next issue instead of repeating this one.
