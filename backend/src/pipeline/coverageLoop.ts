import type { Question, Requirement } from "@prepkit/shared";
import { checkCoverage } from "./coverageCheck";
import { fillCoverageGaps } from "./fillCoverageGaps";

export interface CoverageLoopResult {
  questions: Question[];
  uncovered_requirement_ids: string[];
  /** Number of *additional* gap-fill passes beyond the initial generation — 0 if nothing needed filling. */
  passes: number;
}

// Bounded on purpose: if a requirement genuinely can't be turned into a
// question after a couple of honest attempts, that's reported via
// uncovered_requirement_ids in the final kit rather than retried forever.
const MAX_PASSES = 2;

/**
 * Runs generate -> check -> fill-gaps -> check again, capped at
 * MAX_PASSES additional passes beyond whatever generateQuestions()
 * already produced. Every question in the final merged set gets a
 * fresh, globally sequential id — regardless of which pass produced it —
 * for the same reason ids are assigned in code everywhere else in this
 * pipeline: never trust the model for uniqueness across separate calls.
 */
export async function closeCoverageGaps(
  initialQuestions: Question[],
  requirements: Requirement[],
  roleTitle: string,
  seniority: string
): Promise<CoverageLoopResult> {
  let questions = initialQuestions;
  let passes = 0;

  let coverage = checkCoverage(requirements, questions);

  while (coverage.uncovered_requirement_ids.length > 0 && passes < MAX_PASSES) {
    const stillUncovered = requirements.filter((r) => coverage.uncovered_requirement_ids.includes(r.id));
    const gapQuestions = await fillCoverageGaps(stillUncovered, roleTitle, seniority);
    questions = [...questions, ...gapQuestions];
    passes++;
    coverage = checkCoverage(requirements, questions);
  }

  const reIded = questions.map((q, i) => ({ ...q, id: `q-${i + 1}` }));

  return { questions: reIded, uncovered_requirement_ids: coverage.uncovered_requirement_ids, passes };
}
