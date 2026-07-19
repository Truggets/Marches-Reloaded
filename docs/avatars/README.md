# Avatars (M7)

## Overview
Every character gets a deterministic 8-bit pixel-art avatar, shown on the character list and the character sheet header.

## Architecture
- Generated entirely client-side via [DiceBear](https://www.dicebear.com) "Pixel Art" style (`@dicebear/core` + `@dicebear/pixel-art`, CC0 1.0) — no network call, no ongoing cost, no rate limit.
- Seeded by the character's stable numeric `id` (the SQLite primary key) — no new stored field, no migration. Same character always renders the same avatar.
- `client/src/avatar.ts` — pure `avatarDataUri(seed: string): string` function, unit-tested (`avatar.test.ts`) for determinism and distinctness.
- `client/src/CharacterAvatar.tsx` — the React component (`useMemo`-wrapped, since `toDataUri()` is synchronous), styled with the existing `.pixel-frame` convention shared with `WilburCompanion`.

## Status
Built 2026 — see `docs/planning/PROJECT_SPEC.md` M7 row for verification evidence.
