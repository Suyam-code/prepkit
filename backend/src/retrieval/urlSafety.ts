import dns from "node:dns/promises";
import net from "node:net";

export class UnsafeUrlError extends Error {}

function ipToLong(ip: string): number {
  return (
    ip
      .split(".")
      .reduce((acc, octet) => (acc << 8) + parseInt(octet, 10), 0) >>> 0
  );
}

function isPrivateIPv4(ip: string): boolean {
  const ranges: Array<[string, number]> = [
    ["0.0.0.0", 8], // "this network"
    ["10.0.0.0", 8], // RFC1918
    ["100.64.0.0", 10], // carrier-grade NAT
    ["127.0.0.0", 8], // loopback
    ["169.254.0.0", 16], // link-local — includes the 169.254.169.254 cloud metadata endpoint
    ["172.16.0.0", 12], // RFC1918
    ["192.0.0.0", 24], // IETF protocol assignments
    ["192.168.0.0", 16], // RFC1918
    ["198.18.0.0", 15], // benchmarking
  ];
  const ipLong = ipToLong(ip);
  return ranges.some(([base, bits]) => {
    const baseLong = ipToLong(base);
    const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
    return (ipLong & mask) === (baseLong & mask);
  });
}

function isPrivateIPv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  return (
    lower === "::1" ||
    lower.startsWith("fc") ||
    lower.startsWith("fd") ||
    lower.startsWith("fe80") ||
    lower.startsWith("::ffff:127.")
  );
}

/**
 * Blocks SSRF: a user-submitted company_url must resolve to a genuine
 * public address, not localhost, a private/internal range, or a cloud
 * metadata endpoint (169.254.169.254). Checked against the *resolved* IP,
 * not just the hostname string — "http://evil.example" can still resolve
 * to 127.0.0.1 or an internal address via attacker-controlled DNS, so a
 * hostname-string check alone isn't enough.
 *
 * Call this before every fetch of a user-influenced URL, including
 * redirects/candidate links discovered during a crawl, not just the
 * initial company_url the user typed in.
 */
export async function assertPublicHttpUrl(rawUrl: string): Promise<void> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new UnsafeUrlError(`Not a valid URL: ${rawUrl}`);
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new UnsafeUrlError(`Unsupported protocol: ${url.protocol}`);
  }

  // URL.hostname keeps surrounding brackets on an IPv6 literal (e.g.
  // "[::1]"), which net.isIP does not recognize — strip them before checking.
  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (hostname === "localhost" || hostname.endsWith(".localhost")) {
    throw new UnsafeUrlError("Refusing to fetch localhost");
  }

  const ipVersion = net.isIP(hostname);
  if (ipVersion === 4) {
    if (isPrivateIPv4(hostname)) {
      throw new UnsafeUrlError(`Refusing to fetch private IPv4 address: ${hostname}`);
    }
    return;
  }
  if (ipVersion === 6) {
    if (isPrivateIPv6(hostname)) {
      throw new UnsafeUrlError(`Refusing to fetch private IPv6 address: ${hostname}`);
    }
    return;
  }

  // Not a literal IP — resolve it and check every address it maps to.
  // A lookup failure here (bad/typo'd domain, doesn't exist) is NOT a
  // security concern — it's just a broken URL, and the subsequent fetch
  // will fail on its own and get handled as "couldn't reach this page"
  // rather than a security exception. Only a *successful* resolution to
  // a private/internal address is something we actively block.
  let addresses: string[];
  try {
    const results = await dns.lookup(hostname, { all: true });
    addresses = results.map((r) => r.address);
  } catch {
    return;
  }

  for (const addr of addresses) {
    const v = net.isIP(addr);
    if (v === 4 && isPrivateIPv4(addr)) {
      throw new UnsafeUrlError(`${hostname} resolves to a private address (${addr})`);
    }
    if (v === 6 && isPrivateIPv6(addr)) {
      throw new UnsafeUrlError(`${hostname} resolves to a private address (${addr})`);
    }
  }
}
