// Marches Reloaded — SQLite connection.
//
// Opens the single `better-sqlite3` connection used by the whole server.
// The DB file lives under `shared/data/` (see config.js for why) — that
// directory may not exist yet on a fresh deploy, so we create it before
// opening.

import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { dbPath } from "../config.js";

fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const db = new Database(dbPath);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

export default db;
