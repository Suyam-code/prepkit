import { RequestHandler } from "express";

/**
 * Blocks any protected route for a signed-out visitor, and handles an
 * expired/invalid session as a clean 401 rather than a crash — the
 * session middleware clears req.session.userId automatically once the
 * store-backed session expires, so this check alone covers both cases.
 */
export const requireAuth: RequestHandler = (req, res, next) => {
  if (!req.session?.userId) {
    return res.status(401).json({ error: { code: "NOT_AUTHENTICATED", message: "Sign in required." } });
  }
  next();
};
