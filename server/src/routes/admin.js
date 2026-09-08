// Marches Reloaded — /api/admin routes: user list, password reset, invites.
// All routes here require an authenticated admin session.

import crypto from "node:crypto";
import express from "express";
import argon2 from "argon2";
import db from "../db/index.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { parseFeatsImport } from "../../../data/build/parse-feats-import.js";

const router = express.Router();

router.use(requireAuth, requireRole("admin"));

router.get("/users", (req, res) => {
  const rows = db
    .prepare("SELECT id, username, is_admin, created_at FROM users ORDER BY id")
    .all();
  const users = rows.map((row) => ({
    id: row.id,
    username: row.username,
    isAdmin: !!row.is_admin,
    createdAt: row.created_at,
  }));
  return res.status(200).json({ users });
});

router.post("/users/:id/reset-password", async (req, res, next) => {
  try {
    const userId = Number(req.params.id);
    const { newPassword } = req.body || {};

    if (!Number.isInteger(userId)) {
      return res.status(400).json({ error: "Invalid user id" });
    }
    if (typeof newPassword !== "string" || newPassword.length < 1) {
      return res.status(400).json({ error: "newPassword is required" });
    }

    const user = db.prepare("SELECT id FROM users WHERE id = ?").get(userId);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const passwordHash = await argon2.hash(newPassword);
    db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(passwordHash, userId);

    return res.status(200).json({ ok: true });
  } catch (err) {
    return next(err);
  }
});

router.get("/invites", (req, res) => {
  const rows = db
    .prepare(
      `SELECT invites.code, invites.created_at, invites.used_at, users.username AS used_by_username
       FROM invites LEFT JOIN users ON users.id = invites.used_by_user_id
       ORDER BY invites.id DESC`
    )
    .all();
  const invites = rows.map((row) => ({
    code: row.code,
    createdAt: row.created_at,
    usedAt: row.used_at,
    usedByUsername: row.used_by_username,
  }));
  return res.status(200).json({ invites });
});

router.post("/invites", (req, res) => {
  const code = crypto.randomBytes(6).toString("base64url");
  db.prepare("INSERT INTO invites (code, created_at) VALUES (?, ?)").run(
    code,
    new Date().toISOString()
  );
  return res.status(201).json({ code });
});

// M8 party view: every character across every account, read-only. DM does
// not edit/delete others' characters here — that's out of scope.
router.get("/characters", (req, res) => {
  const rows = db
    .prepare(
      `SELECT characters.*, users.username AS owner_username
       FROM characters JOIN users ON users.id = characters.owner_id
       ORDER BY users.username, characters.id`
    )
    .all();
  const characters = rows.map((row) => ({
    id: row.id,
    ownerId: row.owner_id,
    ownerUsername: row.owner_username,
    name: row.name,
    packId: row.pack_id,
    data: JSON.parse(row.data),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
  return res.status(200).json({ characters });
});

// M2b: import an additional content pack (currently: feats only, Phase 1).
// The pack is stored in pack_content (shared/data/marches.sqlite), never in
// the shipped data/ directory — see CLAUDE.md's SRD-only bundling rule and
// docs/planning/m2b-execution-plan.md. Body shape: { packId, packName,
// feats: <vault-shaped feats JSON's top-level object, i.e. {feats: [...]}> }.
// Runs the entries through the exact same parser/validator used by the
// build-time CLI (parse-feats-import.js) — reject the whole pack, name the
// offending entry, per the plan's "validation moves to the import boundary"
// decision. Not wrapped in a DB transaction here: a single INSERT/REPLACE
// is already atomic in SQLite.
router.post("/packs/import", (req, res) => {
  const { packId, packName, feats } = req.body || {};

  if (typeof packId !== "string" || !packId.trim()) {
    return res.status(400).json({ error: "packId is required" });
  }
  if (typeof packName !== "string" || !packName.trim()) {
    return res.status(400).json({ error: "packName is required" });
  }

  let parsedFeats;
  try {
    parsedFeats = parseFeatsImport(feats, packId);
  } catch (err) {
    return res.status(400).json({ error: `Import rejected: ${err.message}` });
  }

  const manifest = JSON.stringify({ id: packId, name: packName, importedAt: new Date().toISOString() });
  const content = JSON.stringify({ feats: parsedFeats });

  db.prepare(
    `INSERT INTO pack_content (pack_id, manifest, content, imported_by_user_id, created_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(pack_id) DO UPDATE SET manifest = excluded.manifest, content = excluded.content,
       imported_by_user_id = excluded.imported_by_user_id, created_at = excluded.created_at`
  ).run(packId, manifest, content, req.session.userId, new Date().toISOString());

  return res.status(200).json({ ok: true, packId, featCount: parsedFeats.length });
});

export default router;
