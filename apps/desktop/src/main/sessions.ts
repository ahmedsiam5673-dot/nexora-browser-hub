import { dialog, type BrowserWindow, type Session, type WebContents } from "electron";
import { decidePermission, permissionLabel } from "./permissions";
import { isInternalUrl } from "./navigation-policy";
import type { PrefsStore } from "./storage/prefs";
import type { DownloadManager } from "./downloads";

export const INTERNAL_PARTITION = "nexora-internal"; // in-memory; holds no user data

export interface SessionDeps {
  downloads: DownloadManager;
  prefs: PrefsStore;
  windowOf: (wc: WebContents | null) => BrowserWindow | null;
}

const configured = new WeakSet<Session>();

/** Chromium's default UA contains "Electron/x" and the app name; sites (notably Google sign-in) treat that as an embedded webview. */
export function cleanUserAgent(ua: string, appToken = "NexoraBrowser/0.1"): string {
  return `${ua.replace(/\s(Electron|nexora-desktop|NEXORA[^\s/]*)\/\S+/gi, "")} ${appToken}`.replace(/\s{2,}/g, " ").trim();
}

function originOf(url: string): string {
  try { return new URL(url).origin; } catch { return ""; }
}

export function configureWebSession(ses: Session, deps: SessionDeps): Session {
  if (configured.has(ses)) return ses;
  configured.add(ses);

  ses.setUserAgent(cleanUserAgent(ses.getUserAgent()));
  ses.setSpellCheckerEnabled(true);

  // Per-session, in-memory decisions: never written to disk, gone when the session ends.
  const decisions = new Map<string, boolean>();
  const kindOf = (wc: WebContents | null) => (wc && isInternalUrl(wc.getURL()) ? "internal" : "web");

  ses.setPermissionRequestHandler(async (wc, permission, callback, details) => {
    const requestingUrl = (details as { requestingUrl?: string }).requestingUrl ?? wc.getURL();
    const origin = originOf(requestingUrl);
    const verdict = decidePermission(permission, origin, kindOf(wc));
    if (verdict !== "prompt") return callback(verdict === "allow");
    const k = `${origin}|${permission}`;
    if (decisions.has(k)) return callback(decisions.get(k)!);
    const win = deps.windowOf(wc);
    const opts = {
      type: "question" as const, buttons: ["Block", "Allow"], defaultId: 0, cancelId: 0, title: "Permission request",
      message: `${new URL(origin).host} wants to ${permissionLabel(permission, details as { mediaTypes?: string[] })}.`,
      detail: "You can change your mind by closing this window or restarting the browser.",
    };
    const r = win ? await dialog.showMessageBox(win, opts) : await dialog.showMessageBox(opts);
    decisions.set(k, r.response === 1);
    callback(r.response === 1);
  });

  ses.setPermissionCheckHandler((wc, permission, requestingOrigin) => {
    const verdict = decidePermission(permission, requestingOrigin, kindOf(wc));
    if (verdict === "allow") return true;
    if (verdict === "prompt") return decisions.get(`${requestingOrigin}|${permission}`) === true;
    return false;
  });
  ses.setDevicePermissionHandler(() => false);

  ses.webRequest.onBeforeSendHeaders((details, cb) => {
    const headers = details.requestHeaders;
    if (deps.prefs.value.sendGlobalPrivacyControl) headers["Sec-GPC"] = "1";
    cb({ requestHeaders: headers });
  });

  ses.on("will-download", (e, item, wc) => deps.downloads.handleWillDownload(e, item, wc));
  return ses;
}
