# Plan: Issue #4 — Proficiencies and Languages (scoped to tool proficiencies)

## Goal
Show tool proficiencies on the character sheet.

## Scope decision
The original issue bundles two things with very different sizes:
- **Tool proficiencies**: already curated data (`backgrounds.json`'s `toolProficiency` field, e.g. Sage → "Calligrapher's Supplies"), just never rendered. A display-only fix.
- **Languages**: no language data exists anywhere in the pack (checked `species.json`, `backgrounds.json`, `schema.ts` — no field). Real data curation work, same class as #13. **Split out as #16**, not attempted here.

This plan covers tool proficiencies only.

## Implementation
`client/src/pages/CharacterSheetPage.tsx`: one line in the Background section, next to the existing "Feat:" line — `backgroundEntry?.toolProficiency && <p>Tool Proficiency: {backgroundEntry.toolProficiency}</p>`. No new data model, no new choice UI (the field is a raw descriptive string like the background's `feat` field already displayed the same way — some entries like Criminal's "_Choose one kind of_ Gaming Set" describe a choice in prose, but modeling that as an actual player choice is out of scope for a display fix and matches how the existing `feat` text is already shown verbatim).

## Verification
Live-tested locally: a Sage-background character's sheet now shows "Tool Proficiency: Calligrapher's Supplies" under the Background section.
