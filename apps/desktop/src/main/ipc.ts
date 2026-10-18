import { BrowserWindow, Menu, app, dialog, ipcMain, type IpcMainInvokeEvent, type WebContents } from "electron";
import { QUICK_LINKS, SEARCH_ENGINES, isSafeNavigationUrl, isSearchEngineId, parsePrivacy } from "@nexora/core";
import { CH, isClearPeriod, isInternalMethod, parseChromeAction, type InternalResult } from "../shared/ipc";
import { isInternalSenderUrl } from "./navigation-policy";
import { BrowserWindowController } from "./window";
import type { AppServices } from "./services";
import type { DownloadManager } from "./downloads";

export interface IpcDeps {
  services: AppServices;
  downloads: DownloadManager;
  openProfileWindow: (profileId: string) => void;
  openPrivateWindow: () => void;
  deleteProfileData: (profileId: string) => Promise<void>;
  userData: string;
}

const ok = <T>(data?: T): InternalResult<T> => ({ ok: true, data });
const fail = (error: string): InternalResult<never> => ({ ok: false, error });
const str = (v: unknown, max = 2048): string => { if (typeof v !== "string" || v.length > max) throw new Error("Invalid input."); return v; };
const optStr = (v: unknown, max = 2048): string | undefined => (v === undefined ? undefined : str(v, max));
const obj = (v: unknown): Record<string, unknown> => { if (typeof v !== "object" || v === null || Array.isArray(v)) throw new Error("Invalid input."); return v as Record<string, unknown>; };

