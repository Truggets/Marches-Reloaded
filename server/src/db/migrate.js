// Marches Reload — schema migration + first-run bootstrap.
//
// Idempotent: safe to run on every deploy. Creates the three M1 tables if
// they don't exist yet, then:
//   - seeds the admin account from ADMIN_USERNAME/ADMIN_PASSWORD env vars,
//     but only if no admin (is_admin=1) user exists yet.
//   - seeds an invite row from INVITE_CODE env var, but only if that exact
//     code isn't already present (invites.code is UNIQUE).
//
// Run directly: `node src/db/migrate.js` (or via config's dotenv-from-shared
// loading, so it also works run from the deployed `current/` symlink).

import argon2 from "argon2";
import db from "./index.js";
import { adminUsername, adminPassword, inviteCode } from "../config.js";

function createTables() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      is_admin INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      sid TEXT PRIMARY KEY,
      sess TEXT NOT NULL,
      expires_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS invites (
      id INTEGER PRIMARY KEY,
      code TEXT UNIQUE NOT NULL,
      created_at TEXT NOT NULL,
      used_by_user_id INTEGER NULL REFERENCES users(id),
      used_at TEXT NULL
    );
  `);
  console.log("[migrate] tables ensured: users, sessions, invites");
}

async function seedAdmin() {
  const username = adminUsername();
  const password = adminPassword();

  if (!username || !password) {
    console.log("[migrate] ADMIN_USERNAME/ADMIN_PASSWORD not set — skipping admin bootstrap");
    return;
  }

  const existingAdmin = db.prepare("SELECT id FROM users WHERE is_admin = 1 LIMIT 1").get();
  if (existingAdmin) {
    console.log("[migrate] an admin user already exists — skipping admin bootstrap");
    return;
  }

  const passwordHash = await argon2.hash(password);
  const insert = db.prepare(
    "INSERT INTO users (username, password_hash, is_admin, created_at) VALUES (?, ?, 1, ?)"
  );
  try {
    insert.run(username, passwordHash, new Date().toISOString());
    console.log(`[migrate] seeded admin user "${username}"`);
  } catch (err) {
    if (err.code === "SQLITE_CONSTRAINT_UNIQUE" || err.code === "SQLITE_CONSTRAINT") {
      console.log(
        `[migrate] a user named "${username}" already exists (not an admin) — skipping admin bootstrap to avoid clobbering it`
      );
      return;
    }
    throw err;
  }
}

function seedInvite() {
  let code;
  try {
    code = inviteCode();
  } catch {
    console.log("[migrate] INVITE_CODE not set — skipping invite seed");
    return;
  }

  const existing = db.prepare("SELECT id FROM invites WHERE code = ?").get(code);
  if (existing) {
    console.log("[migrate] invite code already present — skipping invite seed");
    return;
  }

  db.prepare("INSERT INTO invites (code, created_at) VALUES (?, ?)").run(
    code,
    new Date().toISOString()
  );
  console.log("[migrate] seeded invite code from INVITE_CODE env var");
}

export async function migrate() {
  createTables();
  await seedAdmin();
  seedInvite();
  console.log("[migrate] done");
}

// Allow running directly: `node src/db/migrate.js`
const isMain = process.argv[1] && process.argv[1].endsWith("migrate.js");
if (isMain) {
  migrate()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("[migrate] failed:", err);
      process.exit(1);
    });
}
