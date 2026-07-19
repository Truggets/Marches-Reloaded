// Marches Reload — /api/auth routes: register, login, logout, me.

import express from "express";
import argon2 from "argon2";
import db from "../db/index.js";
import { requireAuth } from "../middleware/auth.js";

const router = express.Router();

function toPublicUser(row) {
  return { id: row.id, username: row.username, isAdmin: !!row.is_admin };
}

function establishSession(req, user) {
  req.session.authenticated = true;
  req.session.userId = user.id;
  req.session.role = user.is_admin ? "admin" : "user";
  req.session.createdAt = Date.now();
}

router.post("/register", async (req, res, next) => {
  try {
    const { username, password, inviteCode } = req.body || {};

    if (
      typeof username !== "string" ||
      typeof password !== "string" ||
      typeof inviteCode !== "string" ||
      !username.trim() ||
      !password ||
      !inviteCode
    ) {
      return res.status(400).json({ error: "username, password, and inviteCode are required" });
    }

    const invite = db
      .prepare("SELECT id, used_by_user_id FROM invites WHERE code = ?")
      .get(inviteCode);
    if (!invite || invite.used_by_user_id) {
      return res.status(400).json({ error: "Invalid or already-used invite code" });
    }

    const existing = db.prepare("SELECT id FROM users WHERE username = ?").get(username);
    if (existing) {
      return res.status(409).json({ error: "Username is already taken" });
    }

    const passwordHash = await argon2.hash(password);
    const createdAt = new Date().toISOString();

    const createUserAndConsumeInvite = db.transaction(() => {
      const info = db
        .prepare(
          "INSERT INTO users (username, password_hash, is_admin, created_at) VALUES (?, ?, 0, ?)"
        )
        .run(username, passwordHash, createdAt);
      const userId = info.lastInsertRowid;

      // Guard against a race where the invite got consumed between the
      // read above and this write — only succeeds if still unused.
      const result = db
        .prepare(
          "UPDATE invites SET used_by_user_id = ?, used_at = ? WHERE id = ? AND used_by_user_id IS NULL"
        )
        .run(userId, createdAt, invite.id);

      if (result.changes === 0) {
        throw new Error("INVITE_ALREADY_USED");
      }

      return db.prepare("SELECT id, username, is_admin FROM users WHERE id = ?").get(userId);
    });

    let user;
    try {
      user = createUserAndConsumeInvite();
    } catch (err) {
      if (err.message === "INVITE_ALREADY_USED") {
        return res.status(400).json({ error: "Invalid or already-used invite code" });
      }
      throw err;
    }

    establishSession(req, user);
    return res.status(201).json({ user: toPublicUser(user) });
  } catch (err) {
    return next(err);
  }
});

router.post("/login", async (req, res, next) => {
  try {
    const { username, password } = req.body || {};
    if (typeof username !== "string" || typeof password !== "string" || !username || !password) {
      return res.status(401).json({ error: "Invalid username or password" });
    }

    const user = db.prepare("SELECT * FROM users WHERE username = ?").get(username);
    if (!user) {
      return res.status(401).json({ error: "Invalid username or password" });
    }

    const valid = await argon2.verify(user.password_hash, password);
    if (!valid) {
      return res.status(401).json({ error: "Invalid username or password" });
    }

    establishSession(req, user);
    return res.status(200).json({ user: toPublicUser(user) });
  } catch (err) {
    return next(err);
  }
});

router.post("/logout", (req, res, next) => {
  if (!req.session) return res.status(204).end();
  req.session.destroy((err) => {
    if (err) return next(err);
    res.clearCookie("connect.sid");
    return res.status(204).end();
  });
});

router.post("/change-password", requireAuth, async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body || {};
    if (
      typeof currentPassword !== "string" ||
      typeof newPassword !== "string" ||
      !currentPassword ||
      !newPassword
    ) {
      return res.status(400).json({ error: "currentPassword and newPassword are required" });
    }

    const user = db.prepare("SELECT * FROM users WHERE id = ?").get(req.session.userId);
    if (!user) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const valid = await argon2.verify(user.password_hash, currentPassword);
    if (!valid) {
      return res.status(401).json({ error: "Current password is incorrect" });
    }

    const passwordHash = await argon2.hash(newPassword);
    db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(passwordHash, user.id);

    return res.status(200).json({ ok: true });
  } catch (err) {
    return next(err);
  }
});

router.get("/me", (req, res) => {
  if (!req.session?.authenticated || !req.session.userId) {
    return res.status(401).json({ error: "Not authenticated" });
  }
  const user = db
    .prepare("SELECT id, username, is_admin FROM users WHERE id = ?")
    .get(req.session.userId);
  if (!user) {
    return res.status(401).json({ error: "Not authenticated" });
  }
  return res.status(200).json({ user: toPublicUser(user) });
});

export default router;
