// Marches Reload — API server entrypoint.
//
// M0 (skeleton + deploy): a bare Express app with one health-check route.
// No auth, no character CRUD, no game-rules logic here (and never will be —
// rules logic is strictly client-side per PROJECT_SPEC.md). Auth and
// character CRUD land in later milestones (M1+).
//
// Secrets policy: this file never hardcodes secrets. Config comes only from
// process.env, populated from `.env` (see the repo-root `.env.example`),
// which is gitignored and never committed.

import express from "express";

const app = express();

const PORT = process.env.PORT || 3001;

app.get("/api/health", (req, res) => {
  res.status(200).json({ status: "ok" });
});

app.listen(PORT, () => {
  console.log(`Marches Reload API listening on port ${PORT}`);
});
