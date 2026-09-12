import { test } from "node:test";
import assert from "node:assert/strict";
import { fillCoverageGaps } from "./fillCoverageGaps";
import type { Requirement } from "@prepkit/shared";

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

test("generates one question per requirement and tags category by kind", async () => {
  globalThis.fetch = (async () =>
    fakeRes(
      geminiBody(
        JSON.stringify({
          questions: [
            { prompt: "Q about SQL", answer_outline: "a", difficulty: 2, requirement_id: "req-1" },
            { prompt: "Q about teamwork", answer_outline: "b", difficulty: 1, requirement_id: "req-2" },
          ],
        })
      )
    )) as typeof fetch;

  const requirements: Requirement[] = [
    { id: "req-1", text: "SQL", kind: "technical", priority: "must" },
    { id: "req-2", text: "Teamwork", kind: "behavioural", priority: "must" },
  ];

  const result = await fillCoverageGaps(requirements, "Engineer", "Mid");
  assert.equal(result.length, 2);
  assert.deepEqual(result[0].requirement_ids, ["req-1"]);
  assert.equal(result[0].category, "technical");
  assert.deepEqual(result[1].requirement_ids, ["req-2"]);
  assert.equal(result[1].category, "behavioural");
});

test("drops any question whose requirement_id wasn't actually asked about", async () => {
  globalThis.fetch = (async () =>
    fakeRes(
      geminiBody(
        JSON.stringify({
          questions: [
            { prompt: "Q", answer_outline: "a", difficulty: 1, requirement_id: "req-1" },
            { prompt: "Hallucinated", answer_outline: "b", difficulty: 1, requirement_id: "req-999" },
          ],
        })
      )
    )) as typeof fetch;

  const requirements: Requirement[] = [{ id: "req-1", text: "SQL", kind: "technical", priority: "must" }];
  const result = await fillCoverageGaps(requirements, "Engineer", "Mid");
  assert.equal(result.length, 1);
  assert.deepEqual(result[0].requirement_ids, ["req-1"]);
});

test("returns an empty array without calling the LLM when there's nothing to fill", async () => {
  let called = false;
  globalThis.fetch = (async () => {
    called = true;
    return fakeRes(geminiBody(JSON.stringify({ questions: [] })));
  }) as typeof fetch;

  const result = await fillCoverageGaps([], "Engineer", "Mid");
  assert.deepEqual(result, []);
  assert.equal(called, false);
});
