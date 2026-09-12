import robotsParser from "robots-parser";

/**
 * Fails open on any robots.txt fetch/parse problem (missing file, 404,
 * timeout, malformed content) — a broken robots.txt shouldn't block an
 * otherwise-legitimate crawl. It only fails closed on an explicit
 * Disallow rule that actually matches our URL.
 */
export async function isAllowedByRobots(url: string, userAgent = "PrepKitBot"): Promise<boolean> {
  try {
    const u = new URL(url);
    const robotsUrl = `${u.protocol}//${u.host}/robots.txt`;
    const res = await fetch(robotsUrl, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return true;
    const body = await res.text();
    const robots = robotsParser(robotsUrl, body);
    return robots.isAllowed(url, userAgent) ?? true;
  } catch {
    return true;
  }
}
