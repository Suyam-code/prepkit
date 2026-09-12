import type { Requirement, Question } from "@prepkit/shared";

export interface CoverageResult {
  uncovered_requirement_ids: string[];
}

/**
 * Pure, deterministic comparison — no LLM involved, by design (see the
 * architecture doc: arithmetic/comparison belongs to code, not a model).
 * A requirement counts as covered if at least one question's
 * requirement_ids includes it. Order of the result follows the order
 * requirements were given, not insertion order, so it's stable across runs.
 */
export function checkCoverage(requirements: Requirement[], questions: Question[]): CoverageResult {
  const covered = new Set<string>();
  for (const q of questions) {
    for (const id of q.requirement_ids) covered.add(id);
  }
  const uncovered = requirements.filter((r) => !covered.has(r.id)).map((r) => r.id);
  return { uncovered_requirement_ids: uncovered };
}
