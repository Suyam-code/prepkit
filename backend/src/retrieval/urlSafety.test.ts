import { test } from "node:test";
import assert from "node:assert/strict";
import { assertPublicHttpUrl, UnsafeUrlError } from "./urlSafety";

test("rejects loopback IPv4", async () => {
  await assert.rejects(() => assertPublicHttpUrl("http://127.0.0.1"), UnsafeUrlError);
});

test("rejects the cloud metadata endpoint", async () => {
  await assert.rejects(() => assertPublicHttpUrl("http://169.254.169.254/latest/meta-data"), UnsafeUrlError);
});

test("rejects RFC1918 private ranges", async () => {
  await assert.rejects(() => assertPublicHttpUrl("http://10.0.0.5"), UnsafeUrlError);
  await assert.rejects(() => assertPublicHttpUrl("http://192.168.1.1"), UnsafeUrlError);
  await assert.rejects(() => assertPublicHttpUrl("http://172.16.5.5"), UnsafeUrlError);
});

test("rejects literal localhost hostname", async () => {
  await assert.rejects(() => assertPublicHttpUrl("http://localhost:4000"), UnsafeUrlError);
});

test("rejects IPv6 loopback", async () => {
  await assert.rejects(() => assertPublicHttpUrl("http://[::1]"), UnsafeUrlError);
});

test("rejects non-http(s) protocols", async () => {
  await assert.rejects(() => assertPublicHttpUrl("ftp://example.com"), UnsafeUrlError);
  await assert.rejects(() => assertPublicHttpUrl("file:///etc/passwd"), UnsafeUrlError);
});

test("rejects garbage input", async () => {
  await assert.rejects(() => assertPublicHttpUrl("not a url at all"), UnsafeUrlError);
});

test("allows a genuine public IPv4 address", async () => {
  await assert.doesNotReject(() => assertPublicHttpUrl("http://8.8.8.8"));
});
