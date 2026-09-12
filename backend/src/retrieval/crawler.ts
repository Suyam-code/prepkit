import * as cheerio from "cheerio";
import { isAllowedByRobots } from "./robots";
import { assertPublicHttpUrl } from "./urlSafety";

const MAX_PAGE_CHARS = 2_000_000; // ~2MB of HTML text, generous but bounded
const FETCH_TIMEOUT_MS = 8_000;
const MAX_CANDIDATES_TO_INSPECT = 5; // how many scored links we'll actually fetch and check

// Keywords alone are a weak signal (a footer often links to a generic
// "careers" page that's just a stub). We score by keyword + placement,
// then *confirm* the top candidates by looking for on-page evidence of a
// real hiring page before committing to one.
const HIRING_KEYWORDS = [
  "careers",
  "career",
  "jobs",
  "job",
  "hiring",
  "join us",
  "join-us",
  "work with us",
  "work at",
  "life at",
  "opportunities",
  "vacancy",
  "vacancies",
  "openings",
  "open positions",
  "employment",
];

// If a candidate page mentions/links one of these, it's very likely the
// real hiring page (companies almost always route applications through
// one of these ATS platforms rather than rolling their own).
const ATS_HOST_HINTS = [
  "greenhouse.io",
  "lever.co",
  "myworkdayjobs.com",
  "ashbyhq.com",
  "bamboohr.com",
  "smartrecruiters.com",
  "jobvite.com",
  "breezy.hr",
  "recruitee.com",
  "workable.com",
  "icims.com",
];

const ON_PAGE_SIGNALS = ["open position", "apply now", "view all jobs", "current openings", "job listing"];

export interface CrawlResult {
  hiringPageUrl: string | null;
  hiringPageText: string | null;
  /** Every URL actually fetched successfully — feeds source.pages_used in Appendix A. */
  pagesUsed: string[];
}

interface FetchedPage {
  html: string;
  finalUrl: string;
}

async function fetchPage(url: string): Promise<FetchedPage | null> {
  await assertPublicHttpUrl(url); // throws UnsafeUrlError — let it propagate, this is a hard stop

  if (!(await isAllowedByRobots(url))) return null;

  let res: Response;
  try {
    res = await fetch(url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { "User-Agent": "PrepKitBot/1.0 (+interview prep tool; respects robots.txt)" },
    });
  } catch {
    return null; // timeout, DNS failure, connection refused, etc. — treat as "couldn't get this page"
  }

  if (!res.ok) return null;

  const contentType = res.headers.get("content-type") || "";
  if (!contentType.includes("text/html")) return null;

  const html = await res.text();
  if (html.length > MAX_PAGE_CHARS) return null;

  return { html, finalUrl: res.url || url };
}

function scoreLink(href: string, anchorText: string, location: "nav" | "footer" | "body"): number {
  const haystack = `${href} ${anchorText}`.toLowerCase();
  let score = 0;
  for (const kw of HIRING_KEYWORDS) {
    if (haystack.includes(kw)) score += kw.length > 6 ? 3 : 2;
  }
  if (score === 0) return 0;
  if (location === "nav") score += 3;
  if (location === "footer") score += 1;

  const depth = new URL(href).pathname.split("/").filter(Boolean).length;
  if (depth <= 2) score += 2; // shallow paths are more likely top-level nav destinations

  return score;
}

interface CandidateExtraction {
  sameOrigin: Array<{ url: string; score: number }>;
  /** Cross-origin nav/footer links to another site's bare homepage — a candidate "sibling" site (e.g. a product site linking to its parent company's site) worth one hop, since the company's own hiring info may live there instead. */
  siblingSites: string[];
}

function extractCandidateLinks(html: string, baseUrl: string): CandidateExtraction {
  const $ = cheerio.load(html);
  const origin = new URL(baseUrl).origin;
  const bestSameOrigin = new Map<string, number>();
  const siblingSites = new Set<string>();

  const sections: Array<{ selector: string; location: "nav" | "footer" | "body" }> = [
    { selector: "nav a", location: "nav" },
    { selector: "header a", location: "nav" },
    { selector: "footer a", location: "footer" },
    { selector: "a", location: "body" },
  ];

  for (const { selector, location } of sections) {
    $(selector).each((_, el) => {
      const href = $(el).attr("href");
      if (!href) return;
      let abs: string;
      try {
        abs = new URL(href, baseUrl).toString();
      } catch {
        return;
      }

      if (abs.startsWith(origin)) {
        const text = $(el).text().trim();
        const score = scoreLink(abs, text, location);
        if (score > 0) {
          bestSameOrigin.set(abs, Math.max(bestSameOrigin.get(abs) ?? 0, score));
        }
        return;
      }

      // Cross-origin: only worth remembering if it's deliberate site
      // navigation (nav/footer, not an arbitrary inline body link — those
      // could point anywhere on the web) AND it points at another site's
      // bare homepage rather than a specific article or page. That
      // combination is the actual signature of "our corporate/parent
      // site," not just any external reference. Not scored by keyword —
      // the link itself often won't mention "careers"; the point is to
      // visit it and look again there.
      if (location !== "body") {
        const linkUrl = new URL(abs);
        const isBareHomepage = linkUrl.pathname === "" || linkUrl.pathname === "/";
        if (isBareHomepage) siblingSites.add(linkUrl.origin);
      }
    });
  }

  const sameOrigin = [...bestSameOrigin.entries()]
    .map(([url, score]) => ({ url, score }))
    .sort((a, b) => b.score - a.score);

  return { sameOrigin, siblingSites: [...siblingSites] };
}

