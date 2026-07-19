// Marches Reloaded — API server entrypoint.
//
// M0 (skeleton + deploy): a bare Express app with one health-check route.
// M1 (accounts & login): adds session-cookie auth (invite-gated register,
// login/logout, /me) and admin user management. No game-rules logic here
// (and never will be — rules logic is strictly client-side per
// PROJECT_SPEC.md). Character CRUD lands in a later milestone.
//
// Secrets policy: this file never hardcodes secrets. Config comes only from
// process.env, populated from `shared/.env` (see config.js and the
// repo-root `.env.example`), which is gitignored and never committed.

import express from "express";
import session from "express-session";
import { port, nodeEnv, sessionSecret } from "./config.js";
import SqliteSessionStore from "./lib/sessionStore.js";
import authRouter from "./routes/auth.js";
import adminRouter from "./routes/admin.js";
import charactersRouter from "./routes/characters.js";

const app = express();

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

app.set("trust proxy", 1);
app.use(express.json());

app.use(
  session({
    store: new SqliteSessionStore(),
    secret: sessionSecret(),
    name: "connect.sid",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: nodeEnv === "production",
      maxAge: SEVEN_DAYS_MS,
    },
  })
);

app.get("/api/health", (req, res) => {
  res.status(200).json({ status: "ok" });
});

app.use("/api/auth", authRouter);
app.use("/api/admin", adminRouter);
app.use("/api/characters", charactersRouter);

// Central JSON error handler — keep stack traces out of responses.
app.use((err, req, res, next) => {
  console.error(err);
  if (res.headersSent) return next(err);
  res.status(500).json({ error: "Internal server error" });
});

app.listen(port, () => {
  console.log(`Marches Reloaded API listening on port ${port}`);
});