export function registerIpc(deps: IpcDeps) {
  const { services, downloads } = deps;

  /* -------------------- chrome UI (tab strip + toolbar) -------------------- */
  const chromeController = (e: IpcMainInvokeEvent): BrowserWindowController | null => {
    const c = BrowserWindowController.byWebContents.get(e.sender.id);
    // Only the controller's own chrome view, loaded from nexora://chrome/, may drive it.
    return c && c.isChromeWebContents(e.sender) && e.senderFrame?.url === "nexora://chrome/" ? c : null;
  };

  ipcMain.handle(CH.chromeGetState, (e) => chromeController(e)?.state() ?? null);

  ipcMain.handle(CH.chromeAction, (e, raw: unknown) => {
    const c = chromeController(e);
    const a = parseChromeAction(raw);
    if (!c || !a) return;
    switch (a.type) {
      case "newTab": c.newTab(); c.focusAddress(); break;
      case "closeTab": c.closeTab(a.id); break;
      case "activateTab": c.activateTab(a.id); break;
      case "moveTab": c.reorder(a.id, a.to); break;
      case "back": c.back(); break;
      case "forward": c.forward(); break;
      case "reload": c.reload(); break;
      case "stop": c.stop(); break;
      case "home": c.home(); break;
      case "go": c.go(a.input); break;
      case "toggleBookmark": c.toggleBookmark(); break;
      case "openBookmark": {
        if (c.ctx.kind !== "profile") break;
        const b = services.bookmarksFor(c.ctx.profileId).list().find((x) => x.id === a.id);
        if (b) c.go(b.url);
        break;
      }
      case "tabMenu": {
        const snap = c.tabsSnapshot().find((t) => t.id === a.id);
        if (!snap) break;
        Menu.buildFromTemplate([
          { label: "New Tab", click: () => c.newTab() },
          { label: "Duplicate", click: () => c.duplicateTab(a.id) },
          { label: snap.pinned ? "Unpin Tab" : "Pin Tab", click: () => c.setPinned(a.id, !snap.pinned) },
          { label: "Reload", click: () => { c.activateTab(a.id); c.reload(); } },
          { type: "separator" },
          { label: "Close Tab", click: () => c.closeTab(a.id) },
        ]).popup({ window: c.window });
        break;
      }
      case "mainMenu": Menu.getApplicationMenu()?.popup({ window: c.window, x: Math.round(a.x), y: Math.round(a.y) }); break;
      case "profileMenu": {
        const items: Electron.MenuItemConstructorOptions[] = services.profiles.list().map((p) => ({
          label: p.name, type: "radio", checked: c.ctx.kind === "profile" && c.ctx.profileId === p.id,
          click: () => { if (!(c.ctx.kind === "profile" && c.ctx.profileId === p.id)) deps.openProfileWindow(p.id); },
        }));
        items.push({ type: "separator" }, { label: "New Private Window", click: () => deps.openPrivateWindow() },
          { label: "Manage Profiles…", click: () => c.newTab("nexora://settings/") });
        Menu.buildFromTemplate(items).popup({ window: c.window, x: Math.round(a.x), y: Math.round(a.y) });
        break;
      }
    }
  });

  /* -------------------- internal pages (nexora://…) -------------------- */
  const internalContext = (e: IpcMainInvokeEvent) => {
    const c = BrowserWindowController.byWebContents.get(e.sender.id);
    if (!c) return null;
    const tab = c.tabByWebContents(e.sender);
    // Must be a tab currently showing an internal page, and the calling frame must be that page's top frame.
    if (!tab || tab.kind !== "internal" || !e.senderFrame || e.senderFrame.parent !== null || !isInternalSenderUrl(e.senderFrame.url)) return null;
    return { c, tab };
  };

  ipcMain.handle(CH.internalInvoke, async (e, method: unknown, args: unknown): Promise<InternalResult> => {
    const ctx = internalContext(e);
    if (!ctx) return fail("Not allowed.");
    if (!isInternalMethod(method)) return fail("Unknown request.");
    const { c } = ctx;
    const profile = c.ctx.kind === "profile" ? c.ctx.profileId : null;
    const privateMsg = "This isn't available in private windows.";
    try {
      const a = args === undefined ? {} : obj(args);
      switch (method) {
        case "page:init": {
          const s = c.state();
          return ok({ theme: s.theme, private: c.isPrivate, profile: s.profile, versions: { app: app.getVersion(), electron: process.versions.electron, chromium: process.versions.chrome } });
        }
        case "newtab:data": {
          const top = profile ? services.bookmarksFor(profile).list().slice(0, 8).map((b) => ({ title: b.title, url: b.url })) : [];
          const engine = c.profile?.settings.searchEngine ?? "google";
          return ok({ quickLinks: QUICK_LINKS, topBookmarks: top, engineName: SEARCH_ENGINES[engine].name, private: c.isPrivate });
        }
        case "nav:open": {
          const url = str(a.url);
          if (!isSafeNavigationUrl(url)) return fail("That address can't be opened.");
          c.loadInTab(ctx.tab.id, url, "user");
          return ok();
        }
        case "nav:go": { const msg = c.go(str(a.input, 8192), ctx.tab.id); return msg ? fail(msg) : ok(); }

        /* bookmarks */
        case "bookmarks:list": return profile ? ok(services.bookmarksFor(profile).list({ search: optStr(a.search, 200) })) : fail(privateMsg);
        case "bookmarks:folders": return profile ? ok(services.bookmarksFor(profile).folders()) : fail(privateMsg);
        case "bookmarks:add": { if (!profile) return fail(privateMsg); const r = services.bookmarksFor(profile).add({ title: str(a.title, 300), url: str(a.url), folderId: (optStr(a.folderId, 100) || null) }); c.queuePush(); return ok(r); }
        case "bookmarks:update": { if (!profile) return fail(privateMsg); const r = services.bookmarksFor(profile).update(str(a.id, 100), { title: optStr(a.title, 300), url: optStr(a.url), folderId: a.folderId === undefined ? undefined : (optStr(a.folderId as string, 100) || null) }); c.queuePush(); return ok(r); }
        case "bookmarks:remove": { if (!profile) return fail(privateMsg); services.bookmarksFor(profile).remove(str(a.id, 100)); c.queuePush(); return ok(); }
        case "bookmarks:addFolder": { if (!profile) return fail(privateMsg); return ok(services.bookmarksFor(profile).addFolder(str(a.name, 100))); }
        case "bookmarks:removeFolder": { if (!profile) return fail(privateMsg); services.bookmarksFor(profile).removeFolder(str(a.id, 100)); c.queuePush(); return ok(); }

        /* history */
        case "history:list": return profile ? ok({ enabled: services.prefs.value.recordHistory, entries: services.historyFor(profile).list({ search: optStr(a.search, 200), limit: 500 }) }) : fail(privateMsg);
        case "history:remove": { if (!profile) return fail(privateMsg); services.historyFor(profile).remove(str(a.id, 100)); return ok(); }
        case "history:clear": { if (!profile) return fail(privateMsg); if (!isClearPeriod(a.period)) return fail("Invalid period."); return ok({ removed: services.historyFor(profile).clear(a.period) }); }

        /* downloads (scoped to this window's own profile / private session) */
        case "downloads:list": return ok({ items: downloads.list(c.scope), private: c.isPrivate });
        case "downloads:cancel": downloads.cancel(c.scope, str(a.id, 100)); return ok();
        case "downloads:remove": downloads.remove(c.scope, str(a.id, 100)); return ok();
        case "downloads:open": { const r = await downloads.open(c.scope, str(a.id, 100), c.window); return r.ok ? ok() : fail(r.error ?? "Couldn't open the file."); }
        case "downloads:show": return downloads.show(c.scope, str(a.id, 100)) ? ok() : fail("The file was moved or deleted.");
        case "downloads:keep": { const r = await downloads.keep(c.scope, str(a.id, 100), c.window); return r.ok ? ok() : fail(r.error ?? "Couldn't keep the file."); }

        /* settings & profiles */
        case "settings:get": return ok({
          private: c.isPrivate,
          prefs: services.prefs.value,
          profile: c.profile ?? null,
          profiles: services.profiles.list().map((p) => ({ id: p.id, name: p.name })),
          engines: Object.values(SEARCH_ENGINES).map((s) => ({ id: s.id, name: s.name })),
          currentProfileId: profile,
        });
        case "settings:update": {
          if (!profile) return fail(privateMsg);
          const patch: Record<string, unknown> = {};
          if (a.homepage !== undefined) patch.homepage = str(a.homepage);
          if (a.searchEngine !== undefined) { if (!isSearchEngineId(a.searchEngine)) return fail("Unknown search engine."); patch.searchEngine = a.searchEngine; }
          if (a.theme !== undefined) patch.theme = str(a.theme, 10);
          services.profiles.updateSettings(profile, patch);
          for (const w of BrowserWindowController.all) { w.queuePush(); w.notifyInternal("settings"); }
          return ok();
        }
        case "settings:updatePrefs": {
          services.prefs.update(parsePrivacy({ ...services.prefs.value, ...a }));
          for (const w of BrowserWindowController.all) w.saveSessionNow();
          return ok(services.prefs.value);
        }
        case "profiles:create": { if (c.isPrivate) return fail(privateMsg); const p = services.profiles.create(str(a.name, 100)); await services.profiles.flush(); return ok({ id: p.id, name: p.name }); }
        case "profiles:rename": { if (c.isPrivate) return fail(privateMsg); services.profiles.rename(str(a.id, 100), str(a.name, 100)); for (const w of BrowserWindowController.all) w.queuePush(); return ok(); }
        case "profiles:open": { if (c.isPrivate) return fail(privateMsg); const id = str(a.id, 100); if (!services.profiles.get(id)) return fail("Profile not found."); deps.openProfileWindow(id); return ok(); }
        case "profiles:remove": {
          if (c.isPrivate) return fail(privateMsg);
          const id = str(a.id, 100);
          if (!services.profiles.get(id)) return fail("Profile not found.");
          if (services.profiles.list().length <= 1) return fail("You can't delete your only profile.");
          const inUse = [...BrowserWindowController.all].some((w) => w.ctx.kind === "profile" && w.ctx.profileId === id);
          if (inUse) return fail("Close all windows using this profile first.");
          const r = await dialog.showMessageBox(c.window, { type: "warning", buttons: ["Cancel", "Delete profile"], defaultId: 0, cancelId: 0, title: "Delete profile?",
            message: `Delete “${services.profiles.get(id)!.name}”?`, detail: "Its cookies, logins, site data, bookmarks and history on this device will be permanently deleted." });
          if (r.response !== 1) return fail("Cancelled.");
          await deps.deleteProfileData(id);
          return ok();
        }
      }
    } catch (err) {
      return fail(err instanceof Error ? err.message : "Something went wrong.");
    }
  });
}

export function windowFromWebContents(wc: WebContents | null): BrowserWindow | null {
  if (!wc) return null;
  const c = BrowserWindowController.byWebContents.get(wc.id);
  return c?.window ?? null;
}

