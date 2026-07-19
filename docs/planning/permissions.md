# Permissions — Marches Reloaded

*Trugg Plan · Phase 6 · 2026-07-18*

Lives at `app/.claude/settings.json`. Three tiers, tailored to the Phase 4 stack (npm/Vite/React/TS client, Node/Express server, SQLite, VPS git-deploy).

## Allow (routine + safe — never interrupt)
- File ops: Read, Edit, Write, Grep, Glob.
- Build/test/run: `npm install`/`ci`, `npm run build`/`dev`/`test`, the `--prefix client` and `--prefix server` variants, `npx vite`, `npx tsc`, `node …`, and the SRD dataset builder `node data/build-srd.js`.
- Read-only + staging git: `status`, `diff`, `log`, `branch`, `show`, `add`, `remote -v`.

## Ask (legitimate but hard to undo — pause for a yes)
- History/branch changes: `git commit`, `push`, `checkout`, `reset`, `rebase`, `merge`.
- **Production actions:** `./deploy.sh`, `./rollback.sh`, and DB migrations (`npm run migrate`, any `node …migrate…`). This encodes your standing rule — **push, deploy, and migrate each need a separate, explicit in-the-moment go-ahead**, never inferred from one another.

## Deny (should never happen via an agent)
- Secrets: `Read(./.env)`, `Read(./.env.*)`, `Read(./server/.env)` — secrets are env-vars only, never read into context.
- Live DB files: `Read(./data/*.sqlite)` — don't slurp player data into context.
- Destructive/irreversible: `git push --force` / `-f`, `rm -rf`.
- Arbitrary network: `curl`, `wget` — blocked so nothing exfiltrates or pulls untrusted code; if the build ever needs a specific fetch, allow that exact command rather than blanket-allowing.

## Notes
- Only the shared `settings.json` is managed here. If you ever add a personal `settings.local.json`, this workflow leaves it alone.
- `node *` is broadly allowed for dev convenience; the risky node paths (migrations) are explicitly bumped up to **ask**, and secret/DB reads are denied, so the broad allow stays safe.
