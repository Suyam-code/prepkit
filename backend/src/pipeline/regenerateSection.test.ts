import { test } from "node:test";
import assert from "node:assert/strict";
import { regenerateQuestionCategory, regenerateFlashcards } from "./regenerateSection";
import type { Flashcard, Question, Requirement } from "@prepkit/shared";

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
  { id: "req-1", text: "React", kind: "technical", priority: "must" },
  { id: "req-2", text: "Mentoring", kind: "behavioural", priority: "must" },
];

test("regenerating one category leaves other categories completely untouched", async () => {
  globalThis.fetch = (async () =>
    fakeRes(
      geminiBody(JSON.stringify({ questions: [{ prompt: "New technical Q", answer_outline: "a", difficulty: 2, requirement_ids: ["req-1"] }] }))
    )) as typeof fetch;

  const allQuestions = [
    question({ id: "q-1", category: "technical", prompt: "Old technical Q", requirement_ids: ["req-1"] }),
    question({ id: "q-2", category: "behavioural", prompt: "Behavioural Q", state: "edited", requirement_ids: ["req-2"] }),
  ];

  const result = await regenerateQuestionCategory({
    category: "technical",
    allQuestions,
    requirements,
    roleTitle: "Engineer",
    seniority: "Mid",
  });

  const behavioural = result.questions.find((q) => q.prompt === "Behavioural Q");
  assert.ok(behavioural, "the untouched category's question should still be present");
  assert.equal(behavioural!.state, "edited");

  const technical = result.questions.filter((q) => q.category === "technical");
  assert.equal(technical.length, 1);
  assert.equal(technical[0].prompt, "New technical Q"); // old generated one was replaced
});

test("edited and pinned items in the target category survive regeneration; only generated ones are replaced", async () => {
  globalThis.fetch = (async () =>
    fakeRes(
      geminiBody(JSON.stringify({ questions: [{ prompt: "Fresh Q", answer_outline: "a", difficulty: 1, requirement_ids: ["req-1"] }] }))
    )) as typeof fetch;

  const allQuestions = [
    question({ id: "q-1", category: "technical", prompt: "Generated Q", state: "generated", requirement_ids: ["req-1"] }),
    question({ id: "q-2", category: "technical", prompt: "My edited Q", state: "edited", requirement_ids: ["req-1"] }),
    question({ id: "q-3", category: "technical", prompt: "My pinned Q", state: "pinned", requirement_ids: ["req-1"] }),
  ];

  const result = await regenerateQuestionCategory({
    category: "technical",
    allQuestions,
    requirements: [requirements[0]], // only req-1 — this test isn't about coverage gap-filling
    roleTitle: "Engineer",
    seniority: "Mid",
  });

  const prompts = result.questions.map((q) => q.prompt);
  assert.ok(prompts.includes("My edited Q"));
  assert.ok(prompts.includes("My pinned Q"));
  assert.ok(prompts.includes("Fresh Q"));
  assert.ok(!prompts.includes("Generated Q")); // the old generated item is gone
});

test("regenerating flashcards keeps edited/pinned cards and reassigns ids sequentially", async () => {
  globalThis.fetch = (async () =>
    fakeRes(
      geminiBody(
        JSON.stringify({
          flashcards: [{ front: "New front", back: "New back", requirement_ids: ["req-1"] }],
        })
      )
    )) as typeof fetch;

  const allFlashcards: Flashcard[] = [
    { id: "fc-1", front: "Old generated", back: "b", requirement_ids: ["req-1"], state: "generated" },
    { id: "fc-2", front: "My edited card", back: "b", requirement_ids: ["req-1"], state: "edited" },
  ];

  const result = await regenerateFlashcards({
    allFlashcards,
    requirements,
    roleTitle: "Engineer",
    seniority: "Mid",
  });

  const fronts = result.map((c) => c.front);
  assert.ok(fronts.includes("My edited card"));
  assert.ok(fronts.includes("New front"));
  assert.ok(!fronts.includes("Old generated"));
  assert.deepEqual(
    result.map((c) => c.id),
    ["fc-1", "fc-2"]
  );
});
