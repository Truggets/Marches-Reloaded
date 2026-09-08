// Marches Reloaded — /api/packs: read-only access to admin-imported content
// packs (M2b). Any authenticated user can read (they need this to build a
// character with imported content), but only an admin can write — that's
// POST /api/admin/packs/import (server/src/routes/admin.js).

import express from "express";
import db from "../db/index.js";
import { requireAuth } from "../middleware/auth.js";

const router = express.Router();

router.use(requireAuth);

router.get("/", (req, res) => {
  const rows = db.prepare("SELECT pack_id, manifest, content FROM pack_content").all();
  const packs = rows.map((row) => ({
    packId: row.pack_id,
    manifest: JSON.parse(row.manifest),
    content: JSON.parse(row.content),
  }));
  return res.status(200).json({ packs });
});

export default router;
