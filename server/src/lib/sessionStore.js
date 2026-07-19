// Marches Reloaded — SQLite-backed express-session store.
//
// Hand-rolled, not connect-sqlite3, per the M1 execution plan (adapted from
// the sibling therink-dashboard app's real session store). better-sqlite3 is
// synchronous, so get/set/destroy/touch all resolve immediately via
// process.nextTick-free callback invocation — no async DB driver overhead.
// Rows carry their own expires_at (epoch ms) and the store self-prunes
// expired rows opportunistically.

import session from "express-session";
import db from "../db/index.js";

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export default class SqliteSessionStore extends session.Store {
  constructor() {
    super();
    this.getStmt = db.prepare("SELECT sess, expires_at FROM sessions WHERE sid = ?");
    this.upsertStmt = db.prepare(`
      INSERT INTO sessions (sid, sess, expires_at) VALUES (?, ?, ?)
      ON CONFLICT(sid) DO UPDATE SET sess = excluded.sess, expires_at = excluded.expires_at
    `);
    this.destroyStmt = db.prepare("DELETE FROM sessions WHERE sid = ?");
    this.pruneStmt = db.prepare("DELETE FROM sessions WHERE expires_at < ?");
    this.allStmt = db.prepare("SELECT sid, sess FROM sessions WHERE expires_at >= ?");
  }

  _expiresAt(sess) {
    if (sess?.cookie?.expires) {
      return new Date(sess.cookie.expires).getTime();
    }
    return Date.now() + SEVEN_DAYS_MS;
  }

  get(sid, callback) {
    try {
      this.pruneStmt.run(Date.now());
      const row = this.getStmt.get(sid);
      if (!row) return callback(null, null);
      if (row.expires_at < Date.now()) {
        this.destroyStmt.run(sid);
        return callback(null, null);
      }
      return callback(null, JSON.parse(row.sess));
    } catch (err) {
      return callback(err);
    }
  }

  set(sid, sess, callback) {
    try {
      const expiresAt = this._expiresAt(sess);
      this.upsertStmt.run(sid, JSON.stringify(sess), expiresAt);
      return callback ? callback(null) : undefined;
    } catch (err) {
      return callback ? callback(err) : undefined;
    }
  }

  destroy(sid, callback) {
    try {
      this.destroyStmt.run(sid);
      return callback ? callback(null) : undefined;
    } catch (err) {
      return callback ? callback(err) : undefined;
    }
  }

  touch(sid, sess, callback) {
    try {
      const row = this.getStmt.get(sid);
      if (!row) return callback ? callback(null) : undefined;
      const expiresAt = this._expiresAt(sess);
      this.upsertStmt.run(sid, JSON.stringify(sess), expiresAt);
      return callback ? callback(null) : undefined;
    } catch (err) {
      return callback ? callback(err) : undefined;
    }
  }

  all(callback) {
    try {
      const rows = this.allStmt.all(Date.now());
      const sessions = {};
      for (const row of rows) sessions[row.sid] = JSON.parse(row.sess);
      return callback(null, sessions);
    } catch (err) {
      return callback(err);
    }
  }
}
