// Marches Reloaded — /api/characters routes: per-user character CRUD.
//
// Server does NOT validate game-rules correctness inside `data` — the rules
// engine is strictly client-side (see ../../CLAUDE.md). Server-side we only
// validate that `data` is JSON-parseable and `name` is a non-empty string.
// `pack_id` is stamped from the bundled SRD dataset's manifest so it can
// never drift from M2's actual pack (never hardcoded as a literal here).

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import db from "../db/index.js";
import { requireAuth } from "../middleware/auth.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// server/src/routes/characters.js -> ../../../data/manifest.json (app/data/manifest.json)
const manifestPath = path.join(__dirname, "..", "..", "..", "data", "manifest.json");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const packId = manifest.id;

const router = express.Router();

router.use(requireAuth);

function toPublicCharacter(row) {
  return {
    id: row.id,
    ownerId: row.owner_id,
    name: row.name,
    packId: row.pack_id,
    data: JSON.parse(row.data),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function canAccess(req, character) {
  return character.owner_id === req.session.userId || req.session.role === "admin";
}

router.post("/", (req, res) => {
  const { name, data } = req.body || {};

  if (typeof name !== "string" || !name.trim()) {
    return res.status(400).json({ error: "name is required" });
  }
  if (data === undefined || data === null || typeof data !== "object") {
    return res.status(400).json({ error: "data is required and must be an object" });
  }

  let dataJson;
  try {
    dataJson = JSON.stringify(data);
    JSON.parse(dataJson); // confirm it round-trips as valid JSON
  } catch {
    return res.status(400).json({ error: "data must be JSON-serializable" });
  }

  const now = new Date().toISOString();
  const info = db
    .prepare(
      `INSERT INTO characters (owner_id, name, pack_id, data, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(req.session.userId, name, packId, dataJson, now, now);

  const character = db.prepare("SELECT * FROM characters WHERE id = ?").get(info.lastInsertRowid);
  return res.status(201).json({ character: toPublicCharacter(character) });
});

router.get("/", (req, res) => {
  const rows = db
    .prepare("SELECT * FROM characters WHERE owner_id = ? ORDER BY id")
    .all(req.session.userId);
  return res.status(200).json({ characters: rows.map(toPublicCharacter) });
});

router.get("/:id", (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    return res.status(404).json({ error: "Character not found" });
  }

  const character = db.prepare("SELECT * FROM characters WHERE id = ?").get(id);
  if (!character) {
    return res.status(404).json({ error: "Character not found" });
  }
  if (!canAccess(req, character)) {
    return res.status(403).json({ error: "Forbidden" });
  }

  return res.status(200).json({ character: toPublicCharacter(character) });
});

router.put("/:id", (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    return res.status(404).json({ error: "Character not found" });
  }

  const character = db.prepare("SELECT * FROM characters WHERE id = ?").get(id);
  if (!character) {
    return res.status(404).json({ error: "Character not found" });
  }
  if (!canAccess(req, character)) {
    return res.status(403).json({ error: "Forbidden" });
  }

  const { name, data } = req.body || {};
  if (typeof name !== "string" || !name.trim()) {
    return res.status(400).json({ error: "name is required" });
  }
  if (data === undefined || data === null || typeof data !== "object") {
    return res.status(400).json({ error: "data is required and must be an object" });
  }

  let dataJson;
  try {
    dataJson = JSON.stringify(data);
    JSON.parse(dataJson);
  } catch {
    return res.status(400).json({ error: "data must be JSON-serializable" });
  }

  const now = new Date().toISOString();
  db.prepare("UPDATE characters SET name = ?, data = ?, updated_at = ? WHERE id = ?").run(
    name,
    dataJson,
    now,
    id
  );

  const updated = db.prepare("SELECT * FROM characters WHERE id = ?").get(id);
  return res.status(200).json({ character: toPublicCharacter(updated) });
});

router.delete("/:id", (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    return res.status(404).json({ error: "Character not found" });
  }

  const character = db.prepare("SELECT * FROM characters WHERE id = ?").get(id);
  if (!character) {
    return res.status(404).json({ error: "Character not found" });
  }
  if (!canAccess(req, character)) {
    return res.status(403).json({ error: "Forbidden" });
  }

  db.prepare("DELETE FROM characters WHERE id = ?").run(id);
  return res.status(204).end();
});

export default router;
