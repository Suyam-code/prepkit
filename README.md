# Interview Prep Kit

Turns a job description + a company's site into a personalised interview prep kit — a company brief, a breakdown of the role, a bank of categorised questions, flashcards, and a day-by-day study schedule. The kit is fully editable in the browser (edit, pin, regenerate a section) and comes with a practice mode.

**Live deployment:** https://prepkit-frontend-phi.vercel.app (frontend) · https://prepkit-backend-hh1p.onrender.com (backend)

> Render's free tier spins down after ~15 minutes of inactivity — the first request after a while can take up to ~50 seconds to wake it back up. That's expected, not a bug.

---

## Tech stack

Next.js (App Router) + Express + MongoDB, TypeScript throughout — the preferred stack, used as-is.

TypeScript specifically because the kit schema (Appendix A) is exact and shared between the API and the batch CLI: a single `zod`-validated type, imported by both, makes drift between them a compile-time error instead of a runtime surprise.

## LLM provider

**Groq**, model `openai/gpt-oss-120b` — but this wasn't the original plan, and the reason why is worth stating plainly rather than glossing over.

I started on **Google Gemini** (`gemini-3.6-flash`), chosen for its high per-minute token budget (safer for prompts carrying crawled page text) and native JSON-schema output mode. It worked well in development. Then, during live testing, I hit Gemini's free-tier **daily** request cap — 20 requests/day for that model, confirmed directly from Google's own quota-exceeded error message, not from documentation (which no longer publishes these numbers reliably). At roughly 6 LLM calls per kit, that's 3 kit generations a day — unworkable for iterative testing, let alone the batch CLI's "5 cases in 15 minutes" requirement.

I switched to Groq, whose published daily caps are dramatically higher. The switch took about 15 minutes of code changes because the LLM client (`backend/src/llm/client.ts`) was written provider-agnostic from the start: a single `callProviderRaw()` function switches on `LLM_PROVIDER`, and every other piece of the pipeline — rate limiting, retry/backoff, JSON-repair-on-invalid-output — is provider-independent. Switching providers changed one file.

Set via `LLM_PROVIDER=groq`, `GROQ_API_KEY`, `GROQ_MODEL=openai/gpt-oss-120b`. Gemini support is still in the same file (`LLM_PROVIDER=gemini`, `GEMINI_API_KEY`, `GEMINI_MODEL`) if you'd rather use it.

## High-level architecture

```
Next.js frontend  →  Express API  →  Orchestrator (shared/core)  →  MongoDB
  (Vercel)             (Render)         │                            (Atlas)
                                         ├─ crawler + SSRF guard + robots.txt
                                         ├─ extractRequirements (LLM)
                                         ├─ generateBrief (LLM)
                                         ├─ generateQuestions × 4 categories (LLM)
                                         ├─ coverage check + gap-fill loop
                                         ├─ generateFlashcards (LLM)
                                         └─ buildSchedule (deterministic)
```

`backend/src/pipeline/orchestrator.ts` is the **single implementation** of this sequence. Both the `POST /api/kits` route and `scripts/evaluate.ts` (the batch CLI) call it directly — neither has its own copy of the pipeline logic. Splitting the pipeline into small, single-purpose functions (one file per step) rather than one large function was a deliberate choice for testability: each step has its own unit tests with a mocked LLM, and the orchestrator itself has an end-to-end test that mocks every network call in one pass.

**Auth** is stateless JWT bearer tokens, not cookie sessions — a deliberate mid-project change. Frontend and backend live on different top-level domains (`vercel.app`, `onrender.com`), and cross-site cookies for that setup are increasingly blocked by default (Chrome in Incognito, Safari, Firefox) regardless of `SameSite`/`Secure` configuration. I found this out the hard way after deployment: login succeeded but the very next request came back unauthenticated. Bearer tokens sent explicitly in an `Authorization` header aren't cookies at all, so they sidestep the restriction entirely. The token is returned in the login/register response body and stored in `localStorage` on the frontend.

## Retrieval approach and sources

The company URL is crawled with no hardcoded path list (`backend/src/retrieval/crawler.ts`):

1. Fetch the root page. If it already looks like a hiring hub (rare, mostly small companies), use it directly.
2. Otherwise extract same-origin links from the page, scored by keyword match (`careers`, `jobs`, `hiring`, etc.) + placement (a nav/footer link scores higher than a random body link) + shallow path depth.
3. Fetch the top-scored candidates and **confirm** each one — a link's anchor text saying "careers" isn't proof it goes anywhere useful. Confirmation looks for real evidence: a mention of an ATS platform (Greenhouse, Lever, Workday, etc.) or phrases like "open positions" / "apply now."
4. If nothing confirms, fall back to the single best-scored candidate rather than giving up.
5. **If the origin site has nothing at all** — no candidate scored above zero — try exactly one hop to a "sibling site": a nav/footer link to another domain's bare homepage (the signature of a company linking to its own parent/corporate site), then repeat steps 1–4 there. Bounded to one hop, never chains further.

