import { test } from "node:test";
import assert from "node:assert/strict";
import { runOrchestrator } from "./orchestrator";
import { __setRateLimiterForTests } from "../llm/client";

__setRateLimiterForTests(1000, 1000); // effectively unthrottled for this test file

function geminiEnvelope(payload: unknown) {
  return { candidates: [{ content: { parts: [{ text: JSON.stringify(payload) }] } }] };
}

function htmlRes(body: string, url: string) {
  return {
    ok: true,
    status: 200,
    url,
    headers: { get: (k: string) => (k.toLowerCase() === "content-type" ? "text/html" : null) },
    text: async () => body,
  } as unknown as Response;
}

function geminiRes(payload: unknown) {
  return {
    ok: true,
    status: 200,
    headers: { get: () => null },
    json: async () => geminiEnvelope(payload),
    text: async () => JSON.stringify(geminiEnvelope(payload)),
  } as unknown as Response;
}

function robotsRes() {
  return {
    ok: true,
    status: 200,
    url: "",
    headers: { get: () => "text/plain" },
    text: async () => "User-agent: *\nAllow: /",
  } as unknown as Response;
}

const NOT_FOUND = { ok: false, status: 404, url: "", headers: { get: () => null }, text: async () => "" } as unknown as Response;

test("runs the full pipeline end to end and produces a schema-valid, internally consistent kit", async () => {
  globalThis.fetch = (async (input: unknown, init?: RequestInit) => {
    const url = typeof input === "string" ? input : (input as URL).toString();

    if (url.endsWith("/robots.txt")) return robotsRes();
    if (url === "https://acme.com/") {
      return htmlRes(`<html><body><nav><a href="/careers">Careers</a></nav></body></html>`, url);
    }
    if (url === "https://acme.com/careers") {
      return htmlRes(
        `<html><body><h1>Careers at Acme</h1><p>Apply now via our greenhouse.io listings.</p></body></html>`,
        url
      );
    }

    // Everything else is a Gemini call — route by a unique marker in the request body.
    const bodyStr = typeof init?.body === "string" ? init.body : "";

    if (bodyStr.includes("extract the distinct, individually-testable requirements")) {
      return geminiRes({
        requirements: [
          { text: "Go experience", kind: "technical", priority: "must" },
          { text: "Mentoring", kind: "behavioural", priority: "must" },
        ],
      });
    }
    if (bodyStr.includes("writing a short company brief")) {
      return geminiRes({ summary: "Acme is a fintech company.", what_they_do: "Processes payments." });
    }
    if (bodyStr.includes("Write hands-on technical questions")) {
      return geminiRes({
        questions: [{ prompt: "Explain goroutines", answer_outline: "...", difficulty: 2, requirement_ids: ["req-1"] }],
      });
    }
    if (bodyStr.includes("Write behavioural questions")) {
      return geminiRes({
        questions: [{ prompt: "Tell me about mentoring", answer_outline: "...", difficulty: 1, requirement_ids: ["req-2"] }],
      });
    }
    if (bodyStr.includes("Write open-ended system/architecture design questions")) {
      return geminiRes({ questions: [] });
    }
    if (bodyStr.includes("Write questions that probe genuine interest")) {
      return geminiRes({ questions: [{ prompt: "Why Acme?", answer_outline: "...", difficulty: 1, requirement_ids: [] }] });
    }
    if (bodyStr.includes("writing exactly one interview question per requirement")) {
      return geminiRes({ questions: [] }); // shouldn't actually be hit — coverage should already be complete
    }
    if (bodyStr.includes("quick-review flashcards")) {
      return geminiRes({
        flashcards: [
          { front: "Goroutine", back: "A lightweight thread in Go.", requirement_ids: ["req-1"] },
          { front: "Mentoring", back: "Guiding a junior engineer's growth.", requirement_ids: ["req-2"] },
        ],
      });
    }

    return NOT_FOUND;
  }) as typeof fetch;

  const kit = await runOrchestrator({
    jd: "Senior Backend Engineer\nWe need Go experience and mentoring skills.",
    company_url: "https://acme.com/",
    days: 3,
  });

  assert.equal(kit.source.pages_used.length, 2);
  assert.equal(kit.role.requirements.length, 2);
  assert.equal(kit.questions.length, 3); // technical(1) + behavioural(1) + company-fit(1); system-design returned none
  assert.deepEqual(kit.coverage.uncovered_requirement_ids, []);
  assert.equal(kit.coverage.passes, 0); // fully covered by the first generation pass — gap-fill never needed
  assert.equal(kit.flashcards.length, 2);
  assert.equal(kit.schedule.days_available, 3);
  assert.equal(kit.schedule.days.length, 3);

  const scheduledIds = kit.schedule.days.flatMap((d) => d.question_ids);
  assert.deepEqual(
    scheduledIds.sort(),
    kit.questions.map((q) => q.id).sort()
  );
});

test("degrades gracefully into a valid kit when the company site is entirely unreachable", async () => {
  globalThis.fetch = (async (input: unknown, init?: RequestInit) => {
    const url = typeof input === "string" ? input : (input as URL).toString();
    if (url.endsWith("/robots.txt")) return robotsRes();
    if (url === "https://unreachable.example/") return NOT_FOUND;

    const bodyStr = typeof init?.body === "string" ? init.body : "";
    if (bodyStr.includes("extract the distinct")) {
      return geminiRes({ requirements: [{ text: "Python", kind: "technical", priority: "must" }] });
    }
    if (bodyStr.includes("Write hands-on technical questions")) {
      return geminiRes({ questions: [{ prompt: "Q", answer_outline: "A", difficulty: 1, requirement_ids: ["req-1"] }] });
    }
    // system-design, behavioural, company-fit, gap-fill, flashcards — all default to empty, valid responses
    return geminiRes({ questions: [], flashcards: [] });
  }) as typeof fetch;

  const kit = await runOrchestrator({
    jd: "Python engineer needed.",
    company_url: "https://unreachable.example/",
    days: 2,
  });

  assert.equal(kit.source.pages_used.length, 0);
  assert.equal(kit.company_brief.sources.length, 0);
  assert.ok(kit.company_brief.summary.length > 0); // honest placeholder, not blank
  assert.equal(kit.role.requirements.length, 1);
  assert.equal(kit.schedule.days_available, 2);
});

test("rejects an empty job description before doing any work", async () => {
  let called = false;
  globalThis.fetch = (async () => {
    called = true;
    return NOT_FOUND;
  }) as typeof fetch;

  await assert.rejects(() => runOrchestrator({ jd: "   ", company_url: "https://acme.com/", days: 3 }));
  assert.equal(called, false);
});
