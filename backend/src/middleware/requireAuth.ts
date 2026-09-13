import { RequestHandler } from "express";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.SESSION_SECRET || "dev-secret-change-me";

/**
 * Stateless JWT bearer auth — replaces cookie-based sessions.
 *
 * Sessions were dropped because the frontend (Vercel) and backend
 * (Render) live on different top-level domains. Cross-site cookies for
 * that setup are increasingly blocked by browsers by default (Chrome in
 * Incognito, Safari and Firefox generally) regardless of SameSite/Secure
 * configuration — so a cookie-based session silently breaks for a real
 * share of users. A bearer token sent explicitly in the Authorization
 * header has no such restriction, since it isn't a cookie at all.
 */
export const requireAuth: RequestHandler = (req, res, next) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: { code: "NOT_AUTHENTICATED", message: "Sign in required." } });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET) as { userId: string };
    req.userId = payload.userId;
    next();
  } catch {
    return res.status(401).json({ error: { code: "NOT_AUTHENTICATED", message: "Sign in required." } });
  }
};

export function signToken(userId: string): string {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: "7d" });
}
