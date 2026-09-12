import { test } from "node:test";
import assert from "node:assert/strict";
import { closeCoverageGaps } from "./coverageLoop";
import type { Question, Requirement } from "@prepkit/shared";

function geminiBody(text: string) {
  return { candidates: [{ content: { parts: [{ text }] } }] };
}
function fakeRes(body: unknown) {
  return {
    ok: true,
    status: 200,
    headers: { get: () => null },
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

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
  { id: "req-1", text: "A", kind: "technical", priority: "must" },
  { id: "req-2", text: "B", kind: "technical", priority: "must" },
];

test("zero passes and no LLM call when everything is already covered", async () => {
  let called = false;
  globalThis.fetch = (async () => {
    called = true;
    return fakeRes(geminiBody(JSON.stringify({ questions: [] })));
  }) as typeof fetch;

  const initial = [question({ requirement_ids: ["req-1"] }), question({ requirement_ids: ["req-2"] })];
  const result = await closeCoverageGaps(initial, requirements, "Engineer", "Mid");

  assert.equal(called, false);
  assert.equal(result.passes, 0);
  assert.deepEqual(result.uncovered_requirement_ids, []);
  assert.deepEqual(
    result.questions.map((q) => q.id),
    ["q-1", "q-2"]
  );
});

test("one pass closes a single gap", async () => {
  globalThis.fetch = (async () =>
    fakeRes(
      geminiBody(
        JSON.stringify({
          questions: [{ prompt: "Gap Q", answer_outline: "a", difficulty: 1, requirement_id: "req-2" }],
        })
      )
    )) as typeof fetch;

  const initial = [question({ requirement_ids: ["req-1"] })]; // req-2 uncovered
  const result = await closeCoverageGaps(initial, requirements, "Engineer", "Mid");

  assert.equal(result.passes, 1);
  assert.deepEqual(result.uncovered_requirement_ids, []);
  assert.equal(result.questions.length, 2);
  assert.deepEqual(
    result.questions.map((q) => q.id),
    ["q-1", "q-2"]
  );
});

test("stops after MAX_PASSES and reports the gap honestly if it can't be closed", async () => {
  let calls = 0;
  globalThis.fetch = (async () => {
    calls++;
    return fakeRes(geminiBody(JSON.stringify({ questions: [] }))); // never actually fills the gap
  }) as typeof fetch;

  const initial: Question[] = []; // both requirements uncovered from the start
  const result = await closeCoverageGaps(initial, requirements, "Engineer", "Mid");

  assert.equal(calls, 2); // MAX_PASSES = 2
  assert.equal(result.passes, 2);
  assert.deepEqual(result.uncovered_requirement_ids, ["req-1", "req-2"]);
});
