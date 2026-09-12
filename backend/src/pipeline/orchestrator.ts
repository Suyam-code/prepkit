import type { Kit } from "@prepkit/shared";
import { findHiringPage } from "../retrieval/crawler";
import { generateBrief } from "./generateBrief";
import { extractRequirements } from "./extractRequirements";
import { generateQuestions } from "./generateQuestions";
import { closeCoverageGaps } from "./coverageLoop";
import { generateFlashcards } from "./generateFlashcards";
import { buildSchedule } from "./schedule";
import { validateKit } from "./validateKit";

export interface RunOrchestratorParams {
  jd: string;
  company_url: string;
  days: number;
}

// A light heuristic to pull a role title + seniority out of the JD's
// first line, since the user doesn't supply these as separate fields.
// Nothing downstream depends on high precision here — it's a label, not
// a requirement.
function guessRoleTitleAndSeniority(jd: string): { title: string; seniority: string } {
  const firstLine = jd.trim().split("\n")[0]?.trim() || "the role";
  const seniorityMatch = firstLine.match(/\b(junior|mid-level|mid|senior|staff|principal|lead)\b/i);
  const seniority = seniorityMatch ? seniorityMatch[0] : "the level implied by the job description";
  return { title: firstLine.slice(0, 120), seniority };
}

function guessCompanyName(companyUrl: string): string {
  try {
    const host = new URL(companyUrl).hostname.replace(/^www\./, "");
    return host.split(".")[0];
  } catch {
    return "the company";
  }
}

/**
 * Runs the full pipeline end to end:
 *   crawl -> brief, extract requirements (in parallel) -> generate
 *   questions -> close coverage gaps -> generate flashcards -> build the
 *   schedule -> validate the assembled kit against Appendix A.
 *
 * This is the ONE place the sequence is implemented. The API route
 * (kits.ts) and the batch CLI (scripts/evaluate.ts) both call this
 * function directly rather than each having their own copy of the
 * pipeline — required by the brief's "same code your application uses,
 * not a parallel implementation" note.
 *
 * Known gaps, deliberately left for a later pass rather than blocking
 * this piece: role.responsibilities and source.location are not
 * separately extracted yet (both validate fine as empty per the schema,
 * they just aren't populated with real content). Easiest fix later is
 * extending extractRequirements's prompt to also return these.
 */
export async function runOrchestrator(params: RunOrchestratorParams): Promise<Kit> {
  const { jd, company_url, days } = params;
  const trimmedJd = jd.trim();
  if (trimmedJd.length === 0) {
    throw new Error("Job description is empty");
  }

  const { title: roleTitle, seniority } = guessRoleTitleAndSeniority(trimmedJd);
  const companyName = guessCompanyName(company_url);

  const crawl = await findHiringPage(company_url);

  // Independent of each other — run concurrently rather than sequentially.
  const [companyBrief, requirements] = await Promise.all([
    generateBrief({
      companyName,
      hiringPageUrl: crawl.hiringPageUrl,
      hiringPageText: crawl.hiringPageText,
    }),
    extractRequirements(trimmedJd),
  ]);

  // Only pass a real brief into question generation if we actually found
  // one — the degraded placeholder brief (see generateBrief.ts) isn't
  // something worth grounding company-fit questions in.
  const realCompanyBrief = crawl.hiringPageText ? companyBrief : null;

  const initialQuestions = await generateQuestions({
    requirements,
    roleTitle,
    seniority,
    companyBrief: realCompanyBrief,
  });

  const { questions, uncovered_requirement_ids, passes } = await closeCoverageGaps(
    initialQuestions,
    requirements,
    roleTitle,
    seniority
  );

  const flashcards = await generateFlashcards({ requirements, roleTitle, seniority });

  const schedule = buildSchedule({ questions, requirements, daysAvailable: days });

  const kit = {
    source: {
      company: companyName,
      company_url,
      role: roleTitle,
      location: "",
      jd_chars: trimmedJd.length,
      researched_at: new Date().toISOString(),
      pages_used: crawl.pagesUsed,
    },
    company_brief: companyBrief,
    role: {
      title: roleTitle,
      seniority,
      responsibilities: [] as string[],
      requirements,
    },
    questions,
    flashcards,
    schedule,
    coverage: {
      uncovered_requirement_ids,
      passes,
    },
  };

  return validateKit(kit);
}
