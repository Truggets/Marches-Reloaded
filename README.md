# Marches Reload — Character Builder

A private, SRD-legal **D&D 2024 (SRD 5.2)** character builder for my friend group's campaign. Build a character start-to-finish in the browser, level up to 10 (with multiclassing), and save it to a shared home on my own server. Each character gets an 8-bit pixel-art avatar.

**Private use only — not a product.** Game-rules content is drawn exclusively from the System Reference Document 5.2 (CC-BY 4.0). See attribution below.

## Stack

React + TypeScript + Vite + Tailwind (client, incl. rules engine) · Node + Express (thin JSON API) · SQLite · session auth (argon2, no email) · self-hosted on a VPS behind Caddy · DiceBear pixel-art (CC0) avatars · bundled SRD 5.2 dataset (no live API dependency).

## Layout

- `client/` — front-end + rules engine
- `server/` — auth + character storage API
- `data/` — bundled SRD 5.2 dataset + build scripts
- `docs/planning/` — project spec, tech decisions, and planning docs

## Setup (once scaffolded)

```
cp .env.example .env    # then fill in secrets on the server
# npm install in client/ and server/ (added at M0)
```

## Status

🟡 Planning complete (Trugg Plan). Build starts at milestone **M0**. See `docs/planning/PROJECT_SPEC.md`.

## Attribution

This work includes material from the System Reference Document 5.2 ("SRD 5.2") by Wizards of the Coast LLC, available under the Creative Commons Attribution 4.0 International License (https://creativecommons.org/licenses/by/4.0/legalcode).
