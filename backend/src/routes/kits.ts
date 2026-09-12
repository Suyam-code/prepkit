import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/requireAuth";
import { Kit } from "../models/Kit";
import { runOrchestrator } from "../pipeline/orchestrator";
import { regenerateQuestionCategory, regenerateFlashcards } from "../pipeline/regenerateSection";
import { buildSchedule } from "../pipeline/schedule";

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

const CreateKitSchema = z.object({
  jd: z.string().min(1),
  company_url: z.string().url(),
  days: z.number().int().positive().max(60),
});

// Generates synchronously — this can take 30-90s depending on how many
// LLM calls the pipeline needs, so the client should show a loading
// state, not expect an instant response. A polling /runs/:id flow (see
// runs.ts) is the natural next step if that latency becomes a problem
// for the UI, but isn't required for the pipeline to work correctly.
kitsRouter.post("/", async (req, res, next) => {
  try {
    const { jd, company_url, days } = CreateKitSchema.parse(req.body);

    const kitDoc = await Kit.create({
      userId: req.session.userId,
      status: "generating",
      content: {},
    });

    try {
      const content = await runOrchestrator({ jd, company_url, days });
      kitDoc.content = content;
      kitDoc.status = "ready";
      await kitDoc.save();
      res.status(201).json(kitDoc);
    } catch (pipelineErr) {
      kitDoc.status = "failed";
      await kitDoc.save();
      throw pipelineErr;
    }
  } catch (err) {
    next(err);
  }
});

// --- Editing a single question or flashcard ---
// Any content edit is forced to state:"edited" server-side regardless of
// what the client sends — the server, not the client, is the source of
// truth for state transitions, so a buggy or malicious client can't mark
// something back to "generated" and make it vulnerable to being silently
// overwritten by the next regenerate call.

const EditQuestionSchema = z.object({
  prompt: z.string().min(1).optional(),
  answer_outline: z.string().min(1).optional(),
  difficulty: z.number().int().min(1).max(3).optional(),
});

kitsRouter.patch("/:id/questions/:qid", async (req, res, next) => {
  try {
    const updates = EditQuestionSchema.parse(req.body);
    const kit = await Kit.findOne({ _id: req.params.id, userId: req.session.userId });
    if (!kit) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Kit not found." } });

    const question = kit.content?.questions?.find((q: { id: string }) => q.id === req.params.qid);
    if (!question) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Question not found." } });

    Object.assign(question, updates);
    if (question.state === "generated") question.state = "edited";

    kit.markModified("content");
    await kit.save();
    res.json(kit);
  } catch (err) {
    next(err);
  }
});

const EditFlashcardSchema = z.object({
  front: z.string().min(1).optional(),
  back: z.string().min(1).optional(),
});

kitsRouter.patch("/:id/flashcards/:fid", async (req, res, next) => {
  try {
    const updates = EditFlashcardSchema.parse(req.body);
    const kit = await Kit.findOne({ _id: req.params.id, userId: req.session.userId });
    if (!kit) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Kit not found." } });

    const card = kit.content?.flashcards?.find((c: { id: string }) => c.id === req.params.fid);
    if (!card) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Flashcard not found." } });

    Object.assign(card, updates);
    if (card.state === "generated") card.state = "edited";

    kit.markModified("content");
    await kit.save();
    res.json(kit);
  } catch (err) {
    next(err);
  }
});

// --- Pin / unpin ---
// Unpinning reverts to "edited" rather than "generated" — a safer
// default, since "edited" is still protected from being silently
// overwritten by the next regenerate, while "generated" is not.

function findItem<T extends { id: string }>(list: T[] | undefined, id: string): T | undefined {
  return list?.find((item) => item.id === id);
}

kitsRouter.post("/:id/questions/:qid/pin", async (req, res, next) => {
  try {
    const kit = await Kit.findOne({ _id: req.params.id, userId: req.session.userId });
    if (!kit) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Kit not found." } });
    const question = findItem(kit.content?.questions, req.params.qid);
    if (!question) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Question not found." } });
    question.state = "pinned";
    kit.markModified("content");
    await kit.save();
    res.json(kit);
  } catch (err) {
    next(err);
  }
});

