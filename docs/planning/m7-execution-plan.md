# M7 — 8-bit Avatars — Execution Plan

## Goal (verbatim from PROJECT_SPEC.md)
"Each character has a pixel-art avatar (approach chosen in Phase 4); shown on sheet and in character list."

## What already exists
- Tech decision locked in `tech-research-report.md`: **DiceBear "Pixel Art" style, CC0 1.0, self-hosted**, deterministic from a seed — no AI generation, no paper-doll parts, no per-call cost.
- `characters.id` (SQLite `INTEGER PRIMARY KEY`) is a stable, unique numeric id already exposed to the client on both the list (`CharacterSummary.id`) and the sheet (route param) — **usable directly as the avatar seed, no schema/server change needed.**
- Existing pixel-art visual convention to match: `WilburCompanion.tsx` renders a static image inside a `.pixel-frame` bordered box with a `.pixel-label` caption.
- No CSP is set anywhere in this stack (checked: no `helmet` in Express, no `Content-Security-Policy`/`img-src`/`style-src` directive in the deployed Caddyfile) — a `data:` URI `<img>` has nothing to be blocked by.
- Confirmed via the installed package: `createAvatar(pixelArt, opts).toDataUri()` is **synchronous** (returns `string`, not a `Promise`) — a plain `useMemo` is correct, no `useEffect`/loading state needed.
- Package choice: depend on **`@dicebear/pixel-art@9.4.3`** directly (not the `@dicebear/collection` barrel, which re-exports 29 other unused styles) + `@dicebear/core@9.4.3` (same version, confirmed no peer-dep warning on install). Already installed in `client/package.json`.

## Scope cut (per review before drafting this)
No avatar preview in the character-creation wizard. The spec only requires "sheet and character list" — both sites already have a stable `id`. Adding a pre-save preview would need a fake seed and immediately go stale once the real id is assigned; not worth building for a requirement that doesn't ask for it.

## Task breakdown

All of this is local file work, no shared/production state — doing it directly rather than delegating (it's a handful of small, interdependent files; briefing a subagent would cost more than just writing it).

1. `client/src/avatar.ts` — pure function `avatarDataUri(seed: string): string`, wrapping `createAvatar(pixelArt, { seed }).toDataUri()`. Kept separate from the React component so it's unit-testable like the rest of the rules engine.
2. `client/src/avatar.test.ts` — two tests: same seed → identical output (determinism), different seed → different output (distinctness).
3. `client/src/CharacterAvatar.tsx` — small component: `<CharacterAvatar id={number} label={string} size?: number>`, seeds via `String(id)`, wraps the `<img>` in the existing `.pixel-frame` class, meaningful `alt={label}` (unlike Wilbur, this image identifies a specific character, so it isn't decorative).
4. `CharacterListPage.tsx` — insert `<CharacterAvatar id={c.id} label={c.name} size={48} />` as the first child of each card, before the name/species block.
5. `CharacterSheetPage.tsx` — insert `<CharacterAvatar id={Number(id)} label={character.name} size={96} />` beside the `<h1>`/`<p>` in the header, as a flex row.
6. `Credits.tsx` — optional one-line CC0 attribution addition (not legally required, cheap to add for consistency with the existing SRD attribution line).
7. `docs/avatars/README.md` — short feature doc per this repo's documentation policy (overview, architecture, status).

## Definition of done
- `npm run test` passes (existing 38 + 2 new).
- `npm run build` succeeds; compare the emitted JS chunk size against the last known build (903.35 kB) to confirm the tree-shaken `@dicebear/pixel-art` addition doesn't bloat it disproportionately.
- Manual local-dev check: character list shows a distinct small avatar per character; character sheet shows a larger avatar in the header; same character shows the same avatar on both pages (same seed).
- `PROJECT_SPEC.md` M7 row updated with status + evidence; synced into `app/docs/planning/`.
- Push and deploy each get their own separate go-ahead, per standing project rule. Verify live on the deployed site over the internet (not just local dev) — includes confirming no CSP surprises in the real prod response headers, since that's the one way this could pass locally and fail in prod.
