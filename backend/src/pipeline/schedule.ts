import type { Question, Requirement, ScheduleDay } from "@prepkit/shared";

type Category = Question["category"];

const CATEGORY_ORDER: Record<Category, number> = {
  technical: 0,
  "system-design": 1,
  behavioural: 2,
  "company-fit": 3,
};

// Rough estimated minutes to properly study one question: a category
// baseline (system-design questions inherently take longer to work
// through regardless of difficulty) plus a difficulty component.
const CATEGORY_BASE_MINUTES: Record<Category, number> = {
  technical: 10,
  "system-design": 20,
  behavioural: 8,
  "company-fit": 6,
};
const DIFFICULTY_MINUTES: Record<number, number> = { 1: 5, 2: 10, 3: 18 };

const FOCUS_LABELS: Record<Category, string> = {
  technical: "Technical fundamentals",
  "system-design": "System design practice",
  behavioural: "Behavioural stories",
  "company-fit": "Company research & fit",
};

export function estimateQuestionMinutes(q: Question): number {
  const base = CATEGORY_BASE_MINUTES[q.category] ?? 10;
  const diff = DIFFICULTY_MINUTES[q.difficulty] ?? 10;
  return base + diff;
}

/**
 * 0 = urgent (tests at least one "must" requirement), 1 = everything
 * else (nice-priority requirements, or no linked requirement at all —
 * e.g. a company-fit question — treated as equally non-urgent).
 */
function priorityRank(q: Question, priorityByRequirement: Map<string, "must" | "nice">): number {
  const hasMust = q.requirement_ids.some((id) => priorityByRequirement.get(id) === "must");
  return hasMust ? 0 : 1;
}

function focusLabelFor(categoryCounts: Partial<Record<Category, number>>): string {
  const entries = (Object.entries(categoryCounts) as Array<[Category, number]>).filter(([, n]) => n > 0);
  if (entries.length === 0) return "Rest day";
  entries.sort((a, b) => b[1] - a[1]);
  const [topCategory] = entries[0];
  return entries.length === 1 ? FOCUS_LABELS[topCategory] : `${FOCUS_LABELS[topCategory]} + mixed review`;
}

export interface BuildScheduleParams {
  questions: Question[];
  requirements: Requirement[];
  daysAvailable: number;
}

export interface BuildScheduleResult {
  days_available: number;
  days: ScheduleDay[];
}

/**
 * Deterministic day-by-day allocator — no LLM involved.
 *
 * 1. Orders questions by urgency: must-priority requirements first, then
 *    category (technical -> system-design -> behavioural -> company-fit,
 *    on the theory that foundations come before applying them, and
 *    company culture fit is usually front-of-mind right before the
 *    interview rather than early prep), then ascending difficulty within
 *    a tier so easier questions on a topic come before harder ones.
 * 2. Estimates a study-time cost per question.
 * 3. Greedily bin-packs into `daysAvailable` days against an even
 *    per-day time budget computed from the total.
 *
 * Always returns exactly `daysAvailable` day entries — including empty
 * "Rest day" entries when there's more days than content (e.g. a 60-day
 * schedule with 13 questions), and a possibly-heavier last day when
 * there's more content than days (e.g. a 1-day cram schedule). Every
 * question appears in exactly one day, never zero or multiple.
 */
export function buildSchedule(params: BuildScheduleParams): BuildScheduleResult {
  const { questions, requirements, daysAvailable } = params;
  const days = Math.max(1, Math.floor(daysAvailable));

  const priorityByRequirement = new Map(requirements.map((r) => [r.id, r.priority]));

  const ordered = [...questions].sort((a, b) => {
    const pr = priorityRank(a, priorityByRequirement) - priorityRank(b, priorityByRequirement);
    if (pr !== 0) return pr;
    const cat = CATEGORY_ORDER[a.category] - CATEGORY_ORDER[b.category];
    if (cat !== 0) return cat;
    return a.difficulty - b.difficulty;
  });

  const totalMinutes = ordered.reduce((sum, q) => sum + estimateQuestionMinutes(q), 0);
  const targetPerDay = totalMinutes / days;

  const buckets: Array<{
    questionIds: string[];
    minutes: number;
    categoryCounts: Partial<Record<Category, number>>;
  }> = Array.from({ length: days }, () => ({ questionIds: [], minutes: 0, categoryCounts: {} }));

  let dayIndex = 0;
  for (const q of ordered) {
    // Advance once the current day has met its target share of the
    // total — but never skip past a still-empty day (the length check),
    // and never advance past the final day (the dayIndex < days - 1
    // guard), which is the catch-all for anything left over.
    while (
      dayIndex < days - 1 &&
      buckets[dayIndex].minutes >= targetPerDay &&
      buckets[dayIndex].questionIds.length > 0
    ) {
      dayIndex++;
    }
    const bucket = buckets[dayIndex];
    bucket.questionIds.push(q.id);
    bucket.minutes += estimateQuestionMinutes(q);
    bucket.categoryCounts[q.category] = (bucket.categoryCounts[q.category] ?? 0) + 1;
  }

  // Rebalance: the greedy pack above decides "move to the next day" only
  // after adding a question, so early days can slightly overshoot their
  // fair share — by the last day there can be nothing left, even though
  // there was enough content overall to give every day something. Fix:
  // for each day that ended up empty, pull the lowest-priority question
  // (the last one added, since `ordered` is sorted most-urgent-first)
  // off whichever day currently has the most minutes AND more than one
  // question — donating from a single-question day would just move the
  // emptiness elsewhere instead of fixing it. Stops once there's truly
  // nothing left to redistribute (e.g. fewer questions than days).
  const questionById = new Map(ordered.map((q) => [q.id, q]));
  for (const bucket of buckets) {
    if (bucket.questionIds.length > 0) continue;

    let donor: (typeof buckets)[number] | null = null;
    for (const candidate of buckets) {
      if (candidate.questionIds.length <= 1) continue;
      if (!donor || candidate.minutes > donor.minutes) donor = candidate;
    }
    if (!donor) break; // nothing left to redistribute — genuinely not enough content

    const movedId = donor.questionIds.pop()!;
    const movedQuestion = questionById.get(movedId)!;
    const movedMinutes = estimateQuestionMinutes(movedQuestion);

    donor.minutes -= movedMinutes;
    donor.categoryCounts[movedQuestion.category] = (donor.categoryCounts[movedQuestion.category] ?? 1) - 1;

    bucket.questionIds.push(movedId);
    bucket.minutes += movedMinutes;
    bucket.categoryCounts[movedQuestion.category] = (bucket.categoryCounts[movedQuestion.category] ?? 0) + 1;
  }

  const scheduleDays: ScheduleDay[] = buckets.map((bucket, i) => ({
    day: i + 1,
    focus: focusLabelFor(bucket.categoryCounts),
    question_ids: bucket.questionIds,
    minutes: bucket.minutes,
  }));

  return { days_available: days, days: scheduleDays };
}
