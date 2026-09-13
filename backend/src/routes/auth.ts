import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { User } from "../models/User";
import { requireAuth, signToken } from "../middleware/requireAuth";

export const authRouter = Router();

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

authRouter.post("/register", async (req, res, next) => {
  try {
    const { email, password } = credentialsSchema.parse(req.body);

    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(409).json({ error: { code: "EMAIL_TAKEN", message: "Email already registered." } });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create({ email, passwordHash });

    res.status(201).json({ id: user.id, email: user.email, token: signToken(user.id) });
  } catch (err) {
    next(err);
  }
});

authRouter.post("/login", async (req, res, next) => {
  try {
    const { email, password } = credentialsSchema.parse(req.body);

    const user = await User.findOne({ email });
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      // Same error for "no such user" and "wrong password" — don't leak which.
      return res.status(401).json({ error: { code: "INVALID_CREDENTIALS", message: "Invalid email or password." } });
    }

    res.json({ id: user.id, email: user.email, token: signToken(user.id) });
  } catch (err) {
    next(err);
  }
});

// Stateless tokens can't be server-side invalidated without a revocation
// list, which is out of scope here — logout is purely a client-side
// action (discard the stored token). This endpoint exists for symmetry
// and so the frontend has something to call.
authRouter.post("/logout", (_req, res) => {
  res.status(204).end();
});

authRouter.get("/me", requireAuth, (req, res) => {
  res.json({ id: req.userId });
});
