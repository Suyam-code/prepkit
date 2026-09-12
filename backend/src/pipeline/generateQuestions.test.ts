import { test } from "node:test";
import assert from "node:assert/strict";
import { generateQuestions } from "./generateQuestions";
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

// Each category's prompt contains a unique instruction sentence — route the
// mocked response by looking for that sentence in the outgoing request body,
// rather than relying on call order.
const CATEGORY_PHRASE: Record<string, string> = {
  technical: "Write hands-on technical questions",
  behavioural: "Write behavioural questions",
  "system-design": "Write open-ended system/architecture design questions",
  "company-fit": "Write questions that probe genuine interest",
};

function mockByCategory(responses: Record<string, unknown>) {
  globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
    const bodyStr = typeof init?.body === "string" ? init.body : "";
    for (const [category, response] of Object.entries(responses)) {
      if (bodyStr.includes(CATEGORY_PHRASE[category])) {
        return fakeRes(geminiBody(JSON.stringify(response)));
      }
    }
    return fakeRes(geminiBody(JSON.stringify({ questions: [] })));
  }) as typeof fetch;
}

const requirements: Requirement[] = [
  { id: "req-1", text: "React expertise", kind: "technical", priority: "must" },
  { id: "req-2", text: "Mentoring", kind: "behavioural", priority: "must" },
  { id: "req-3", text: "Payments domain knowledge", kind: "domain", priority: "nice" },
];

test("generates across categories with sequential global ids and filters hallucinated requirement_ids", async () => {
  mockByCategory({
    technical: {
      questions: [
        { prompt: "Explain React reconciliation", answer_outline: "...", difficulty: 2, requirement_ids: ["req-1"] },
        {
          prompt: "Design a payments retry system",
          answer_outline: "...",
          difficulty: 3,
          requirement_ids: ["req-3", "req-999"], // req-999 doesn't exist — must be dropped
        },
      ],
    },
    behavioural: {
      questions: [
        { prompt: "Tell me about mentoring a junior", answer_outline: "...", difficulty: 1, requirement_ids: ["req-2"] },
      ],
    },
    "system-design": {
      questions: [
        { prompt: "Design a high-throughput payments API", answer_outline: "...", difficulty: 3, requirement_ids: ["req-3"] },
      ],
    },
    "company-fit": {
      questions: [{ prompt: "Why our payments mission?", answer_outline: "...", difficulty: 1, requirement_ids: [] }],
    },
  });

  const result = await generateQuestions({
    requirements,
    roleTitle: "Backend Engineer",
    seniority: "Senior",
    companyBrief: { summary: "We do payments", what_they_do: "Process transactions" },
  });

  assert.equal(result.length, 5);
  assert.deepEqual(
    result.map((q) => q.id),
    ["q-1", "q-2", "q-3", "q-4", "q-5"]
  );
  assert.deepEqual(
    result.map((q) => q.category),
    ["technical", "technical", "behavioural", "system-design", "company-fit"]
  );
  assert.deepEqual(result[1].requirement_ids, ["req-3"]); // req-999 filtered out
  assert.ok(result.every((q) => q.state === "generated"));
});

test("skips technical/system-design when no eligible requirements exist, and skips company-fit with no brief", async () => {
  let calls = 0;
  globalThis.fetch = (async () => {
    calls++;
    return fakeRes(
      geminiBody(JSON.stringify({ questions: [{ prompt: "x", answer_outline: "y", difficulty: 1, requirement_ids: [] }] }))
    );
  }) as typeof fetch;

  const behaviouralOnly: Requirement[] = [{ id: "req-1", text: "Communication", kind: "behavioural", priority: "must" }];

  const result = await generateQuestions({
    requirements: behaviouralOnly,
    roleTitle: "Engineer",
    seniority: "Mid",
    companyBrief: null,
  });

  assert.equal(calls, 1); // only the behavioural category should have called the LLM at all
  assert.equal(result.length, 1);
  assert.equal(result[0].category, "behavioural");
});

test("company-fit still generates when a company brief exists, even with zero domain requirements", async () => {
  globalThis.fetch = (async () =>
    fakeRes(geminiBody(JSON.stringify({ questions: [{ prompt: "Why us?", answer_outline: "...", difficulty: 1, requirement_ids: [] }] })))) as typeof fetch;

  const technicalOnly: Requirement[] = [{ id: "req-1", text: "Go", kind: "technical", priority: "must" }];

  const result = await generateQuestions({
    requirements: technicalOnly,
    roleTitle: "Engineer",
    seniority: "Mid",
    companyBrief: { summary: "A company", what_they_do: "Does things" },
  });

  const companyFitQuestions = result.filter((q) => q.category === "company-fit");
  assert.equal(companyFitQuestions.length, 1);
});

test("categories param restricts generation to only the requested categories", async () => {
  let calls = 0;
  globalThis.fetch = (async () => {
    calls++;
    return fakeRes(
      geminiBody(JSON.stringify({ questions: [{ prompt: "x", answer_outline: "y", difficulty: 1, requirement_ids: ["req-1"] }] }))
    );
  }) as typeof fetch;

  const result = await generateQuestions({
    requirements,
    roleTitle: "Backend Engineer",
    seniority: "Senior",
    companyBrief: { summary: "s", what_they_do: "w" },
    categories: ["technical"],
  });

  assert.equal(calls, 1); // only the technical category should have run
  assert.ok(result.every((q) => q.category === "technical"));
});