function pageLooksLikeHiringPage(html: string): boolean {
  const lower = html.toLowerCase();
  const hasOnPageSignal = ON_PAGE_SIGNALS.some((s) => lower.includes(s));
  const linksToATS = ATS_HOST_HINTS.some((h) => lower.includes(h));
  return hasOnPageSignal || linksToATS;
}

/** Strips markup noise and collapses whitespace. Used for both graph-walk pages and the final hiring page text. */
export function cleanText(html: string): string {
  const $ = cheerio.load(html);
  $("script, style, noscript, svg, iframe").remove();
  return $("body").text().replace(/\s+/g, " ").trim();
}

/**
 * Finds a company's hiring/careers page from just its root URL — no
 * hardcoded path list. Strategy:
 *   1. Fetch the root page.
 *   2. If the root itself already looks like a hiring hub (small
 *      companies sometimes put openings right on the homepage), use it.
 *   3. Otherwise extract same-origin links, score them by keyword +
 *      placement (nav/footer beats a random body link) + shallow path.
 *   4. Fetch the top-scoring candidates and *confirm* each one by
 *      looking for actual hiring-page evidence (an ATS link, "open
 *      positions" language) before committing — a link merely
 *      containing the word "careers" isn't proof it goes anywhere useful.
 *   5. If nothing confirms, fall back to the single best-scored
 *      candidate rather than giving up outright.
 *   6. If NOTHING on this origin scored at all (not even an unconfirmed
 *      fallback — e.g. a company whose marketing site uses no
 *      conventional hiring language anywhere), try exactly one hop to a
 *      "sibling site": a nav/footer link to another site's bare
 *      homepage, the actual signature of a company linking out to its
 *      own parent/corporate domain. Repeats steps 1-5 there, but does
 *      not hop again from that second site — bounded to one extra site.
 *   7. If even the root page can't be fetched, degrade to "not found"
 *      rather than throwing — downstream, the kit is generated with an
 *      empty company_brief and a note, not a crash.
 */
export async function findHiringPage(companyUrl: string): Promise<CrawlResult> {
  const pagesUsed: string[] = [];
  const visitedOrigins = new Set<string>();

  async function searchOrigin(url: string, allowSiblingHop: boolean): Promise<CrawlResult | null> {
    const root = await fetchPage(url);
    if (!root) return null;
    pagesUsed.push(root.finalUrl);
    visitedOrigins.add(new URL(root.finalUrl).origin);

    if (pageLooksLikeHiringPage(root.html)) {
      return { hiringPageUrl: root.finalUrl, hiringPageText: cleanText(root.html), pagesUsed };
    }

    const { sameOrigin, siblingSites } = extractCandidateLinks(root.html, root.finalUrl);
    const candidates = sameOrigin.slice(0, MAX_CANDIDATES_TO_INSPECT);

    let bestUnconfirmed: FetchedPage | null = null;
    for (const candidate of candidates) {
      const page = await fetchPage(candidate.url);
      if (!page) continue;
      pagesUsed.push(page.finalUrl);
      if (!bestUnconfirmed) bestUnconfirmed = page;
      if (pageLooksLikeHiringPage(page.html)) {
        return { hiringPageUrl: page.finalUrl, hiringPageText: cleanText(page.html), pagesUsed };
      }
    }

    if (bestUnconfirmed) {
      return { hiringPageUrl: bestUnconfirmed.finalUrl, hiringPageText: cleanText(bestUnconfirmed.html), pagesUsed };
    }

    if (allowSiblingHop) {
      for (const sibling of siblingSites.slice(0, 1)) {
        if (visitedOrigins.has(sibling)) continue;
        const result = await searchOrigin(sibling, false); // no further hopping past this
        if (result) return result;
      }
    }

    return null;
  }

  const result = await searchOrigin(companyUrl, true);
  return result ?? { hiringPageUrl: null, hiringPageText: null, pagesUsed };
}
