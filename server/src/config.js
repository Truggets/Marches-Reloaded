// Marches Reload — server configuration.
//
// Loads secrets from `shared/.env` on the VPS (NOT from a relative `.env` in
// the release dir). This mirrors the sibling therink-dashboard app's real
// `src/config.js`: under the hardened systemd unit
// (`ProtectSystem=strict` + `ReadWritePaths=/opt/marches-reload/shared`),
// only `shared/` is writable/persistent — the `current/` release symlink is
// swapped out on every deploy, so anything living there (including a local
// `.env`) would be lost or unreadable. The DB lives under `shared/data/` for
// the same reason.
//
// appRoot resolution: prefer the explicit APP_ROOT env var (set by the
// systemd unit as `Environment=APP_ROOT=/opt/marches-reload`) rather than
// counting `../` hops from this file's location. Counting hops is fragile
// here specifically because production runs this file through the
// `current -> releases/<timestamp-sha>/` symlink, and Node resolves module
// paths to their *real* (symlink-following) location by default — so the
// hop count differs from what a naive read of the repo layout suggests, and
// differs again between local dev (no releases/ wrapper) and deployed
// releases. An explicit env var sidesteps needing to reason about that.
// Local dev (no APP_ROOT set) falls back to two hops up from
// `server/src/` (i.e. the `app/` checkout root), which is simply wrong in
// production — that's the point, production always sets APP_ROOT.

import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const appRoot = process.env.APP_ROOT || path.join(__dirname, "..", "..");
const sharedDir = path.join(appRoot, "shared");

dotenv.config({ path: path.join(sharedDir, ".env") });

function required(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const port = process.env.PORT || 3001;
export const nodeEnv = process.env.NODE_ENV || "development";

// Absolute path to the SQLite DB file, always under shared/data — never
// configurable via env, to prevent accidentally pointing at a read-only or
// ephemeral path.
export const dbPath = path.join(sharedDir, "data", "marches.sqlite");

// Session signing secret. Throws if unset — the server should not start
// without it (matches the sibling app's `required()` pattern).
export function sessionSecret() {
  return required("SESSION_SECRET");
}

// Invite code required at registration time.
export function inviteCode() {
  return required("INVITE_CODE");
}

// Used only by migrate.js for first-run admin bootstrap. Both may be
// undefined after the first run — the admin account already exists by then.
export function adminUsername() {
  return process.env.ADMIN_USERNAME;
}

export function adminPassword() {
  return process.env.ADMIN_PASSWORD;
}
