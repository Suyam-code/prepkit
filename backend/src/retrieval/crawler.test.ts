import { test } from "node:test";
import assert from "node:assert/strict";
import { findHiringPage } from "./crawler";

function htmlResponse(body: string, url: string) {
  return {
    ok: true,
    status: 200,
    url,
    headers: { get: (k: string) => (k.toLowerCase() === "content-type" ? "text/html; charset=utf-8" : null) },
    text: async () => body,
  } as unknown as Response;
}

function robotsAllowAll() {
  return {
    ok: true,
    status: 200,
    url: "",
    headers: { get: () => "text/plain" },
    text: async () => "User-agent: *\nAllow: /",
  } as unknown as Response;
}

const NOT_FOUND = { ok: false, status: 404, url: "", headers: { get: () => null }, text: async () => "" } as unknown as Response;

function normalizeUrl(u: string): string {
  return u.endsWith("/") ? u.slice(0, -1) : u;
}

/** Routes a mocked fetch by URL so robots.txt, the homepage, and candidate pages each get the right canned response. */
function mockFetchRoutes(routes: Record<string, () => Response>) {
  const normalizedRoutes = new Map(Object.entries(routes).map(([k, v]) => [normalizeUrl(k), v]));
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.endsWith("/robots.txt")) return robotsAllowAll();
    const handler = normalizedRoutes.get(normalizeUrl(url));
    return handler ? handler() : NOT_FOUND;
  }) as typeof fetch;
}

test("finds the hiring page via a nav link and confirms it via ATS mention", async () => {
  const homepage = `
    <html><body>
      <nav><a href="/about">About</a><a href="/careers">Careers</a></nav>
      <footer><a href="/privacy">Privacy</a></footer>
    </body></html>`;
  const careersPage = `
    <html><body>
      <h1>Join our team</h1>
      <p>View our open positions and apply via our greenhouse.io listings.</p>
    </body></html>`;

  mockFetchRoutes({
    "https://example.com/": () => htmlResponse(homepage, "https://example.com/"),
    "https://example.com/careers": () => htmlResponse(careersPage, "https://example.com/careers"),
  });

  const result = await findHiringPage("https://example.com/");
  assert.equal(result.hiringPageUrl, "https://example.com/careers");
  assert.ok(result.hiringPageText?.includes("Join our team"));
  assert.deepEqual(result.pagesUsed.sort(), ["https://example.com/", "https://example.com/careers"].sort());
});

test("uses the homepage directly when it already looks like a hiring hub", async () => {
  const homepage = `
    <html><body>
      <h1>We're hiring</h1>
      <p>Current openings: view all jobs below. Apply now!</p>
    </body></html>`;

  mockFetchRoutes({
    "https://tiny-startup.com/": () => htmlResponse(homepage, "https://tiny-startup.com/"),
  });

  const result = await findHiringPage("https://tiny-startup.com/");
  assert.equal(result.hiringPageUrl, "https://tiny-startup.com/");
});

test("falls back to the best-scored candidate when nothing on-page confirms", async () => {
  const homepage = `
    <html><body>
      <nav><a href="/careers">Careers</a></nav>
    </body></html>`;
  // A real page, reachable, but with no ATS mention or "open positions" language —
  // still the right answer, since it's the only real candidate we found.
  const careersPage = `<html><body><h1>Careers at Example Co</h1><p>Coming soon.</p></body></html>`;

  mockFetchRoutes({
    "https://example.com/": () => htmlResponse(homepage, "https://example.com/"),
    "https://example.com/careers": () => htmlResponse(careersPage, "https://example.com/careers"),
  });

  const result = await findHiringPage("https://example.com/");
  assert.equal(result.hiringPageUrl, "https://example.com/careers");
});

test("degrades gracefully when the root page can't be fetched at all", async () => {
  mockFetchRoutes({}); // everything 404s
  const result = await findHiringPage("https://totally-unreachable.example/");
  assert.equal(result.hiringPageUrl, null);
  assert.equal(result.hiringPageText, null);
  assert.deepEqual(result.pagesUsed, []);
});

test("ignores off-origin links entirely (only follows same-origin candidates)", async () => {
  const homepage = `
    <html><body>
      <nav><a href="https://linkedin.com/company/example/jobs">Jobs on LinkedIn</a></nav>
    </body></html>`;

  mockFetchRoutes({
    "https://example.com/": () => htmlResponse(homepage, "https://example.com/"),
  });

  const result = await findHiringPage("https://example.com/");
  // No same-origin candidate existed, so we can't confirm anything — should degrade, not follow off-origin.
  assert.equal(result.hiringPageUrl, null);
  assert.deepEqual(result.pagesUsed, ["https://example.com/"]);
});

test("rejects a company_url pointing at a private address before fetching anything", async () => {
  let fetchCalled = false;
  globalThis.fetch = (async () => {
    fetchCalled = true;
    return NOT_FOUND;
  }) as typeof fetch;

  await assert.rejects(() => findHiringPage("http://127.0.0.1:9999/"));
  assert.equal(fetchCalled, false, "should reject before ever calling fetch");
});

test("hops once to a sibling site (footer link to another domain's bare homepage) when the origin site has nothing", async () => {
  // Mirrors a real case: a product marketing site with no conventional
  // hiring language anywhere, but a footer link to its parent company's
  // separate domain, which DOES have a real careers page.
  const homepage = `
    <html><body>
      <nav><a href="/pricing">Pricing</a><a href="/about">About</a></nav>
      <footer><a href="https://parentco.example/">ParentCo</a></footer>
    </body></html>`;
  const parentHomepage = `
    <html><body>
      <nav><a href="/careers">Careers</a></nav>
    </body></html>`;
  const parentCareersPage = `
    <html><body><h1>Careers</h1><p>Apply now via our greenhouse.io listings.</p></body></html>`;

  mockFetchRoutes({
    "https://product.example/": () => htmlResponse(homepage, "https://product.example/"),
    "https://parentco.example/": () => htmlResponse(parentHomepage, "https://parentco.example/"),
    "https://parentco.example/careers": () => htmlResponse(parentCareersPage, "https://parentco.example/careers"),
  });

  const result = await findHiringPage("https://product.example/");
  assert.equal(result.hiringPageUrl, "https://parentco.example/careers");
  assert.ok(result.pagesUsed.includes("https://product.example/"));
  assert.ok(result.pagesUsed.includes("https://parentco.example/careers"));
});

test("does not hop past a sibling site a second time", async () => {
  // product.example -> sibling.example (nothing there either, and its OWN
  // footer link to yet another site must NOT be followed — only one hop total).
  const homepage = `
    <html><body><footer><a href="https://sibling.example/">Sibling</a></footer></body></html>`;
  const siblingHomepage = `
    <html><body><footer><a href="https://another.example/">Another</a></footer></body></html>`;
  const anotherHomepage = `
    <html><body><h1>Careers</h1><p>Apply now via our greenhouse.io listings.</p></body></html>`;

  let anotherWasFetched = false;
  mockFetchRoutes({
    "https://product.example/": () => htmlResponse(homepage, "https://product.example/"),
    "https://sibling.example/": () => htmlResponse(siblingHomepage, "https://sibling.example/"),
    "https://another.example/": () => {
      anotherWasFetched = true;
      return htmlResponse(anotherHomepage, "https://another.example/");
    },
  });

  const result = await findHiringPage("https://product.example/");
  assert.equal(result.hiringPageUrl, null); // correctly gives up rather than chaining hops
  assert.equal(anotherWasFetched, false);
});
