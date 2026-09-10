import { z } from "zod";

/**
 * These schemas mirror Appendix A and Appendix B of the assessment brief
 * field-for-field. Field names and nesting are NOT to be changed —
 * the batch pipeline is graded against this exact shape.
 *
 * `state` on questions/flashcards is our own extension (allowed by the
 * brief: "you may extend it where that genuinely helps") to support the
 * generated / edited / pinned model described in the architecture doc.
 */

export const RequirementKind = z.enum(["technical", "behavioural", "domain"]);
export const RequirementPriority = z.enum(["must", "nice"]);
export const QuestionCategory = z.enum([
  "technical",
  "behavioural",
  "system-design",
  "company-fit",
]);
export const ItemState = z.enum(["generated", "edited", "pinned"]);

export const RequirementSchema = z.object({
  id: z.string(),
  text: z.string(),
  kind: RequirementKind,
  priority: RequirementPriority,
});

export const QuestionSchema = z.object({
  id: z.string(),
  requirement_ids: z.array(z.string()),
  category: QuestionCategory,
  prompt: z.string(),
  answer_outline: z.string(),
  difficulty: z.number().int().min(1).max(3),
  state: ItemState.default("generated"),
});

export const FlashcardSchema = z.object({
  id: z.string(),
  front: z.string(),
  back: z.string(),
  requirement_ids: z.array(z.string()),
  state: ItemState.default("generated"),
});

export const ScheduleDaySchema = z.object({
  day: z.number().int().positive(),
  focus: z.string(),
  question_ids: z.array(z.string()),
  minutes: z.number().int().nonnegative(),
});

export const KitSchema = z.object({
  source: z.object({
    company: z.string(),
    company_url: z.string(),
    role: z.string(),
    location: z.string(),
    jd_chars: z.number().int().nonnegative(),
    researched_at: z.string(), // ISO 8601
    pages_used: z.array(z.string()),
  }),
  company_brief: z.object({
    summary: z.string(),
    what_they_do: z.string(),
    sources: z.array(z.string()),
  }),
  role: z.object({
    title: z.string(),
    seniority: z.string(),
    responsibilities: z.array(z.string()),
    requirements: z.array(RequirementSchema),
  }),
  questions: z.array(QuestionSchema),
  flashcards: z.array(FlashcardSchema),
  schedule: z.object({
    days_available: z.number().int().positive(),
    days: z.array(ScheduleDaySchema),
  }),
  coverage: z.object({
    uncovered_requirement_ids: z.array(z.string()),
    passes: z.number().int().nonnegative(),
  }),
});

export type Requirement = z.infer<typeof RequirementSchema>;
export type Question = z.infer<typeof QuestionSchema>;
export type Flashcard = z.infer<typeof FlashcardSchema>;
export type ScheduleDay = z.infer<typeof ScheduleDaySchema>;
export type Kit = z.infer<typeof KitSchema>;

/** Appendix B — batch input file: an array of cases. */
export const BatchCaseSchema = z.object({
  id: z.string(),
  jd: z.string(),
  company_url: z.string(),
  days: z.number().int().positive(),
});
export const BatchInputSchema = z.array(BatchCaseSchema);
export type BatchCase = z.infer<typeof BatchCaseSchema>;

/** Appendix B — batch output file. */
export const BatchResultSchema = z.object({
  id: z.string(),
  status: z.enum(["ok", "failed"]),
  kit: KitSchema.nullable(),
  error: z
    .object({
      code: z.string(),
      message: z.string(),
    })
    .nullable(),
});
export const BatchOutputSchema = z.object({
  version: z.literal("1.0"),
  generated_at: z.string(), // ISO 8601
  kits: z.array(BatchResultSchema),
});
export type BatchResult = z.infer<typeof BatchResultSchema>;
export type BatchOutput = z.infer<typeof BatchOutputSchema>;

/** Server-side run/job status, used for polling progress in the UI. */
export const RunStepStatus = z.enum([
  "pending",
  "running",
  "done",
  "failed",
  "skipped",
]);
export const RunStatusSchema = z.object({
  id: z.string(),
  kitId: z.string(),
  kind: z.string(), // "full" | "section:company_brief" | "section:questions:technical" | ...
  status: z.enum([
    "queued",
    "crawling",
    "extracting",
    "generating",
    "checking_coverage",
    "scheduling",
    "validating",
    "done",
    "failed",
  ]),
  steps: z.array(
    z.object({
      name: z.string(),
      status: RunStepStatus,
      startedAt: z.string().nullable(),
      finishedAt: z.string().nullable(),
      error: z.string().nullable(),
    })
  ),
  createdAt: z.string(),
});
export type RunStatus = z.infer<typeof RunStatusSchema>;
