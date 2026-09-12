import "dotenv/config";
import * as cheerio from "cheerio";
import { findHiringPage } from "../src/retrieval/crawler";

async function main() {
  const url = process.argv[2] || "https://basecamp.com";
  console.log(`Testing crawler against: ${url}\n`);

  const result = await findHiringPage(url);
  console.log("=== findHiringPage result ===");
  console.log(JSON.stringify({ ...result, hiringPageText: result.hiringPageText?.slice(0, 200) }, null, 2));

  console.log("\n=== raw fetch of the root page, for comparison ===");
  const res = await fetch(url, {
    headers: { "User-Agent": "PrepKitBot/1.0 (+interview prep tool; respects robots.txt)" },
  });
  console.log("status:", res.status, "final url:", res.url, "content-type:", res.headers.get("content-type"));
  const html = await res.text();
  console.log("html length:", html.length);

  const $ = cheerio.load(html);
  const links = new Set<string>();
  $("a").each((_, el) => {
    const href = $(el).attr("href");
    if (href) links.add(href);
  });
  console.log(`\nfound ${links.size} <a> tags with href on the page. First 40:`);
  [...links].slice(0, 40).forEach((l) => console.log(" -", l));

  try {
    const robotsRes = await fetch(new URL("/robots.txt", url).toString());
    console.log("\nrobots.txt status:", robotsRes.status);
    if (robotsRes.ok) {
      console.log((await robotsRes.text()).slice(0, 500));
    }
  } catch (err) {
    console.log("\nrobots.txt fetch failed:", err);
  }
}

main().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});