kitsRouter.post("/:id/questions/:qid/unpin", async (req, res, next) => {
  try {
    const kit = await Kit.findOne({ _id: req.params.id, userId: req.session.userId });
    if (!kit) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Kit not found." } });
    const question = findItem(kit.content?.questions, req.params.qid);
    if (!question) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Question not found." } });
    question.state = "edited";
    kit.markModified("content");
    await kit.save();
    res.json(kit);
  } catch (err) {
    next(err);
  }
});

kitsRouter.post("/:id/flashcards/:fid/pin", async (req, res, next) => {
  try {
    const kit = await Kit.findOne({ _id: req.params.id, userId: req.session.userId });
    if (!kit) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Kit not found." } });
    const card = findItem(kit.content?.flashcards, req.params.fid);
    if (!card) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Flashcard not found." } });
    card.state = "pinned";
    kit.markModified("content");
    await kit.save();
    res.json(kit);
  } catch (err) {
    next(err);
  }
});

kitsRouter.post("/:id/flashcards/:fid/unpin", async (req, res, next) => {
  try {
    const kit = await Kit.findOne({ _id: req.params.id, userId: req.session.userId });
    if (!kit) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Kit not found." } });
    const card = findItem(kit.content?.flashcards, req.params.fid);
    if (!card) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Flashcard not found." } });
    card.state = "edited";
    kit.markModified("content");
    await kit.save();
    res.json(kit);
  } catch (err) {
    next(err);
  }
});

kitsRouter.post("/:id/practice/:fid", async (req, res, next) => {
  try {
    const { confidence } = z.object({ confidence: z.number().int().min(1).max(5) }).parse(req.body);

    const kit = await Kit.findOne({ _id: req.params.id, userId: req.session.userId });
    if (!kit) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Kit not found." } });

    const cardExists = kit.content?.flashcards?.some((c: { id: string }) => c.id === req.params.fid);
    if (!cardExists) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Flashcard not found." } });

    const previous = kit.practice?.[req.params.fid];
    kit.practice = kit.practice ?? {};
    kit.practice[req.params.fid] = {
      seen: (previous?.seen ?? 0) + 1,
      lastConfidence: confidence,
      lastSeenAt: new Date(),
    };

    kit.markModified("practice");
    await kit.save();
    res.json(kit);
  } catch (err) {
    next(err);
  }
});

// --- Regenerate a section ---
// Preserves edited/pinned items in that section, replaces only the
// generated ones, re-checks coverage across the whole question set
// afterward (since regenerating one category can shift which
// requirements are covered), and rebuilds the schedule to match.

const RegenerateSectionSchema = z.enum([
  "technical",
  "behavioural",
  "system-design",
  "company-fit",
  "flashcards",
]);

kitsRouter.post("/:id/regenerate/:section", async (req, res, next) => {
  try {
    const section = RegenerateSectionSchema.parse(req.params.section);

    const kit = await Kit.findOne({ _id: req.params.id, userId: req.session.userId });
    if (!kit) return res.status(404).json({ error: { code: "NOT_FOUND", message: "Kit not found." } });

    const content = kit.content;
    const { title: roleTitle, seniority, requirements } = content.role;

    if (section === "flashcards") {
      content.flashcards = await regenerateFlashcards({
        allFlashcards: content.flashcards,
        requirements,
        roleTitle,
        seniority,
      });
    } else {
      // Only ground company-fit regeneration in a real brief — same rule
      // as initial generation (see orchestrator.ts): the degraded
      // placeholder brief (no hiring page found) has no sources to cite.
      const companyBrief = content.company_brief?.sources?.length > 0 ? content.company_brief : null;

      const { questions, uncovered_requirement_ids, passes } = await regenerateQuestionCategory({
        category: section,
        allQuestions: content.questions,
        requirements,
        roleTitle,
        seniority,
        companyBrief,
      });

      content.questions = questions;
      content.coverage = { uncovered_requirement_ids, passes };
      content.schedule = buildSchedule({ questions, requirements, daysAvailable: content.schedule.days_available });
    }

    kit.markModified("content");
    await kit.save();
    res.json(kit);
  } catch (err) {
    next(err);
  }
});