This last step exists because of a real case I hit during testing: `basecamp.com`'s own site has no conventional hiring-page link anywhere (their page names are deliberately quirky — `/underdogs`, `/handbook`, `/small`), but their footer links to `37signals.com`, whose own nav has a real `/jobs` page. Without the sibling hop, this company would come back as "not found" despite a findable hiring page existing one click away.

Every fetch goes through robots.txt compliance (fails open on a broken/missing robots.txt, fails closed on an explicit `Disallow` match) and an SSRF guard that resolves the hostname and rejects private/loopback/link-local addresses — including the cloud metadata IP `169.254.169.254` — checked against the *resolved* IP, not just the URL string, since DNS can be attacker-controlled.

**Known limitation:** searching for public discussion of a company's interview process (e.g. via a web-search API) was planned but not built — time went into hardening the crawler, the coverage loop, and the deployment path instead. The company brief is currently generated from crawled site content alone.

## Sequencing

Steps run in this order, each depending on the last where it needs to:

1. **`extractRequirements`** — the pasted JD → `role.requirements[]`. Runs concurrently with the crawl+brief step below, since neither depends on the other.
2. **crawl → `generateBrief`** — find the hiring page, then summarize it. If no page was found, this returns an honest placeholder ("couldn't find company information") rather than fabricating a brief from the company name alone.
3. **`generateQuestions`** — one LLM call *per category* (technical, behavioural, system-design, company-fit), not per requirement and not one call for everything. A requirement like "5 years of React" produces a different kind of question than "mentors junior engineers," and they shouldn't come from the same prompt with the same instructions. One call per requirement would also mean 60–80+ calls for a JD with 20 requirements — one call per category keeps it to at most 4.
4. **Coverage loop** — deterministic code (`coverageCheck.ts`, no LLM) diffs which requirement ids got referenced by at least one question. Any gap triggers a targeted LLM call that writes exactly one question per uncovered requirement, then checks again — capped at 2 extra passes. A requirement that genuinely can't be closed after that is reported in `coverage.uncovered_requirement_ids`, honestly, rather than retried forever or silently dropped.
5. **`generateFlashcards`** — one batched call across all requirements.
6. **`buildSchedule`** — deterministic, no LLM (see below).
7. **`validateKit`** — the fully assembled object is parsed against the exact Appendix A `zod` schema before it's ever saved or returned. A malformed kit throws here rather than reaching the database.

Two of these are deliberately kept out of the model's hands: coverage checking is a set comparison, and schedule allocation is arithmetic. Both live in plain code with their own unit tests, not a prompt.

## Generated / edited / pinned state

Every question and flashcard carries a `state: "generated" | "edited" | "pinned"`, stored inline on the item itself.

- **`generated`** — produced by the model, safe to overwrite on regeneration.
- **`edited`** — the user changed it. `PATCH /:id/questions/:qid` always forces this transition server-side regardless of what the client sends, so a buggy or malicious client can't mark something back to `generated` and expose it to being silently overwritten.
- **`pinned`** — explicitly locked via a Pin button. Behaves identically to `edited` in regeneration (both survive), but is a distinct, user-facing signal of deliberate curation.

**Regenerating a section** (`regenerateSection.ts`) partitions that section's items into kept (`edited`/`pinned`) and replaceable (`generated`), calls the LLM fresh only for a new batch of `generated` items, merges kept + new, then re-runs the coverage loop over the *entire* question set (since regenerating one category can shift which requirements are covered) and rebuilds the schedule to match. Every item in the merged result gets a fresh sequential id — ids are never trusted to stay stable across separate generation calls anywhere in this pipeline, the same reasoning applies here.

Unpinning reverts to `edited`, not `generated` — a safer default, since `edited` is still protected from a future regenerate.

## Schedule allocation

Deterministic, in `backend/src/pipeline/schedule.ts` — no LLM call.

1. Order questions by urgency: any question testing a `must`-priority requirement comes first, then by category (technical → system-design → behavioural → company-fit, on the theory that foundations come before applying them, and company-fit is usually front-of-mind right before the interview rather than early prep), then by ascending difficulty within a tier.
2. Estimate a study-time cost per question (a category baseline + a difficulty component — system-design questions inherently take longer to work through regardless of difficulty).
3. Greedily bin-pack into `days_available` days against an even per-day time-budget target.
4. **Rebalance pass:** the greedy pack in step 3 decides "move to the next day" only *after* adding a question, so early days can slightly overshoot their fair share — by the last day there can be nothing left, even when there was enough content for every day to get something. I found this exact bug live (a 5-day, 13-question schedule left day 5 completely empty while day 1–4 were each slightly over-full). The fix: for each day that ends up empty, pull the lowest-priority question off whichever day currently has the most minutes *and* more than one question — donating from a single-question day would just relocate the emptiness rather than fix it. This is covered by a regression test that reproduces the original bug shape.

