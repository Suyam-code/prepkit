import { test } from "node:test";
import assert from "node:assert/strict";
import { checkCoverage } from "./coverageCheck";
import type { Requirement, Question } from "@prepkit/shared";

const requirements: Requirement[] = [
  { id: "req-1", text: "A", kind: "technical", priority: "must" },
  { id: "req-2", text: "B", kind: "technical", priority: "must" },
  { id: "req-3", text: "C", kind: "behavioural", priority: "nice" },
];

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

test("reports no gaps when every requirement is referenced by at least one question", () => {
  const questions = [
    question({ requirement_ids: ["req-1"] }),
    question({ requirement_ids: ["req-2", "req-3"] }),
  ];
  const result = checkCoverage(requirements, questions);
  assert.deepEqual(result.uncovered_requirement_ids, []);
});

test("reports every requirement no question references", () => {
  const questions = [question({ requirement_ids: ["req-1"] })];
  const result = checkCoverage(requirements, questions);
  assert.deepEqual(result.uncovered_requirement_ids, ["req-2", "req-3"]);
});

test("treats zero questions as zero coverage", () => {
  const result = checkCoverage(requirements, []);
  assert.deepEqual(result.uncovered_requirement_ids, ["req-1", "req-2", "req-3"]);
});

test("zero requirements is trivially fully covered", () => {
  const result = checkCoverage([], [question({ requirement_ids: ["req-1"] })]);
  assert.deepEqual(result.uncovered_requirement_ids, []);
});

test("a question referencing an id outside the requirement list doesn't cover anything real", () => {
  const questions = [question({ requirement_ids: ["req-999"] })];
  const result = checkCoverage(requirements, questions);
  assert.deepEqual(result.uncovered_requirement_ids, ["req-1", "req-2", "req-3"]);
});
