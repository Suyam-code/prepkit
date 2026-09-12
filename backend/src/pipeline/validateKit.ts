import { KitSchema, type Kit } from "@prepkit/shared";

/**
 * Parses the fully-assembled kit against the exact Appendix A schema.
 * Throws a clear, structured zod error rather than silently returning a
 * malformed object — the orchestrator lets this propagate so a bad kit
 * is never saved or written to batch output as if it succeeded.
 */
export function validateKit(kit: unknown): Kit {
  return KitSchema.parse(kit);
}