Always returns exactly `daysAvailable` day entries — trailing "Rest day" entries if there's more days than content, a heavier last day if there's more content than days — and every question is scheduled in exactly one day, an invariant with its own test.

## What goes beyond the minimum spec

The crawler's sibling-site hop (described above) wasn't strictly required — the brief asks for ranking links and fetching what looks right on the given site, not following a company's presence across domains. I added it after hitting a real case where a naive same-origin-only crawler would have wrongly reported "no hiring page found" for a company that genuinely has one, one click away on a related domain.

## Key design decisions, trade-offs, and known limitations

- **No public-discussion search implemented** (see Retrieval section above) — the honest gap, not papered over.
- **No drag-to-reorder** in the builder. Edit, pin, and regenerate-a-section are implemented and tested; manual reordering of questions/flashcards within a section is not.
- **`role.responsibilities` and `source.location`** are not separately extracted from the JD — both validate fine as empty per the schema, they're just not populated with real content. The substantive content lives in `role.requirements` instead.
- **Batch CLI runs cases sequentially**, not in parallel — a free-tier rate limit is a per-minute ceiling shared across the whole process, so running cases concurrently just trades slower individual failures for faster limit-hits; the shared rate limiter in `llm/client.ts` throttles correctly either way, sequential execution just makes that throttling predictable rather than a burst-then-stall pattern.
- **Sessions were dropped for JWTs** mid-project once cross-domain deployment surfaced the cookie problem (see Architecture section) — a real example of a decision changing after contact with production, not a decision made in the abstract.
- **The schedule's rebalance step is a heuristic**, not an optimal solution to what's actually a bin-packing/knapsack-shaped problem — it fixes the specific "day left empty despite enough content" failure mode without claiming perfectly even day-to-day load.
- **Kit generation is synchronous** on the API (`POST /api/kits` blocks for the full ~30–90s pipeline run rather than returning immediately with a job id to poll). This was a deliberate scope cut to prioritize the pipeline and builder over a polling/job-status UI; the frontend shows a loading state during the wait rather than leaving the request looking hung.

## Setup

### Local development

```bash
git clone https://github.com/Suyam-code/prepkit.git
cd prepkit
npm install

cp backend/.env.example backend/.env      # fill in MONGODB_URI, SESSION_SECRET, GROQ_API_KEY, etc.
cp frontend/.env.example frontend/.env.local

npm run build --workspace shared          # backend and frontend both depend on this

npm run dev:backend     # http://localhost:4000
npm run dev:frontend    # http://localhost:3000
```

Requires a MongoDB URI (Atlas free tier or local) and a Groq API key (`console.groq.com`, free tier).

### Batch entry point

```bash
cd backend
npm run evaluate -- --input cases.json --output kits.json
```

`cases.json` is an array of `{ id, jd, company_url, days }` per Appendix B. Output matches the Appendix B shape, with one `{ id, status, kit, error }` entry per case — a single failing case is recorded, not fatal to the run.

### Environment variables

| Variable | Used by | Purpose |
|---|---|---|
| `MONGODB_URI` | backend | Database connection string |
| `SESSION_SECRET` | backend | JWT signing secret (name predates the switch away from cookie sessions) |
| `LLM_PROVIDER` | backend | `groq` or `gemini` |
| `GROQ_API_KEY` / `GROQ_MODEL` | backend | Groq credentials + model |
| `GEMINI_API_KEY` / `GEMINI_MODEL` | backend | Gemini credentials + model (alternative provider) |
| `LLM_RPM` | backend | Requests-per-minute ceiling for the shared rate limiter (default 10) |
| `FRONTEND_ORIGIN` | backend | CORS allow-origin — the deployed frontend URL |
| `NODE_ENV` | backend | `production` enables secure/cross-site cookie-adjacent settings and trusts the reverse proxy |
| `NEXT_PUBLIC_API_BASE` | frontend | The backend's base URL, e.g. `https://prepkit-backend-hh1p.onrender.com/api` |

### Deployed on

- **Frontend:** Vercel (root directory `frontend`, builds `shared` first)
- **Backend:** Render free tier (build: `npm install && npm run build --workspace shared && npm run build --workspace backend`, start: `npm run start:backend`)
- **Database:** MongoDB Atlas free tier (M0)

## Tests

```bash
cd backend
npx tsx --test src/**/*.test.ts
```

59 tests, no live network calls (every LLM/HTTP call is mocked) — covers the rate limiter and retry/backoff logic, JSON-repair on malformed model output, the SSRF guard's IP-range checks, the crawler's confirm/fallback/sibling-hop behavior, deterministic coverage checking, the schedule allocator (including the rebalance-fix regression test), and the regenerate-section merge logic (edited/pinned survive, generated items replaced, other sections untouched).
