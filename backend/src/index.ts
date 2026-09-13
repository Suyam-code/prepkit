import express from "express";
import cors from "cors";
import mongoose from "mongoose";

import { authRouter } from "./routes/auth";
import { kitsRouter } from "./routes/kits";
import { runsRouter } from "./routes/runs";
import { errorHandler } from "./middleware/errorHandler";

const PORT = process.env.PORT || 4000;
const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/prepkit";
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || "http://localhost:3000";
const IS_PRODUCTION = process.env.NODE_ENV === "production";

async function main() {
  await mongoose.connect(MONGODB_URI);
  console.log("Connected to MongoDB");

  const app = express();
  if (IS_PRODUCTION) app.set("trust proxy", 1);
  app.use(cors({ origin: FRONTEND_ORIGIN, credentials: true }));
  app.use(express.json({ limit: "1mb" }));

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
