import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth";
import { Kit } from "../models/Kit";

export const kitsRouter = Router();
kitsRouter.use(requireAuth);

// List only the signed-in user's kits.
kitsRouter.get("/", async (req, res, next) => {
  try {
    const kits = await Kit.find({ userId: req.session.userId }).sort({ updatedAt: -1 });
    res.json(kits);
  } catch (err) {
    next(err);
  }
});

// Fetch one kit — 404s (not 403s) if it exists but isn't yours, so we
// don't leak existence of other users' kit ids.
kitsRouter.get("/:id", async (req, res, next) => {
  try {
    const kit = await Kit.findOne({ _id: req.params.id, userId: req.session.userId });
    if (!kit) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Kit not found." } });
    res.json(kit);
  } catch (err) {
    next(err);
  }
});

// TODO (pipeline phase):
//   POST /            -> validate {jd, company_url, days}, create draft Kit,
//                         kick off orchestrator.run("full") async, return {kitId, runId}
//   PATCH /:id/questions/:qid   -> mark state:"edited", persist
//   POST  /:id/regenerate/:section -> kick off orchestrator.run("section:<name>")
