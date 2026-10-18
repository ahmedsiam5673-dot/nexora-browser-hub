import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { BrowserWindow, app, dialog, protocol, session, type WebContents } from "electron";
import { AppServices } from "./services";
import { DownloadManager } from "./downloads";
import { INTERNAL_PARTITION, configureWebSession } from "./sessions";
import { registerInternalProtocol } from "./protocol";
import { BrowserWindowController, NEW_TAB, type ControllerDeps } from "./window";
import { registerIpc, windowFromWebContents } from "./ipc";
import { buildMenu } from "./menu";
import { isSafeNavigationUrl } from "@nexora/core";
import { persistentPartition } from "@nexora/core";

// Must run before `ready`.
protocol.registerSchemesAsPrivileged([{ scheme: "nexora", privileges: { standard: true, secure: true } }]);
app.setName("NEXORA Browser");
// Portable / test mode: keep all data in a chosen folder.
if (process.env.NEXORA_USER_DATA) app.setPath("userData", process.env.NEXORA_USER_DATA);

let services: AppServices;
let downloads: DownloadManager;
let deps: ControllerDeps;
let flushed = false;

function openProfileWindow(profileId: string, urls?: string[]): BrowserWindowController | null {
  const profile = services.profiles.get(profileId);
  if (!profile) return null;
  const existing = [...BrowserWindowController.all].find((c) => c.ctx.kind === "profile" && c.ctx.profileId === profileId);
  if (existing && !urls) { if (existing.window.isMinimized()) existing.window.restore(); existing.window.focus(); return existing; }
  services.profiles.setLast(profileId);
  const c = new BrowserWindowController({ kind: "profile", profileId }, deps);
  const saved = services.prefs.value.restoreTabs && !urls ? services.restoreFor(profileId).load() : null;
  if (saved && saved.tabs.length > 0) {
    saved.tabs.forEach((t, i) => c.newTab(t.url, { pinned: t.pinned, activate: i === saved.activeIndex }));
  } else if (urls?.length) {
    urls.forEach((u, i) => c.newTab(u, { activate: i === 0 }));
  } else {
    c.newTab(profile.settings.homepage || NEW_TAB);
  }
  return c;
}

function openPrivateWindow() {
  const c = new BrowserWindowController({ kind: "private", sessionId: crypto.randomBytes(6).toString("hex") }, deps);
  c.newTab(NEW_TAB);
  return c;
}

async function deleteProfileData(profileId: string) {
  const ses = session.fromPartition(persistentPartition(profileId));
  try { await ses.clearStorageData(); await ses.clearCache(); await ses.clearAuthCache(); } catch (e) { console.error("clear profile storage failed", e); }
  await services.deleteProfile(profileId);
  // Chromium may keep the partition folder open until exit; remove it now if possible.
  try { fs.rmSync(services.partitionDir(app.getPath("userData"), profileId), { recursive: true, force: true }); } catch { /* removed on next start */ }
  refreshMenu();
  for (const w of BrowserWindowController.all) w.queuePush();
}

function refreshMenu() {
  buildMenu({ services, openProfileWindow: (id) => openProfileWindow(id), openNormalWindow: () => openProfileWindow(services.profiles.lastProfileId, [NEW_TAB]), openPrivateWindow });
}

/** Defense in depth for EVERY web contents the app ever creates (tabs, popups, devtools, helper views). */
app.on("web-contents-created", (_e, contents: WebContents) => {
  contents.on("will-attach-webview", (e) => e.preventDefault());
  contents.setWindowOpenHandler(() => ({ action: "deny" })); // replaced per-tab by the controller where needed
});

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", (_e, argv) => {
    const urls = argv.filter((a) => isSafeNavigationUrl(a));
    const c = BrowserWindowController.active();
    if (c) { if (c.window.isMinimized()) c.window.restore(); c.window.focus(); urls.forEach((u) => c.newTab(u)); }
  });

  void app.whenReady().then(async () => {
    const userData = app.getPath("userData");
    services = new AppServices(path.join(userData, "nexora"));

    // The internal session serves nexora:// pages and may NOT reach the network.
    const internalSession = session.fromPartition(INTERNAL_PARTITION);
    registerInternalProtocol(internalSession, path.join(__dirname, "internal"));
    internalSession.webRequest.onBeforeRequest((d, cb) => cb({ cancel: !(d.url.startsWith("nexora://") || d.url.startsWith("devtools://") || d.url.startsWith("data:")) }));
    internalSession.setPermissionRequestHandler((_wc, _p, cb) => cb(false));
    internalSession.setPermissionCheckHandler(() => false);
    internalSession.setDevicePermissionHandler(() => false);

    downloads = new DownloadManager(services.prefs, (wc) => {
      const c = wc ? BrowserWindowController.byWebContents.get(wc.id) : undefined;
      return c ? { scope: c.scope, window: c.window } : null;
    });
    downloads.on("changed", (scope: { private: boolean; id: string }) => {
      for (const c of BrowserWindowController.all) if (c.scope.private === scope.private && c.scope.id === scope.id) c.notifyInternal("downloads");
    });

    deps = {
      services, downloads, internalSession,
      getWebSession: (partition) => configureWebSession(session.fromPartition(partition), { downloads, prefs: services.prefs, windowOf: windowFromWebContents }),
      preloads: { chrome: path.join(__dirname, "preload", "chrome.cjs"), internal: path.join(__dirname, "preload", "internal.cjs") },
      confirmExternal: async (win, protocolName, url) => {
        const r = await dialog.showMessageBox(win, { type: "question", buttons: ["Cancel", "Open"], defaultId: 0, cancelId: 0, title: "Open external application?",
          message: `This page wants to open a ${protocolName.replace(":", "")} link in another app.`, detail: url.slice(0, 300) });
        return r.response === 1;
      },
    };

    registerIpc({ services, downloads, openProfileWindow: (id) => openProfileWindow(id), openPrivateWindow, deleteProfileData, userData });
    refreshMenu();

    const argvUrls = process.argv.slice(1).filter((a) => isSafeNavigationUrl(a));
    openProfileWindow(services.profiles.lastProfileId, argvUrls.length ? argvUrls : undefined);

    app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) openProfileWindow(services.profiles.lastProfileId); });

    // Optional auto-update, only when packaged AND an update feed is explicitly configured.
    if (app.isPackaged && process.env.NEXORA_UPDATE_URL) {
      try {
        const { autoUpdater } = await import("electron-updater");
        autoUpdater.setFeedURL({ provider: "generic", url: process.env.NEXORA_UPDATE_URL });
        void autoUpdater.checkForUpdatesAndNotify();
      } catch (e) { console.error("auto-update unavailable", e); }
    }
  });

  app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });

  app.on("before-quit", (e) => {
    downloads?.discardAllPrivate();
    if (flushed || !services) return;
    e.preventDefault();
    for (const c of BrowserWindowController.all) c.saveSessionNow();
    void services.flushAll().finally(() => { flushed = true; app.quit(); });
  });
}
