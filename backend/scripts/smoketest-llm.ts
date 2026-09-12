import "dotenv/config";
import { z } from "zod";
import { callLLM } from "../src/llm/client";

async function main() {
  const schema = z.object({
    fact: z.string(),
    confidence: z.number().min(0).max(1),
  });

  const result = await callLLM({
    prompt:
      'Return JSON only: {"fact": "<one true short fact about MongoDB>", "confidence": <0 to 1>}',
    schema,
  });

  console.log("LLM client works. Response:", result);
}

main().catch((err) => {
  console.error("Smoke test failed:", err);
  process.exit(1);
});
