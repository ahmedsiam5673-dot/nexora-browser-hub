/**
 * URL safety + omnibox resolution. Shared by the web dashboard and the desktop browser.
 * Only http: and https: are ever navigable from user input. Everything else
 * (javascript:, data:, file:, blob:, custom protocols) is rejected.
 */
import { buildSearchUrl, DEFAULT_SEARCH_ENGINE, type SearchEngineId } from "./search-engines";

export const ALLOWED_NAVIGATION_PROTOCOLS = ["http:", "https:"] as const;
const MAX_URL_LENGTH = 8192;

export function isSafeNavigationUrl(input: string): boolean {
  if (typeof input !== "string" || input.length === 0 || input.length > MAX_URL_LENGTH) return false;
  try {
    const u = new URL(input);
    if (!(ALLOWED_NAVIGATION_PROTOCOLS as readonly string[]).includes(u.protocol)) return false;
    if (u.username || u.password) return false; // blocks user:pass@host spoofing
    return u.hostname.length > 0;
  } catch {
    return false;
  }
}

const HAS_SCHEME = /^[a-zA-Z][a-zA-Z0-9+.-]*:/;
const IPV4 = /^(\d{1,3}\.){3}\d{1,3}$/;
// host[:port][/path...], host must have a dot-separated TLD-ish label, or be localhost/IPv4
const HOSTLIKE = /^(localhost|(\d{1,3}\.){3}\d{1,3}|([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63})(:\d{1,5})?([/?#].*)?$/i;

export type OmniboxResult =
  | { kind: "navigate"; url: string }
  | { kind: "search"; url: string; query: string }
  | { kind: "invalid"; reason: string };

function validIPv4(host: string): boolean {
  return IPV4.test(host) && host.split(".").every((p) => Number(p) <= 255);
}

/** Decide whether typed text is a URL or a search query, and resolve it. */
export function resolveOmnibox(
  raw: string,
  engine: SearchEngineId = DEFAULT_SEARCH_ENGINE,
): OmniboxResult {
  const text = (raw ?? "").trim();
  if (!text) return { kind: "invalid", reason: "empty" };

  if (HAS_SCHEME.test(text) && !/^[a-z0-9.-]+:\d+(\/|$)/i.test(text)) {
    // Explicit scheme (not host:port). Only http(s) allowed.
    if (isSafeNavigationUrl(text)) return { kind: "navigate", url: new URL(text).toString() };
    return { kind: "invalid", reason: "unsupported-or-unsafe-url" };
  }

  if (!/\s/.test(text) && HOSTLIKE.test(text)) {
    const host = text.split(/[/:?#]/)[0] ?? "";
    if (IPV4.test(host) && !validIPv4(host)) {
      return { kind: "search", url: buildSearchUrl(engine, text), query: text };
    }
    const scheme = host === "localhost" || IPV4.test(host) ? "http://" : "https://";
    const candidate = scheme + text;
    if (isSafeNavigationUrl(candidate)) return { kind: "navigate", url: new URL(candidate).toString() };
  }

  return { kind: "search", url: buildSearchUrl(engine, text), query: text };
}

/** Normalise a stored/entered homepage; falls back when invalid. */
export function normalizeHomepage(input: string | null | undefined, fallback: string): string {
  const r = resolveOmnibox(input ?? "");
  return r.kind === "navigate" ? r.url : fallback;
}

export function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}
