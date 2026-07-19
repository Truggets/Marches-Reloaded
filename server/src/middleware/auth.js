// Marches Reload — auth middleware.
//
// Adapted from the sibling therink-dashboard app's requireAuth/requireRole,
// but this is a JSON API (not server-rendered): on failure we return JSON
// 401/403, never redirect or render a view.

const ABSOLUTE_SESSION_MAX_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export function requireAuth(req, res, next) {
  if (req.session?.authenticated && req.session.userId) {
    const age = Date.now() - (req.session.createdAt || 0);
    if (age > ABSOLUTE_SESSION_MAX_MS) {
      return req.session.destroy(() => res.status(401).json({ error: "Session expired" }));
    }
    return next();
  }
  return res.status(401).json({ error: "Not authenticated" });
}

export function requireRole(role) {
  return (req, res, next) => {
    if (req.session?.authenticated && req.session.role === role) return next();
    return res.status(403).json({ error: "Forbidden" });
  };
}
