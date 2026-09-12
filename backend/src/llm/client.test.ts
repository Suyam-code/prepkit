import { test } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { callLLM, LLMError, RateLimiter } from "./client";

function geminiBody(text: string) {
  return { candidates: [{ content: { parts: [{ text }] } }] };
}

function fakeRes(status: number, body: unknown, headers: Record<string, string> = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (k: string) => headers[k.toLowerCase()] ?? null },
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

const schema = z.object({ ok: z.boolean() });

test("succeeds on first try with valid JSON", async () => {
  globalThis.fetch = (async () => fakeRes(200, geminiBody(JSON.stringify({ ok: true })))) as typeof fetch;
  const result = await callLLM({ prompt: "x", schema });
  assert.deepEqual(result, { ok: true });
});

test("retries past a 429 (honoring Retry-After) and succeeds", async () => {
  let calls = 0;
  globalThis.fetch = (async () => {
    calls++;
    if (calls === 1) return fakeRes(429, { error: "rate limited" }, { "retry-after": "0" });
    return fakeRes(200, geminiBody(JSON.stringify({ ok: true })));
  }) as typeof fetch;

  const result = await callLLM({ prompt: "x", schema, maxTransientRetries: 2 });
  assert.deepEqual(result, { ok: true });
  assert.equal(calls, 2);
});

test("throws immediately on a non-transient error (400) — no retry burned", async () => {
  let calls = 0;
  globalThis.fetch = (async () => {
    calls++;
    return fakeRes(400, { error: "bad request" });
  }) as typeof fetch;

  await assert.rejects(() => callLLM({ prompt: "x", schema, maxTransientRetries: 3 }), LLMError);
  assert.equal(calls, 1);
});

test("repairs malformed (non-JSON) output on the second attempt", async () => {
  let calls = 0;
  globalThis.fetch = (async () => {
    calls++;
    if (calls === 1) return fakeRes(200, geminiBody("not valid json{"));
    return fakeRes(200, geminiBody(JSON.stringify({ ok: true })));
  }) as typeof fetch;

  const result = await callLLM({ prompt: "x", schema, maxRepairRetries: 1 });
  assert.deepEqual(result, { ok: true });
  assert.equal(calls, 2);
});

test("repairs schema-invalid JSON on the second attempt", async () => {
  let calls = 0;
  globalThis.fetch = (async () => {
    calls++;
    if (calls === 1) return fakeRes(200, geminiBody(JSON.stringify({ ok: "not-a-boolean" })));
    return fakeRes(200, geminiBody(JSON.stringify({ ok: true })));
  }) as typeof fetch;

  const result = await callLLM({ prompt: "x", schema, maxRepairRetries: 1 });
  assert.deepEqual(result, { ok: true });
  assert.equal(calls, 2);
});

test("throws after exhausting repair retries on persistently bad JSON", async () => {
  globalThis.fetch = (async () => fakeRes(200, geminiBody("still not json"))) as typeof fetch;
  await assert.rejects(() => callLLM({ prompt: "x", schema, maxRepairRetries: 1 }), LLMError);
});

test("RateLimiter delays a call once the window is full", async () => {
  const rl = new RateLimiter(2, 200); // 2 calls per 200ms — small window so the test stays fast
  const start = Date.now();
  await rl.acquire();
  await rl.acquire();
  await rl.acquire(); // 3rd call must wait for the window to slide
  const elapsed = Date.now() - start;
  assert.ok(elapsed >= 150, `expected the 3rd call to be delayed, only waited ${elapsed}ms`);
});
