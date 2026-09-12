import express from "express";
import cors from "cors";
import session from "express-session";
import MongoStore from "connect-mongo";
import mongoose from "mongoose";

import { authRouter } from "./routes/auth";
import { kitsRouter } from "./routes/kits";
import { runsRouter } from "./routes/runs";
import { errorHandler } from "./middleware/errorHandler";

const PORT = process.env.PORT || 4000;
const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/prepkit";
const SESSION_SECRET = process.env.SESSION_SECRET || "dev-secret-change-me";
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || "http://localhost:3000";
const IS_PRODUCTION = process.env.NODE_ENV === "production";

async function main() {
  await mongoose.connect(MONGODB_URI);
  console.log("Connected to MongoDB");

  const app = express();
  if (IS_PRODUCTION) app.set("trust proxy", 1);
  app.use(cors({ origin: FRONTEND_ORIGIN, credentials: true }));
  app.use(express.json({ limit: "1mb" }));
  app.use(
    session({
      secret: SESSION_SECRET,
      resave: false,
      saveUninitialized: false,
      store: MongoStore.create({ mongoUrl: MONGODB_URI, collectionName: "sessions" }),
      cookie: {
        httpOnly: true,
        // In production, frontend and backend live on different domains
        // (Vercel + Render), so this is a cross-site request from the
        // browser's perspective. SameSite=Lax cookies are NOT sent on
        // cross-site fetch() calls, only top-level navigations — so
        // auth would silently appear broken post-login without this.
        // SameSite=None requires Secure=true, which requires HTTPS
        // (both platforms provide it by default).
        sameSite: IS_PRODUCTION ? "none" : "lax",
        secure: IS_PRODUCTION,
        maxAge: 1000 * 60 * 60 * 24, // 24h — expired sessions fall through requireAuth as 401
      },
    })
  );

  app.get("/health", (_req, res) => res.json({ ok: true }));

  app.use("/api/auth", authRouter);
  app.use("/api/kits", kitsRouter);
  app.use("/api/runs", runsRouter);

  app.use(errorHandler);

  app.listen(PORT, () => console.log(`API listening on :${PORT}`));
}

main().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
