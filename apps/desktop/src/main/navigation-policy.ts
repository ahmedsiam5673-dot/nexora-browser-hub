/**
 * Navigation policy. Pure functions; the Electron layer only applies their verdicts.
 *
 *  - "web" tabs: sandboxed, no preload, can only ever show http(s).
 *  - "internal" tabs: nexora://<page>, served from the app bundle, the ONLY tabs that get the
 *    internal preload. A web page can never navigate to (or open) an internal page.
 */
import { isSafeNavigationUrl } from "@nexora/core";

export const INTERNAL_PAGES = ["newtab", "history", "bookmarks", "downloads", "settings", "about"] as const;
export type InternalPage = (typeof INTERNAL_PAGES)[number];
export type TabKind = "web" | "internal";

export function parseInternalUrl(url: string): { page: InternalPage; search: string } | null {
  try {
    const u = new URL(url);
    if (u.protocol !== "nexora:") return null;
    const page = u.hostname as InternalPage;
    if (!INTERNAL_PAGES.includes(page)) return null;
    if (u.username || u.password || (u.pathname !== "/" && u.pathname !== "")) return null;
    return { page, search: u.search };
  } catch {
    return null;
  }
}

export function isInternalUrl(url: string): boolean {
  return parseInternalUrl(url) !== null;
}

export const EXTERNAL_PROTOCOL_ALLOWLIST = ["mailto:", "tel:"] as const;

export type NavVerdict =
  | { action: "allow"; kind: TabKind }
  /** Allowed, but the tab must change view type first (web <-> internal) so a website never inherits the internal preload. */
  | { action: "swap"; kind: TabKind }
  | { action: "external"; protocol: string }
  | { action: "block"; reason: string };

/** origin "user" = typed in the address bar / chosen from a menu. origin "page" = triggered by page content. */
export function decideNavigation(current: TabKind, target: string, origin: "user" | "page"): NavVerdict {
  if (isSafeNavigationUrl(target)) {
    return current === "web" ? { action: "allow", kind: "web" } : { action: "swap", kind: "web" };
  }
  const internal = parseInternalUrl(target);
  if (internal) {
    if (origin === "page" && current === "web") return { action: "block", reason: "Web pages can't open browser pages." };
    // Internal -> internal is a normal navigation inside the same internal view.
    return current === "internal" ? { action: "allow", kind: "internal" } : { action: "swap", kind: "internal" };
  }
  try {
    const proto = new URL(target).protocol;
    if ((EXTERNAL_PROTOCOL_ALLOWLIST as readonly string[]).includes(proto) && origin === "page") return { action: "external", protocol: proto };
    return { action: "block", reason: `Blocked unsafe or unsupported address (${proto || "unknown"}).` };
  } catch {
    return { action: "block", reason: "That isn't a valid address." };
  }
}

export type WindowOpenVerdict =
  | { action: "tab"; url: string }
  | { action: "popup" }
  | { action: "external"; protocol: string }
  | { action: "deny" };

/**
 * window.open / target=_blank. Link-style opens become tabs. Script-opened popups with a window
 * features string are allowed as hardened child windows ONLY for http(s)/blank so that sign-in
 * popups that need window.opener keep working.
 */
export function decideWindowOpen(url: string, disposition: string, fromKind: TabKind): WindowOpenVerdict {
  const isBlank = url === "" || url === "about:blank";
  const safe = isSafeNavigationUrl(url);
  if (disposition === "new-window" && (safe || isBlank) && fromKind === "web") return { action: "popup" };
  if (safe) return { action: "tab", url };
  const internal = parseInternalUrl(url);
  if (internal && fromKind === "internal") return { action: "tab", url };
  try {
    const proto = new URL(url).protocol;
    if ((EXTERNAL_PROTOCOL_ALLOWLIST as readonly string[]).includes(proto)) return { action: "external", protocol: proto };
  } catch { /* fallthrough */ }
  return { action: "deny" };
}

/** Only allow the internal preload's IPC from frames of internal pages. */
export function isInternalSenderUrl(url: string | undefined): boolean {
  return !!url && isInternalUrl(url);
}
