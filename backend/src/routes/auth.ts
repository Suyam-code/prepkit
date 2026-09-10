import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { User } from "../models/User";

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

    req.session.userId = user.id;
    res.status(201).json({ id: user.id, email: user.email });
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

    req.session.userId = user.id;
    res.json({ id: user.id, email: user.email });
  } catch (err) {
    next(err);
  }
});

authRouter.post("/logout", (req, res, next) => {
  req.session.destroy((err) => {
    if (err) return next(err);
    res.clearCookie("connect.sid");
    res.status(204).end();
  });
});

authRouter.get("/me", (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: { code: "NOT_AUTHENTICATED", message: "Not logged in." } });
  }
  res.json({ id: req.session.userId });
});
