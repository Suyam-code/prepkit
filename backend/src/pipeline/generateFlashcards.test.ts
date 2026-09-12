import { test } from "node:test";
import assert from "node:assert/strict";
import { generateFlashcards } from "./generateFlashcards";
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

const requirements: Requirement[] = [
  { id: "req-1", text: "SQL", kind: "technical", priority: "must" },
  { id: "req-2", text: "Teamwork", kind: "behavioural", priority: "must" },
];

test("generates flashcards with sequential ids and filters hallucinated requirement_ids", async () => {
  globalThis.fetch = (async () =>
    fakeRes(
      geminiBody(
        JSON.stringify({
          flashcards: [
            { front: "What is a JOIN?", back: "Combines rows from two tables.", requirement_ids: ["req-1"] },
            { front: "STAR method", back: "Situation, Task, Action, Result.", requirement_ids: ["req-2", "req-999"] },
          ],
        })
      )
    )) as typeof fetch;

  const result = await generateFlashcards({ requirements, roleTitle: "Engineer", seniority: "Mid" });

  assert.equal(result.length, 2);
  assert.deepEqual(
    result.map((c) => c.id),
    ["fc-1", "fc-2"]
  );
  assert.deepEqual(result[1].requirement_ids, ["req-2"]); // req-999 filtered out
  assert.ok(result.every((c) => c.state === "generated"));
});

test("returns an empty array without calling the LLM when there are no requirements", async () => {
  let called = false;
  globalThis.fetch = (async () => {
    called = true;
    return fakeRes(geminiBody(JSON.stringify({ flashcards: [] })));
  }) as typeof fetch;

  const result = await generateFlashcards({ requirements: [], roleTitle: "Engineer", seniority: "Mid" });
  assert.deepEqual(result, []);
  assert.equal(called, false);
});
