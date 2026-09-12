import type { Flashcard, Question, Requirement } from "@prepkit/shared";
import { generateQuestions } from "./generateQuestions";
import { generateFlashcards } from "./generateFlashcards";
import { closeCoverageGaps } from "./coverageLoop";

type QuestionCategory = Question["category"];

interface CompanyBriefInput {
  summary: string;
  what_they_do: string;
}

export interface RegenerateQuestionCategoryResult {
  questions: Question[];
  uncovered_requirement_ids: string[];
  passes: number;
}

/**
 * Regenerates one question category in place:
 *  - questions in OTHER categories are untouched
 *  - within this category, `edited`/`pinned` items are kept exactly as-is
 *  - only `generated` items in this category are replaced with fresh ones
 *  - coverage is re-checked (and gap-filled if needed) across the WHOLE
 *    merged set afterward, since regenerating one category can shift
 *    which requirements are covered
 *  - every question gets a fresh sequential id in the returned list —
 *    same reasoning as everywhere else in this pipeline: ids are never
 *    trusted to stay stable across separate generation calls, so callers
 *    (the API route) should treat the full returned list as the new
 *    source of truth rather than trying to reconcile old ids.
 */
export async function regenerateQuestionCategory(params: {
  category: QuestionCategory;
  allQuestions: Question[];
  requirements: Requirement[];
  roleTitle: string;
  seniority: string;
  companyBrief?: CompanyBriefInput | null;
}): Promise<RegenerateQuestionCategoryResult> {
  const { category, allQuestions, requirements, roleTitle, seniority, companyBrief } = params;

  const otherCategories = allQuestions.filter((q) => q.category !== category);
  const keptInThisCategory = allQuestions.filter((q) => q.category === category && q.state !== "generated");

  const freshlyGenerated = await generateQuestions({
    requirements,
    roleTitle,
    seniority,
    companyBrief,
    categories: [category],
  });

  const merged = [...otherCategories, ...keptInThisCategory, ...freshlyGenerated];

  const { questions, uncovered_requirement_ids, passes } = await closeCoverageGaps(
    merged,
    requirements,
    roleTitle,
    seniority
  );

  return { questions, uncovered_requirement_ids, passes };
}

/**
 * Regenerates flashcards: keeps edited/pinned cards as-is, replaces only
 * generated ones, re-ids the merged set sequentially.
 */
export async function regenerateFlashcards(params: {
  allFlashcards: Flashcard[];
  requirements: Requirement[];
  roleTitle: string;
  seniority: string;
}): Promise<Flashcard[]> {
  const { allFlashcards, requirements, roleTitle, seniority } = params;

  const kept = allFlashcards.filter((c) => c.state !== "generated");
  const freshlyGenerated = await generateFlashcards({ requirements, roleTitle, seniority });

  return [...kept, ...freshlyGenerated].map((c, i) => ({ ...c, id: `fc-${i + 1}` }));
}
