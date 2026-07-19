// Marches Reload — /api/admin routes: user list, password reset, invites.
// All routes here require an authenticated admin session.

import crypto from "node:crypto";
import express from "express";
import argon2 from "argon2";
import db from "../db/index.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

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

export default router;
