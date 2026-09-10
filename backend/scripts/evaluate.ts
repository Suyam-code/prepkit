/**
 * npm run evaluate -- --input <cases.json> --output <kits.json>
 *
 * Reads Appendix-B input cases, runs the SAME orchestrator the API uses
 * (pipeline/orchestrator.ts — not built yet, next phase), and writes
 * Appendix-B shaped output. One case failing must not abort the run.
 *
 * Intentionally left as a stub with the CLI parsing + I/O + error
 * handling already correct, so that wiring in the real orchestrator
 * later is a one-line change (see TODO below) rather than a rewrite.
 */
import fs from "node:fs/promises";
import mongoose from "mongoose";
import {
  BatchInputSchema,
  BatchOutputSchema,
  type BatchCase,
  type BatchResult,
} from "@prepkit/shared";

function parseArgs(argv: string[]) {
  const out: { input?: string; output?: string } = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--input") out.input = argv[++i];
    if (argv[i] === "--output") out.output = argv[++i];
  }
  if (!out.input || !out.output) {
    throw new Error("Usage: evaluate -- --input <cases.json> --output <kits.json>");
  }
  return out as { input: string; output: string };
}

async function runCase(kase: BatchCase): Promise<BatchResult> {
  try {
    // TODO (pipeline phase): replace with
    //   const kit = await orchestrator.run({ jd: kase.jd, company_url: kase.company_url, days: kase.days });
    //   return { id: kase.id, status: "ok", kit, error: null };
    throw new Error("orchestrator not implemented yet");
  } catch (err) {
    return {
      id: kase.id,
      status: "failed",
      kit: null,
      error: {
        code: "PIPELINE_ERROR",
        message: err instanceof Error ? err.message : "Unknown error",
      },
    };
  }
}

async function main() {
  const { input, output } = parseArgs(process.argv.slice(2));

  const raw = JSON.parse(await fs.readFile(input, "utf-8"));
  const cases = BatchInputSchema.parse(raw);

  const results: BatchResult[] = [];
  for (const kase of cases) {
    // Sequential on purpose: free-tier LLM rate limits are per-minute,
    // not per-request, so concurrency just trades faster failures for
    // faster limit-hits. The rate limiter in llm/client.ts still applies
    // per call regardless.
    const result = await runCase(kase);
    results.push(result);
  }

  const batchOutput = BatchOutputSchema.parse({
    version: "1.0",
    generated_at: new Date().toISOString(),
    kits: results,
  });

  await fs.writeFile(output, JSON.stringify(batchOutput, null, 2));
  console.log(`Wrote ${results.length} result(s) to ${output}`);

  const failed = results.filter((r) => r.status === "failed").length;
  if (failed > 0) console.log(`${failed} case(s) failed — see error field per case.`);

  await mongoose.disconnect().catch(() => {});
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
