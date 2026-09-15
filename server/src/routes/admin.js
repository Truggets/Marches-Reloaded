// Marches Reloaded — /api/admin routes: user list, password reset, invites.
// All routes here require an authenticated admin session.

import crypto from "node:crypto";
import express from "express";
import argon2 from "argon2";
import db from "../db/index.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { parseFeatsImport } from "../../../data/build/parse-feats-import.js";
import { parseBackgroundsImport } from "../../../data/build/parse-backgrounds-import.js";
import { parseSpeciesImport } from "../../../data/build/parse-species-import.js";
import { parseEquipmentImport } from "../../../data/build/parse-equipment-import.js";
import { parseSpellsImport } from "../../../data/build/parse-spells-import.js";
import { parseSubclassesImport } from "../../../data/build/parse-subclasses-import.js";

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

// M2b: import an additional content pack (feats, backgrounds, species,
// equipment, spells, and/or subclasses; at least one required). The pack is
// stored in pack_content (shared/data/marches.sqlite), never in the shipped
// data/ directory — see CLAUDE.md's SRD-only bundling rule and
// docs/planning/m2b-execution-plan.md / m2b-phase2-backgrounds-plan.md /
// m2b-phase3-4-species-equipment-plan.md / issue-33-plan.md /
// issue-22-and-subclass-import-plan.md. Body shape: { packId, packName,
// feats?, backgrounds?, species?, equipment?, spells?, subclasses? } (each
// the vault-shaped top-level object for that content type, e.g.
// {feats: [...]} / {subclasses: [...]}). Runs each provided field through
// the same parser/validator used by its build-time CLI
// (parse-feats-import.js / parse-backgrounds-import.js /
// parse-species-import.js / parse-equipment-import.js /
// parse-spells-import.js / parse-subclasses-import.js) — reject the whole
// pack, name the offending entry, per the plan's "validation moves to the
// import boundary" decision. #33: each expansion-book spell file is its own
// pack (a distinct packId per import call), not merged into a shared pack —
// this endpoint itself doesn't need to know that; it's a caller convention.
// Subclasses stay a distinct case even so: unlike every other content type
// here, `subclasses` isn't a top-level ContentPack category — it's merged
// into the right bundled class's `subclasses[]` at READ time
// (data/index.ts's getClass()), not nested at import time, since
// classes.json itself isn't importable.
// Not wrapped in an explicit DB transaction: the SELECT-then-INSERT below
// isn't atomic across statements in general, but better-sqlite3 is
// synchronous and this is a single-process deployment, so no other request
// can interleave in that window (see M2b Phase 2 review).
router.post("/packs/import", (req, res) => {
  const { packId, packName, feats, backgrounds, species, equipment, spells, subclasses } = req.body || {};

  if (typeof packId !== "string" || !packId.trim()) {
    return res.status(400).json({ error: "packId is required" });
  }
  if (typeof packName !== "string" || !packName.trim()) {
    return res.status(400).json({ error: "packName is required" });
  }
  if (
    feats === undefined &&
    backgrounds === undefined &&
    species === undefined &&
    equipment === undefined &&
    spells === undefined &&
    subclasses === undefined
  ) {
    return res
      .status(400)
      .json({ error: "At least one of feats, backgrounds, species, equipment, spells, or subclasses is required" });
  }

  let parsedFeats;
  if (feats !== undefined) {
    try {
      parsedFeats = parseFeatsImport(feats, packId);
    } catch (err) {
      return res.status(400).json({ error: `Import rejected: ${err.message}` });
    }
  }

  let parsedBackgrounds;
  if (backgrounds !== undefined) {
    try {
      parsedBackgrounds = parseBackgroundsImport(backgrounds, packId);
    } catch (err) {
      return res.status(400).json({ error: `Import rejected: ${err.message}` });
    }
  }

  let parsedSpecies;
  if (species !== undefined) {
    try {
      parsedSpecies = parseSpeciesImport(species, packId);
    } catch (err) {
      return res.status(400).json({ error: `Import rejected: ${err.message}` });
    }
  }

  let parsedEquipment;
  if (equipment !== undefined) {
    try {
      parsedEquipment = parseEquipmentImport(equipment, packId);
    } catch (err) {
      return res.status(400).json({ error: `Import rejected: ${err.message}` });
    }
  }

  let parsedSpells;
  if (spells !== undefined) {
    try {
      parsedSpells = parseSpellsImport(spells, packId);
    } catch (err) {
      return res.status(400).json({ error: `Import rejected: ${err.message}` });
    }
  }

  let parsedSubclasses;
  if (subclasses !== undefined) {
    try {
      parsedSubclasses = parseSubclassesImport(subclasses, packId);
    } catch (err) {
      return res.status(400).json({ error: `Import rejected: ${err.message}` });
    }
  }

  // Merge with whatever's already stored for this pack_id so importing one
  // field (e.g. backgrounds) doesn't wipe out a previously-imported other
  // field (e.g. feats) — see CLAUDE.md / M2b Phase 2 plan on pack_content
  // being a single JSON blob per pack_id.
  const existingRow = db.prepare("SELECT content FROM pack_content WHERE pack_id = ?").get(packId);
  const existingContent = existingRow ? JSON.parse(existingRow.content) : {};

  const mergedContent = {};
  const finalFeats = parsedFeats !== undefined ? parsedFeats : existingContent.feats;
  const finalBackgrounds = parsedBackgrounds !== undefined ? parsedBackgrounds : existingContent.backgrounds;
  const finalSpecies = parsedSpecies !== undefined ? parsedSpecies : existingContent.species;
  const finalEquipment = parsedEquipment !== undefined ? parsedEquipment : existingContent.equipment;
  const finalSpells = parsedSpells !== undefined ? parsedSpells : existingContent.spells;
  const finalSubclasses = parsedSubclasses !== undefined ? parsedSubclasses : existingContent.subclasses;
  if (finalFeats !== undefined) mergedContent.feats = finalFeats;
  if (finalBackgrounds !== undefined) mergedContent.backgrounds = finalBackgrounds;
  if (finalSpecies !== undefined) mergedContent.species = finalSpecies;
  if (finalEquipment !== undefined) mergedContent.equipment = finalEquipment;
  if (finalSpells !== undefined) mergedContent.spells = finalSpells;
  if (finalSubclasses !== undefined) mergedContent.subclasses = finalSubclasses;

  const manifest = JSON.stringify({ id: packId, name: packName, importedAt: new Date().toISOString() });
  const content = JSON.stringify(mergedContent);

  db.prepare(
    `INSERT INTO pack_content (pack_id, manifest, content, imported_by_user_id, created_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(pack_id) DO UPDATE SET manifest = excluded.manifest, content = excluded.content,
       imported_by_user_id = excluded.imported_by_user_id, created_at = excluded.created_at`
  ).run(packId, manifest, content, req.session.userId, new Date().toISOString());

  const response = { ok: true, packId };
  if (parsedFeats !== undefined) response.featCount = parsedFeats.length;
  if (parsedBackgrounds !== undefined) response.backgroundCount = parsedBackgrounds.length;
  if (parsedSpecies !== undefined) response.speciesCount = parsedSpecies.length;
  if (parsedEquipment !== undefined) response.equipmentCount = parsedEquipment.length;
  if (parsedSpells !== undefined) response.spellCount = parsedSpells.length;
  if (parsedSubclasses !== undefined) response.subclassCount = parsedSubclasses.length;

  return res.status(200).json(response);
});

export default router;
