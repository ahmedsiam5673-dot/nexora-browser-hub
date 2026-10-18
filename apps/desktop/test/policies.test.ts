import { describe, expect, it } from "vitest";
import { decideNavigation, decideWindowOpen, parseInternalUrl, isInternalSenderUrl } from "../src/main/navigation-policy";
import { decidePermission, isPromptableOrigin } from "../src/main/permissions";
import { isDangerousFile, safeFileName, uniqueFileName } from "../src/main/download-utils";
import { moveTab, nextActiveAfterClose, normalizeOrder } from "../src/main/tab-order";

describe("internal URLs", () => {
  it("accepts only known nexora:// pages", () => {
    expect(parseInternalUrl("nexora://history/")?.page).toBe("history");
    expect(parseInternalUrl("nexora://history/?q=a")?.search).toBe("?q=a");
    for (const bad of ["nexora://evil/", "nexora://history/../../etc", "nexora://history/x", "nexora://u:p@history/", "https://history/", "nexora:history"]) {
      expect(parseInternalUrl(bad)).toBeNull();
    }
  });
  it("only internal frames are trusted senders", () => {
    expect(isInternalSenderUrl("nexora://settings/")).toBe(true);
    expect(isInternalSenderUrl("https://nexora-settings.evil.com/")).toBe(false);
    expect(isInternalSenderUrl("file:///etc/passwd")).toBe(false);
    expect(isInternalSenderUrl(undefined)).toBe(false);
  });
});

describe("decideNavigation", () => {
  it("web → web is a plain navigation", () => expect(decideNavigation("web", "https://example.com", "page")).toEqual({ action: "allow", kind: "web" }));
  it("internal → web requires a view swap so the site never inherits the internal preload", () =>
    expect(decideNavigation("internal", "https://example.com", "page")).toEqual({ action: "swap", kind: "web" }));
  it("a web page can never navigate to a browser page", () => {
    expect(decideNavigation("web", "nexora://settings/", "page").action).toBe("block");
    expect(decideNavigation("web", "nexora://history/", "page").action).toBe("block");
  });
  it("the user can open browser pages from the address bar", () =>
    expect(decideNavigation("web", "nexora://history/", "user")).toEqual({ action: "swap", kind: "internal" }));
  it.each(["javascript:alert(1)", "data:text/html,x", "file:///etc/passwd", "blob:https://a/1", "chrome://gpu", "devtools://devtools/x", "view-source:https://a.com", "ftp://x.com", "intent://x", "vscode://x"])(
    "blocks %s from pages and from the user", (u) => {
      expect(decideNavigation("web", u, "page").action).toBe("block");
      expect(decideNavigation("web", u, "user").action).toBe("block");
    });
  it("mailto/tel from a page need confirmation; never from the address bar", () => {
    expect(decideNavigation("web", "mailto:a@b.c", "page")).toEqual({ action: "external", protocol: "mailto:" });
    expect(decideNavigation("web", "mailto:a@b.c", "user").action).toBe("block");
  });
  it("rejects credentials-in-URL spoofing", () => expect(decideNavigation("web", "https://google.com@evil.com/", "page").action).toBe("block"));
});

describe("decideWindowOpen", () => {
  it("links with target=_blank become tabs", () => expect(decideWindowOpen("https://a.com", "foreground-tab", "web")).toEqual({ action: "tab", url: "https://a.com" }));
  it("script popups from web pages are hardened child windows", () => {
    expect(decideWindowOpen("https://accounts.example.com/x", "new-window", "web")).toEqual({ action: "popup" });
    expect(decideWindowOpen("about:blank", "new-window", "web")).toEqual({ action: "popup" });
  });
  it("never allows popups to dangerous schemes or browser pages", () => {
    expect(decideWindowOpen("javascript:1", "new-window", "web").action).toBe("deny");
    expect(decideWindowOpen("nexora://settings/", "new-window", "web").action).toBe("deny");
    expect(decideWindowOpen("file:///x", "foreground-tab", "web").action).toBe("deny");
  });
  it("internal pages may open other internal pages as tabs", () =>
    expect(decideWindowOpen("nexora://history/", "foreground-tab", "internal")).toEqual({ action: "tab", url: "nexora://history/" }));
});

describe("permissions", () => {
  it("prompts for camera/location on https, denies on plain http", () => {
    expect(decidePermission("media", "https://meet.example.com", "web")).toBe("prompt");
    expect(decidePermission("geolocation", "http://example.com", "web")).toBe("deny");
    expect(isPromptableOrigin("http://localhost:3000")).toBe(true);
  });
  it("allows harmless ones and denies the dangerous ones by default", () => {
    expect(decidePermission("fullscreen", "https://a.com", "web")).toBe("allow");
    for (const p of ["usb", "hid", "serial", "bluetooth", "openExternal", "display-capture", "midi", "unknown-thing"]) expect(decidePermission(p, "https://a.com", "web")).toBe("deny");
  });
  it("internal pages get no device permissions", () => expect(decidePermission("media", "nexora://newtab", "internal")).toBe("deny"));
});

