# Reference Library — Hazards & Magic Items (#22, display-only)

## Overview
A read-only in-app reference page (`/reference`, any authenticated user) listing
hazards/conditions and magic items imported via the admin content-pack importer.
Purely informational — no mechanical integration with character sheets, leveling,
or the combat sandbox. Scoped as the "small win first" half of #22, per
`docs/planning/issue-22-and-subclass-import-plan.md`: full mechanical integration
(e.g. conditions consumed by the rules engine) is deferred as its own
separately-scoped project.

## Architecture
- `data/schema.ts` — `HazardEntry`/`MagicItemEntry` interfaces. Both are 100%
  import-only categories: no bundled SRD equivalent exists to merge with, unlike
  every other content type.
- `data/build/parse-hazards-import.js` / `parse-magic-items-import.js` — the
  same "reject the whole pack, name the offender" vault-JSON parsers used by
  every other M2b content type, wired into `POST /api/admin/packs/import`
  (`server/src/routes/admin.js`) and the admin importer UI's 7th/8th textareas
  (`client/src/pages/AdminPackImportPage.tsx`).
- `data/index.ts` — `listHazards()`/`getHazard()`/`listMagicItems()`/`getMagicItem()`,
  simply returning the imported arrays directly (no bundled array to spread).
- `client/src/pages/ReferenceLibraryPage.tsx` — the actual reference page: two
  sections (Hazards & Conditions, Magic Items), a client-side name/category
  filter, empty state when nothing's been imported yet. Linked from
  `CharacterListPage` ("Reference Library").

## Status
Built 2026-09-15. Vault source: `Core-and-Expansion-Rules-Hazards.json` (22
entries) and `Magic-Items-and-Artifacts.json` (8 entries) in the Obsidian vault's
`Projects/Marches/json/` folder — not yet imported into production at time of
writing; an admin runs the import via `/admin/packs/import` once this ships.
