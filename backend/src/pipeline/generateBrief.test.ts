import { test } from "node:test";
import assert from "node:assert/strict";
import { generateBrief } from "./generateBrief";

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

test("generates a brief from crawled page text and records the source", async () => {
  globalThis.fetch = (async () =>
    fakeRes(
      geminiBody(
        JSON.stringify({
          summary: "A fintech company building payment infrastructure.",
          what_they_do: "Processes transactions for merchants at scale.",
        })
      )
    )) as typeof fetch;

  const result = await generateBrief({
    companyName: "Acme Pay",
    hiringPageUrl: "https://acmepay.com/careers",
    hiringPageText: "Acme Pay builds payment infrastructure for merchants...",
  });

  assert.equal(result.summary, "A fintech company building payment infrastructure.");
  assert.deepEqual(result.sources, ["https://acmepay.com/careers"]);
});

test("degrades gracefully without calling the LLM when no hiring page was found", async () => {
  let called = false;
  globalThis.fetch = (async () => {
    called = true;
    return fakeRes(geminiBody(JSON.stringify({ summary: "x", what_they_do: "y" })));
  }) as typeof fetch;

  const result = await generateBrief({
    companyName: "Acme Pay",
    hiringPageUrl: null,
    hiringPageText: null,
  });

  assert.equal(called, false);
  assert.ok(result.summary.includes("Acme Pay"));
  assert.deepEqual(result.sources, []);
});
