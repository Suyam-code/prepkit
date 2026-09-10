import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth";
import { Run } from "../models/Run";
import { Kit } from "../models/Kit";

export const runsRouter = Router();
runsRouter.use(requireAuth);

// Poll a run's status. Ownership is checked via the parent kit, since
// runs don't carry userId directly.
runsRouter.get("/:id", async (req, res, next) => {
  try {
    const run = await Run.findById(req.params.id);
    if (!run) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Run not found." } });

    const kit = await Kit.findOne({ _id: run.kitId, userId: req.session.userId });
    if (!kit) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Run not found." } });

    res.json(run);
  } catch (err) {
    next(err);
  }
});