describe("download utilities", () => {
  it("flags executables and macro-enabled documents", () => {
    for (const f of ["setup.exe", "a.MSI", "run.sh", "x.app", "tool.jar", "doc.docm", "payload.ps1"]) expect(isDangerousFile(f)).toBe(true);
    for (const f of ["photo.png", "report.pdf", "notes.txt", "archive.zip", "noext"]) expect(isDangerousFile(f)).toBe(false);
  });
  it("sanitises file names and blocks traversal", () => {
    expect(safeFileName("../../etc/passwd")).toBe("passwd");
    expect(safeFileName("..\\..\\win.ini")).toBe("win.ini");
    expect(safeFileName("a<b>:c|d?.txt")).toBe("a_b__c_d_.txt");
    expect(safeFileName("...")).toBe("download");
    expect(safeFileName("CON.txt")).toBe("_CON.txt");
    expect(safeFileName("x".repeat(500) + ".pdf").length).toBeLessThanOrEqual(200);
  });
  it("makes unique names", () => {
    const taken = new Set(["/d/a.txt", "/d/a (1).txt"]);
    expect(uniqueFileName("/d", "a.txt", (p) => taken.has(p))).toBe("a (2).txt");
    expect(uniqueFileName("/d", "b.txt", (p) => taken.has(p))).toBe("b.txt");
  });
});

describe("tab ordering", () => {
  const t = (id: number, pinned = false) => ({ id, pinned });
  it("keeps pinned tabs on the left", () => expect(normalizeOrder([t(1), t(2, true), t(3), t(4, true)]).map((x) => x.id)).toEqual([2, 4, 1, 3]));
  it("reorders within the unpinned group", () => expect(moveTab([t(1, true), t(2), t(3), t(4)], 4, 1).map((x) => x.id)).toEqual([1, 4, 2, 3]));
  it("cannot drag an unpinned tab into the pinned zone, or a pinned tab out of it", () => {
    expect(moveTab([t(1, true), t(2), t(3)], 3, 0).map((x) => x.id)).toEqual([1, 3, 2]);
    expect(moveTab([t(1, true), t(2, true), t(3)], 1, 5).map((x) => x.id)).toEqual([2, 1, 3]);
  });
  it("ignores unknown ids", () => expect(moveTab([t(1)], 9, 0)).toEqual([t(1)]));
  it("picks a sensible next active tab", () => {
    expect(nextActiveAfterClose([t(1), t(2), t(3)], 2)).toBe(3);
    expect(nextActiveAfterClose([t(1), t(2), t(3)], 3)).toBe(2);
    expect(nextActiveAfterClose([t(1)], 1)).toBeNull();
  });
});

import { cleanUserAgent } from "../src/main/sessions";
import { resolveInternalAsset, INTERNAL_CSP } from "../src/main/protocol";

describe("internal protocol resolver", () => {
  const root = "/app/internal";
  it("serves known pages and plain assets", () => {
    expect(resolveInternalAsset("nexora://history/", root)).toMatchObject({ file: "/app/internal/history.html", isPage: true });
    expect(resolveInternalAsset("nexora://chrome/", root)).toMatchObject({ file: "/app/internal/chrome.html" });
    expect(resolveInternalAsset("nexora://assets/history.js", root)).toMatchObject({ file: "/app/internal/assets/history.js", isPage: false });
  });
  it("blocks traversal, unknown hosts, html-as-asset, credentials and odd names", () => {
    for (const bad of [
      "nexora://assets/../history.html", "nexora://assets/..%2Fapp.js", "nexora://assets/%2e%2e%2fapp.js", "nexora://assets/a/b.js", "nexora://assets/history.html",
      "nexora://assets/.env", "nexora://assets/x.exe", "nexora://evil/", "nexora://history/extra", "nexora://u:p@history/", "https://history/", "file:///etc/passwd",
    ]) expect(resolveInternalAsset(bad, root)).toBeNull();
  });
  it("whatever the input, a resolved file always stays inside the bundle", () => {
    // The URL parser collapses %2e%2e dot-segments, so this lands on assets/secret.js, which is still inside assets/.
    const r = resolveInternalAsset("nexora://assets/%2e%2e/secret.js", root);
    expect(r === null || r.file.startsWith("/app/internal/assets/")).toBe(true);
    const hostile = ["..", "../..", "%2e%2e/%2e%2e/etc/passwd", "....//x.js", "a%00.js", "x.js%00.html", "\\..\\x.js", "%5c..%5cx.js"];
    for (const h of hostile) {
      const res = resolveInternalAsset(`nexora://assets/${h}`, root);
      expect(res === null || res.file.startsWith("/app/internal/assets/")).toBe(true);
    }
  });
  it("CSP forbids inline code and remote loads", () => {
    expect(INTERNAL_CSP).toContain("default-src 'none'");
    expect(INTERNAL_CSP).not.toMatch(/unsafe-inline|unsafe-eval|https?:/);
  });
});

describe("user agent", () => {
  it("removes Electron/app tokens so sites don't treat us as an embedded webview", () => {
    const ua = cleanUserAgent("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) nexora-desktop/0.1.0 Chrome/140.0.0.0 Electron/44.9.0 Safari/537.36");
    expect(ua).not.toMatch(/Electron/i);
    expect(ua).not.toMatch(/nexora-desktop/);
    expect(ua).toContain("Chrome/140.0.0.0");
    expect(ua.endsWith("NexoraBrowser/0.1")).toBe(true);
  });
});
