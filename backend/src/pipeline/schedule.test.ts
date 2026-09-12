import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSchedule, estimateQuestionMinutes } from "./schedule";
import type { Question, Requirement } from "@prepkit/shared";

function question(overrides: Partial<Question> = {}): Question {
  return {
    id: "q-x",
    requirement_ids: [],
    category: "technical",
    prompt: "p",
    answer_outline: "a",
    difficulty: 1,
    state: "generated",
    ...overrides,
  };
}

const requirements: Requirement[] = [
  { id: "req-must", text: "Must-have skill", kind: "technical", priority: "must" },
  { id: "req-nice", text: "Nice-to-have skill", kind: "technical", priority: "nice" },
];

test("always returns exactly daysAvailable day entries, even with zero questions", () => {
  const result = buildSchedule({ questions: [], requirements: [], daysAvailable: 5 });
  assert.equal(result.days_available, 5);
  assert.equal(result.days.length, 5);
  assert.ok(result.days.every((d) => d.question_ids.length === 0 && d.minutes === 0));
  assert.ok(result.days.every((d) => d.focus === "Rest day"));
});

test("every question is scheduled exactly once across all days", () => {
  const questions = [
    question({ id: "q-1", requirement_ids: ["req-must"] }),
    question({ id: "q-2", requirement_ids: ["req-nice"] }),
    question({ id: "q-3", category: "behavioural" }),
    question({ id: "q-4", category: "system-design", difficulty: 3 }),
  ];
  const result = buildSchedule({ questions, requirements, daysAvailable: 3 });

  const allScheduledIds = result.days.flatMap((d) => d.question_ids);
  assert.deepEqual(allScheduledIds.sort(), ["q-1", "q-2", "q-3", "q-4"].sort());
  // no duplicates
  assert.equal(new Set(allScheduledIds).size, allScheduledIds.length);
});

test("must-priority questions are scheduled no later than nice-priority ones", () => {
  const questions = [
    question({ id: "q-nice", requirement_ids: ["req-nice"] }),
    question({ id: "q-must", requirement_ids: ["req-must"] }),
  ];
  const result = buildSchedule({ questions, requirements, daysAvailable: 2 });

  const dayOf = (id: string) => result.days.find((d) => d.question_ids.includes(id))!.day;
  assert.ok(dayOf("q-must") <= dayOf("q-nice"));
});

test("a single day gets everything crammed in", () => {
  const questions = [question({ id: "q-1" }), question({ id: "q-2" }), question({ id: "q-3" })];
  const result = buildSchedule({ questions, requirements: [], daysAvailable: 1 });

  assert.equal(result.days.length, 1);
  assert.deepEqual(result.days[0].question_ids.sort(), ["q-1", "q-2", "q-3"]);
});

test("more days than questions produces trailing rest days, not duplicated content", () => {
  const questions = [question({ id: "q-1" }), question({ id: "q-2" })];
  const result = buildSchedule({ questions, requirements: [], daysAvailable: 10 });

  assert.equal(result.days.length, 10);
  const nonEmptyDays = result.days.filter((d) => d.question_ids.length > 0);
  const emptyDays = result.days.filter((d) => d.question_ids.length === 0);
  assert.ok(nonEmptyDays.length > 0);
  assert.ok(emptyDays.length > 0);
  assert.ok(emptyDays.every((d) => d.focus === "Rest day" && d.minutes === 0));
});

test("each day's minutes equal the sum of its questions' estimated minutes", () => {
  const questions = [
    question({ id: "q-1", category: "technical", difficulty: 2 }),
    question({ id: "q-2", category: "system-design", difficulty: 3 }),
  ];
  const result = buildSchedule({ questions, requirements: [], daysAvailable: 1 });

  const expectedTotal = questions.reduce((sum, q) => sum + estimateQuestionMinutes(q), 0);
  assert.equal(result.days[0].minutes, expectedTotal);
});

test("clamps a non-positive or fractional daysAvailable to a sane minimum of 1", () => {
  const result = buildSchedule({ questions: [question()], requirements: [], daysAvailable: 0 });
  assert.equal(result.days_available, 1);
  assert.equal(result.days.length, 1);
});

test("when there are at least as many questions as days, no day is left empty", () => {
  // Mirrors a real shape we saw in production: heavier technical/system-design
  // questions early on can overshoot the per-day target and starve a later
  // day, even though there's exactly enough content for one question per day.
  const questions = [
    question({ id: "q-1", category: "technical", difficulty: 3 }),
    question({ id: "q-2", category: "technical", difficulty: 3 }),
    question({ id: "q-3", category: "system-design", difficulty: 3 }),
    question({ id: "q-4", category: "behavioural", difficulty: 1 }),
    question({ id: "q-5", category: "company-fit", difficulty: 1 }),
  ];
  const result = buildSchedule({ questions, requirements: [], daysAvailable: 5 });

  assert.ok(
    result.days.every((d) => d.question_ids.length > 0),
    "expected every day to have at least one question"
  );
  const scheduledIds = result.days.flatMap((d) => d.question_ids);
  assert.deepEqual(
    scheduledIds.sort(),
    questions.map((q) => q.id).sort()
  );
});
