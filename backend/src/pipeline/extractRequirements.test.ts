import { test } from "node:test";
import assert from "node:assert/strict";
import { extractRequirements } from "./extractRequirements";

function geminiBody(text: string) {
  return { candidates: [{ content: { parts: [{ text }] } }] };
}

function fakeRes(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

test("extracts requirements and assigns deterministic sequential ids", async () => {
  const payload = {
    requirements: [
      { text: "3+ years of React experience", kind: "technical", priority: "must" },
      { text: "Experience mentoring junior engineers", kind: "behavioural", priority: "nice" },
    ],
  };
  globalThis.fetch = (async () => fakeRes(200, geminiBody(JSON.stringify(payload)))) as typeof fetch;

  const result = await extractRequirements("We need a senior React engineer...");
  assert.equal(result.length, 2);
  assert.equal(result[0].id, "req-1");
  assert.equal(result[1].id, "req-2");
  assert.equal(result[0].kind, "technical");
  assert.equal(result[1].priority, "nice");
});

test("dedupes near-identical requirements (case/whitespace insensitive)", async () => {
  const payload = {
    requirements: [
      { text: "Strong SQL skills", kind: "technical", priority: "must" },
      { text: "  strong   sql skills  ", kind: "technical", priority: "must" },
      { text: "Excellent communication", kind: "behavioural", priority: "must" },
    ],
  };
  globalThis.fetch = (async () => fakeRes(200, geminiBody(JSON.stringify(payload)))) as typeof fetch;

  const result = await extractRequirements("JD text");
  assert.equal(result.length, 2);
  assert.deepEqual(
    result.map((r) => r.id),
    ["req-1", "req-2"]
  );
});

test("rejects an empty job description without calling the LLM", async () => {
  let called = false;
  globalThis.fetch = (async () => {
    called = true;
    return fakeRes(200, geminiBody("{}"));
  }) as typeof fetch;

  await assert.rejects(() => extractRequirements("   "));
  assert.equal(called, false);
});
