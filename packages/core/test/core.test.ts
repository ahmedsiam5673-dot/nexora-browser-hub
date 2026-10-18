import { describe, expect, it } from "vitest";
import {
  resolveOmnibox, isSafeNavigationUrl, buildSearchUrl, persistentPartition, privatePartition,
  isPersistentPartition, sanitizeProfileName, slugifyProfileName, availabilityFor, BROWSER_OPTIONS,
  detectPlatform, parsePrivacy, DEFAULT_PRIVACY, normalizeHomepage, isValidProfileId,
} from "../src";

describe("isSafeNavigationUrl", () => {
  it.each(["https://example.com", "http://localhost:3000/x", "https://a.b/c?d=e#f"])("allows %s", (u) =>
    expect(isSafeNavigationUrl(u)).toBe(true));
  it.each([
    "javascript:alert(1)", "data:text/html,<script>1</script>", "file:///etc/passwd", "blob:https://x/1",
    "ftp://x.com", "chrome://settings", "https://user:pass@evil.com", "", "not a url", "https://",
  ])("rejects %s", (u) => expect(isSafeNavigationUrl(u)).toBe(false));
  it("rejects over-long URLs", () => expect(isSafeNavigationUrl("https://a.com/" + "x".repeat(9000))).toBe(false));
});

describe("resolveOmnibox", () => {
  it("navigates to bare domains over https", () =>
    expect(resolveOmnibox("example.com")).toEqual({ kind: "navigate", url: "https://example.com/" }));
  it("keeps explicit http(s)", () =>
    expect(resolveOmnibox("http://example.com/a")).toEqual({ kind: "navigate", url: "http://example.com/a" }));
  it("uses http for localhost and IPs", () => {
    expect(resolveOmnibox("localhost:3000")).toEqual({ kind: "navigate", url: "http://localhost:3000/" });
    expect(resolveOmnibox("192.168.1.1/admin")).toEqual({ kind: "navigate", url: "http://192.168.1.1/admin" });
  });
  it("searches plain text with the chosen engine", () => {
    const r = resolveOmnibox("how to bake bread", "duckduckgo");
    expect(r).toEqual({ kind: "search", query: "how to bake bread", url: "https://duckduckgo.com/?q=how%20to%20bake%20bread" });
  });
  it("defaults to Google", () => {
    const r = resolveOmnibox("cats");
    expect(r.kind === "search" && r.url).toBe("https://www.google.com/search?q=cats");
  });
  it("treats invalid IPv4 as a search", () => expect(resolveOmnibox("999.999.1.1").kind).toBe("search"));
  it("rejects dangerous schemes instead of searching them", () => {
    expect(resolveOmnibox("javascript:alert(1)").kind).toBe("invalid");
    expect(resolveOmnibox("file:///etc/passwd").kind).toBe("invalid");
    expect(resolveOmnibox("data:text/html,hi").kind).toBe("invalid");
  });
  it("rejects empty input", () => expect(resolveOmnibox("   ").kind).toBe("invalid"));
  it("encodes special characters in queries", () => {
    const r = resolveOmnibox("a&b=c d", "bing");
    expect(r.kind === "search" && r.url).toBe("https://www.bing.com/search?q=a%26b%3Dc%20d");
  });
  it("treats text with spaces as a search even if it contains a dot", () =>
    expect(resolveOmnibox("version 1.2 notes").kind).toBe("search"));
});

describe("homepage", () => {
  it("falls back for invalid input", () => expect(normalizeHomepage("javascript:1", "https://x.com/")).toBe("https://x.com/"));
  it("normalises valid input", () => expect(normalizeHomepage("example.org", "https://x.com/")).toBe("https://example.org/"));
});

describe("session partitions: profile isolation and private separation", () => {
  it("gives each profile a distinct persistent partition", () => {
    expect(persistentPartition("personal")).not.toBe(persistentPartition("work"));
    expect(isPersistentPartition(persistentPartition("work"))).toBe(true);
  });
  it("private partitions are never persistent and never collide with profiles", () => {
    const p = privatePartition("abc123");
    expect(isPersistentPartition(p)).toBe(false);
    expect(p).not.toBe(persistentPartition("abc123"));
    expect(privatePartition("a")).not.toBe(privatePartition("b"));
  });
  it("rejects path-like or unsafe ids", () => {
    for (const bad of ["../x", "a/b", "A B", "", "x".repeat(65), "-lead"]) {
      expect(isValidProfileId(bad)).toBe(false);
      expect(() => persistentPartition(bad)).toThrow();
      expect(() => privatePartition(bad)).toThrow();
    }
  });
  it("sanitises profile names", () => {
    expect(sanitizeProfileName("  Work   Stuff ")).toBe("Work Stuff");
    expect(sanitizeProfileName("")).toBeNull();
    expect(sanitizeProfileName("<b>x")).toBeNull();
    expect(sanitizeProfileName("x".repeat(41))).toBeNull();
    expect(slugifyProfileName("Étude & Travail!")).toBe("etude-travail");
  });
});

describe("browser catalog honesty", () => {
  it("never claims an external browser is embedded", () => {
    for (const b of BROWSER_OPTIONS.filter((x) => x.id !== "nexora-desktop")) expect(b.mode).not.toBe("embedded");
  });
  it("only the NEXORA desktop option is embedded", () =>
    expect(BROWSER_OPTIONS.filter((b) => b.mode === "embedded").map((b) => b.id)).toEqual(["nexora-desktop"]));
  it("marks Safari unavailable off Apple devices", () => {
    const safari = BROWSER_OPTIONS.find((b) => b.id === "safari")!;
    expect(availabilityFor(safari, "windows").status).toBe("unavailable");
    expect(availabilityFor(safari, "ios").status).toBe("available");
  });
  it("Firefox states the Chromium limitation", () =>
    expect(BROWSER_OPTIONS.find((b) => b.id === "firefox")!.limitation).toMatch(/Chromium/));
  it("download links are https official hosts", () => {
    for (const b of BROWSER_OPTIONS) if (b.downloadUrl) expect(b.downloadUrl.startsWith("https://")).toBe(true);
  });
  it("detects platforms", () => {
    expect(detectPlatform("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)")).toBe("ios");
    expect(detectPlatform("Mozilla/5.0 (Windows NT 10.0; Win64)")).toBe("windows");
    expect(detectPlatform("Mozilla/5.0 (X11; Linux x86_64)")).toBe("linux");
  });
});

describe("privacy prefs", () => {
  it("fills defaults and ignores bad types", () => {
    expect(parsePrivacy(undefined)).toEqual(DEFAULT_PRIVACY);
    expect(parsePrivacy({ recordHistory: "yes", restoreTabs: true }).recordHistory).toBe(true);
    expect(parsePrivacy({ restoreTabs: true }).restoreTabs).toBe(true);
  });
});

describe("buildSearchUrl", () => {
  it("encodes", () => expect(buildSearchUrl("google", "é &")).toBe("https://www.google.com/search?q=%C3%A9%20%26"));
});
