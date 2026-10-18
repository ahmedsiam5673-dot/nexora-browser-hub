import { BrowserWindow, Menu, WebContentsView, app, clipboard, nativeTheme, shell, type Session, type WebContents } from "electron";
import { isSafeNavigationUrl, persistentPartition, privatePartition, resolveOmnibox } from "@nexora/core";
import type { Bookmark, ProfileMeta, TabState, WindowState } from "../shared/types";
import { CH } from "../shared/ipc";
import { decideNavigation, decideWindowOpen, isInternalUrl, type TabKind } from "./navigation-policy";
import { moveTab, nextActiveAfterClose, normalizeOrder } from "./tab-order";
import { DEFAULT_HOMEPAGE } from "./storage/profiles";
import type { AppServices } from "./services";
import type { DownloadManager, DownloadScope } from "./downloads";

export const CHROME_HEIGHT = 116; // tab strip (38) + toolbar (46) + bookmarks/info bar (32)
const NEW_TAB_URL = "nexora://newtab/";

export type WindowContext = { kind: "profile"; profileId: string } | { kind: "private"; sessionId: string };

export interface ControllerDeps {
  services: AppServices;
  downloads: DownloadManager;
  internalSession: Session;
  getWebSession: (partition: string) => Session;
  preloads: { chrome: string; internal: string };
  confirmExternal: (win: BrowserWindow, protocol: string, url: string) => Promise<boolean>;
}

interface Tab {
  id: number;
  view: WebContentsView;
  kind: TabKind;
  pinned: boolean;
  title: string;
  url: string;
  favicon: string | null;
  loading: boolean;
  /** Set while an error page (data: URL) is shown, so Reload retries the real address. */
  errorUrl: string | null;
}

let nextTabId = 1;
const errorPage = (title: string, message: string, url: string) => {
  const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
  const html = `<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><title>${esc(title)}</title>
<style>body{font:16px system-ui,sans-serif;margin:0;display:grid;place-items:center;min-height:100vh;background:#f5f6fb;color:#11131f}@media(prefers-color-scheme:dark){body{background:#0c0e18;color:#eceef8}a{color:#9a8dff!important}}
main{max-width:34rem;padding:2rem}h1{font-size:1.4rem;margin:0 0 .5rem}p{color:#6a7089;line-height:1.5}a{color:#4f3df5}code{word-break:break-all}</style>
<main><h1>${esc(title)}</h1><p>${esc(message)}</p><p><code>${esc(url)}</code></p></main>`;
  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
};

export function describeLoadError(code: number): { title: string; message: string } {
  if (code === -105 || code === -137) return { title: "This site can't be reached", message: "The server's address could not be found. Check for typos, or your internet connection." };
  if (code === -106) return { title: "No internet connection", message: "Check your network connection and try again." };
  if (code === -102 || code === -109) return { title: "This site can't be reached", message: "The site refused the connection or is unreachable." };
  if (code === -312) return { title: "This address is blocked", message: "The address uses a network port that browsers block for safety." };
  if (code === -300 || code === -310) return { title: "That address isn't valid", message: "Check the address for typos and try again." };
  if (code === -118 || code === -7) return { title: "The connection timed out", message: "The site took too long to respond." };
  if (code <= -200 && code > -300) return { title: "Your connection isn't private", message: "The site's security certificate couldn't be verified, so the page was not loaded." };
  return { title: "This page couldn't be loaded", message: `Something went wrong while loading the page (error ${code}).` };
}

export class BrowserWindowController {
  static all = new Set<BrowserWindowController>();
  static byWebContents = new Map<number, BrowserWindowController>();
  static lastFocused: BrowserWindowController | null = null;

  readonly window: BrowserWindow;
  readonly chromeView: WebContentsView;
  readonly partition: string;
  readonly session: Session;
  readonly isPrivate: boolean;
  private tabs: Tab[] = [];
  private activeId = 0;
  private closedStack: { url: string; pinned: boolean }[] = [];
  private popups = new Set<BrowserWindow>();
  private pushTimer: NodeJS.Timeout | null = null;
  private saveTimer: NodeJS.Timeout | null = null;
  private notice: string | null = null;
  private noticeTimer: NodeJS.Timeout | null = null;
  private closing = false;
  private faviconCache = new Map<string, string | null>();
  private onDestroyed: (() => void) | null = null;

  constructor(readonly ctx: WindowContext, private readonly deps: ControllerDeps, opts: { onClosed?: (c: BrowserWindowController) => void } = {}) {
    this.isPrivate = ctx.kind === "private";
    this.partition = ctx.kind === "private" ? privatePartition(ctx.sessionId) : persistentPartition(ctx.profileId);
    this.session = deps.getWebSession(this.partition);

    this.window = new BrowserWindow({
      width: 1280, height: 820, minWidth: 560, minHeight: 420, show: false,
      title: this.isPrivate ? "NEXORA Browser (Private)" : `NEXORA Browser — ${this.profile?.name ?? ""}`,
      backgroundColor: this.isPrivate ? "#1a1a24" : "#f5f6fb", autoHideMenuBar: true,
    });
    this.chromeView = new WebContentsView({
      webPreferences: { session: deps.internalSession, preload: deps.preloads.chrome, sandbox: true, contextIsolation: true, nodeIntegration: false, webSecurity: true, webviewTag: false },
    });
    this.window.contentView.addChildView(this.chromeView);
    BrowserWindowController.all.add(this);
    BrowserWindowController.byWebContents.set(this.chromeView.webContents.id, this);
    this.chromeView.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    this.chromeView.webContents.on("will-navigate", (e) => e.preventDefault());
    void this.chromeView.webContents.loadURL("nexora://chrome/");

    this.window.on("focus", () => { BrowserWindowController.lastFocused = this; });
    this.window.on("resize", () => this.layout());
    this.window.on("enter-full-screen", () => this.layout());
    this.window.on("leave-full-screen", () => this.layout());
    this.window.on("close", () => { this.closing = true; this.saveSessionNow(); });
    this.window.on("closed", () => void this.cleanup(opts.onClosed));
    this.window.once("ready-to-show", () => this.window.show());
    nativeTheme.on("updated", this.themeListener);
    this.layout();
  }

  private themeListener = () => this.queuePush();

  /* ---------------- identity / lookups ---------------- */
  get profile(): ProfileMeta | undefined { return this.ctx.kind === "profile" ? this.deps.services.profiles.get(this.ctx.profileId) : undefined; }
  get scope(): DownloadScope { return this.ctx.kind === "private" ? { private: true, id: this.ctx.sessionId } : { private: false, id: this.ctx.profileId }; }
  get activeTab(): Tab | undefined { return this.tabs.find((t) => t.id === this.activeId); }
  tabByWebContents(wc: WebContents): Tab | undefined { return this.tabs.find((t) => !t.view.webContents.isDestroyed() && t.view.webContents.id === wc.id); }
  internalTabs(): Tab[] { return this.tabs.filter((t) => t.kind === "internal"); }
  isChromeWebContents(wc: WebContents) { return wc.id === this.chromeView.webContents.id; }
  get tabCount() { return this.tabs.length; }
  get focusedWebContents(): WebContents | null { return this.activeTab?.view.webContents ?? null; }
  tabsSnapshot() { return this.tabs.map((t) => ({ id: t.id, url: t.url, title: t.title, kind: t.kind, pinned: t.pinned, loading: t.loading })); }

  /* ---------------- tabs ---------------- */
  newTab(url: string = NEW_TAB_URL, opts: { activate?: boolean; pinned?: boolean; afterActive?: boolean } = {}): number | null {
    const verdict = decideNavigation("web", url, "user");
    if (verdict.action === "block" || verdict.action === "external") return null;
    const kind: TabKind = verdict.kind;
    const tab: Tab = { id: nextTabId++, view: this.createView(kind), kind, pinned: !!opts.pinned, title: "", url, favicon: null, loading: false, errorUrl: null };
    this.wire(tab);
    if (opts.afterActive && this.activeTab) {
      const i = this.tabs.findIndex((t) => t.id === this.activeId);
      this.tabs.splice(i + 1, 0, tab);
    } else this.tabs.push(tab);
    this.tabs = normalizeOrder(this.tabs);
    this.window.contentView.addChildView(tab.view);
    tab.view.setVisible(false);
    if (opts.activate !== false) this.activateTab(tab.id);
    void tab.view.webContents.loadURL(url).catch(() => undefined);
    this.layout();
    this.afterTabsChanged();
    return tab.id;
  }

  closeTab(id: number): void {
    const tab = this.tabs.find((t) => t.id === id);
    if (!tab) return;
    if (!this.isPrivate && (isSafeNavigationUrl(tab.errorUrl ?? tab.url) || tab.kind === "internal")) {
      this.closedStack.push({ url: tab.errorUrl ?? tab.url, pinned: tab.pinned });
      if (this.closedStack.length > 20) this.closedStack.shift();
    }
    const next = this.activeId === id ? nextActiveAfterClose(this.tabs, id) : this.activeId;
    this.tabs = this.tabs.filter((t) => t.id !== id);
    this.destroyView(tab);
    if (this.tabs.length === 0) { this.window.close(); return; }
    if (next !== null) this.activateTab(next);
    this.afterTabsChanged();
  }

  activateTab(id: number): void {
    if (!this.tabs.some((t) => t.id === id)) return;
    this.activeId = id;
    this.layout();
    const t = this.activeTab;
    if (t && !t.view.webContents.isDestroyed()) t.view.webContents.focus();
    this.queuePush();
  }

  duplicateTab(id: number): void {
    const t = this.tabs.find((x) => x.id === id);
    if (t) this.newTab(t.errorUrl ?? t.url, { afterActive: false, activate: true });
  }
  setPinned(id: number, pinned: boolean): void {
    const t = this.tabs.find((x) => x.id === id);
    if (!t) return;
    t.pinned = pinned;
    this.tabs = normalizeOrder(this.tabs);
    this.afterTabsChanged();
  }
  reorder(id: number, to: number): void { this.tabs = moveTab(this.tabs, id, to); this.afterTabsChanged(); }
  reopenClosed(): void { const c = this.closedStack.pop(); if (c) this.newTab(c.url, { pinned: c.pinned }); }
  selectByIndex(i: number): void { const t = i < 0 ? this.tabs[this.tabs.length - 1] : this.tabs[i]; if (t) this.activateTab(t.id); }
  cycle(delta: 1 | -1): void {
    if (this.tabs.length < 2) return;
    const i = this.tabs.findIndex((t) => t.id === this.activeId);
    this.activateTab(this.tabs[(i + delta + this.tabs.length) % this.tabs.length]!.id);
  }

  /* ---------------- navigation ---------------- */
  /** Address-bar / menu navigation (user-initiated). Returns a message when the input can't be opened. */
  go(input: string, tabId: number = this.activeId): string | null {
    const engine = this.profile?.settings.searchEngine ?? "google";
    const r = resolveOmnibox(input, engine);
    if (r.kind === "invalid") {
      // Internal pages are typed as nexora://… and resolveOmnibox rejects non-http(s), so handle them first.
      if (isInternalUrl(input.trim())) { this.loadInTab(tabId, input.trim(), "user"); return null; }
      const msg = r.reason === "empty" ? null : "Only http and https addresses can be opened.";
      if (msg) this.showNotice(msg);
      return msg;
    }
    this.loadInTab(tabId, r.url, "user");
    return null;
  }

  loadInTab(tabId: number, url: string, origin: "user" | "page"): void {
    const tab = this.tabs.find((t) => t.id === tabId);
    if (!tab) return;
    const v = decideNavigation(tab.kind, url, origin);
    if (v.action === "block") { this.showNotice(v.reason); return; }
    if (v.action === "external") { void this.openExternal(url); return; }
    if (v.action === "swap") this.swapView(tab, v.kind);
    tab.url = url; tab.errorUrl = null;
    void tab.view.webContents.loadURL(url).catch(() => undefined);
    this.queuePush();
  }

  back() { const h = this.activeTab?.view.webContents.navigationHistory; if (h?.canGoBack()) h.goBack(); }
  forward() { const h = this.activeTab?.view.webContents.navigationHistory; if (h?.canGoForward()) h.goForward(); }
  reload() {
    const t = this.activeTab; if (!t) return;
    if (t.errorUrl) this.loadInTab(t.id, t.errorUrl, "user"); else t.view.webContents.reload();
  }
  stop() { this.activeTab?.view.webContents.stop(); }
  home() { this.loadInTab(this.activeId, this.profile?.settings.homepage ?? DEFAULT_HOMEPAGE, "user"); }
  focusAddress() { if (!this.chromeView.webContents.isDestroyed()) { this.chromeView.webContents.focus(); this.chromeView.webContents.send(CH.chromeFocusAddress); } }

  /* ---------------- bookmarks ---------------- */
  toggleBookmark(): void {
    if (this.ctx.kind !== "profile") { this.showNotice("Bookmarks aren't available in private windows."); return; }
    const t = this.activeTab;
    const url = t?.errorUrl ?? t?.url ?? "";
    if (!t || !isSafeNavigationUrl(url)) { this.showNotice("Only web pages can be bookmarked."); return; }
    const store = this.deps.services.bookmarksFor(this.ctx.profileId);
    const existing = store.findByUrl(new URL(url).toString());
    if (existing) store.remove(existing.id); else store.add({ title: t.title, url });
    this.queuePush();
    this.notifyInternal("bookmarks");
  }

  /* ---------------- views ---------------- */
  private createView(kind: TabKind): WebContentsView {
    const view = new WebContentsView({
      webPreferences: {
        session: kind === "internal" ? this.deps.internalSession : this.session,
        sandbox: true, contextIsolation: true, nodeIntegration: false, nodeIntegrationInWorker: false, nodeIntegrationInSubFrames: false,
        webSecurity: true, allowRunningInsecureContent: false, webviewTag: false, safeDialogs: true, navigateOnDragDrop: false,
        spellcheck: kind === "web",
        // Only internal pages receive the privileged preload. Web content gets none.
        ...(kind === "internal" ? { preload: this.deps.preloads.internal } : {}),
      },
    });
    BrowserWindowController.byWebContents.set(view.webContents.id, this);
    return view;
  }

  private destroyView(tab: Tab) {
    const wc = tab.view.webContents;
    BrowserWindowController.byWebContents.delete(wc.id);
    try { this.window.contentView.removeChildView(tab.view); } catch { /* window already gone */ }
    if (!wc.isDestroyed()) wc.close({ waitForBeforeUnload: false });
  }

  /** Replace a tab's view so a website never inherits the internal preload (and vice versa). */
  private swapView(tab: Tab, kind: TabKind) {
    const old = tab.view;
    tab.view = this.createView(kind);
    tab.kind = kind;
    tab.favicon = null; tab.title = ""; tab.loading = false;
    this.wire(tab);
    this.window.contentView.addChildView(tab.view);
    tab.view.setVisible(tab.id === this.activeId);
    BrowserWindowController.byWebContents.delete(old.webContents.id);
    try { this.window.contentView.removeChildView(old); } catch { /* ignore */ }
    if (!old.webContents.isDestroyed()) old.webContents.close({ waitForBeforeUnload: false });
    this.layout();
  }

  private wire(tab: Tab) {
    const wc = tab.view.webContents;
    const alive = () => !wc.isDestroyed() && this.tabs.includes(tab) && tab.view.webContents === wc;

    wc.setWindowOpenHandler((details) => {
      const v = decideWindowOpen(details.url, details.disposition, tab.kind);
      if (v.action === "tab") { this.newTab(v.url, { activate: details.disposition !== "background-tab", afterActive: true }); return { action: "deny" }; }
      if (v.action === "external") { void this.openExternal(details.url); return { action: "deny" }; }
      if (v.action === "popup") {
        return { action: "allow", overrideBrowserWindowOptions: {
          width: 520, height: 720, autoHideMenuBar: true, parent: this.window,
          webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, webSecurity: true, webviewTag: false, safeDialogs: true },
        } };
      }
      return { action: "deny" };
    });
    wc.on("did-create-window", (child) => {
      this.popups.add(child);
      BrowserWindowController.byWebContents.set(child.webContents.id, this);
      child.on("closed", () => this.popups.delete(child));
      child.webContents.on("will-navigate", (e, url) => { if (decideNavigation("web", url, "page").action !== "allow") e.preventDefault(); });
      child.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    });

    const guard = (e: { preventDefault(): void }, url: string) => {
      const v = decideNavigation(tab.kind, url, "page");
      if (v.action === "allow") return;
      e.preventDefault();
      if (v.action === "swap") this.loadInTab(tab.id, url, "page");
      else if (v.action === "external") void this.openExternal(url);
      else this.showNotice(v.reason);
    };
    wc.on("will-navigate", (e, url) => guard(e, url));
    wc.on("will-redirect", (e, url) => { if (decideNavigation(tab.kind, url, "page").action !== "allow") { e.preventDefault(); this.showNotice("Blocked an unsafe redirect."); } });

    wc.on("page-title-updated", (_e, title) => {
      if (!alive()) return;
      tab.title = title;
      if (this.ctx.kind === "profile" && tab.kind === "web" && isSafeNavigationUrl(tab.url)) this.deps.services.historyFor(this.ctx.profileId).updateTitle(tab.url, title);
      this.queuePush();
    });
    wc.on("page-favicon-updated", (_e, favicons) => { void this.setFavicon(tab, favicons[0]); });
    wc.on("did-start-loading", () => { if (alive()) { tab.loading = true; this.queuePush(); } });
    wc.on("did-stop-loading", () => { if (alive()) { tab.loading = false; this.queuePush(); } });

    const onNav = (url: string, isMain: boolean) => {
      if (!alive() || !isMain || url.startsWith("data:")) return;
      tab.url = url; tab.errorUrl = null;
      if (this.ctx.kind === "profile" && tab.kind === "web") {
        this.deps.services.historyFor(this.ctx.profileId).record(url, wc.getTitle(), this.deps.services.prefs.value.recordHistory);
        this.notifyInternal("history");
      }
      this.afterTabsChanged();
    };
    wc.on("did-navigate", (_e, url) => onNav(url, true));
    wc.on("did-navigate-in-page", (_e, url, isMain) => onNav(url, isMain));

    wc.on("did-fail-load", (_e, code, _desc, validatedUrl, isMain) => {
      if (!alive() || !isMain || code === -3 /* aborted */ || validatedUrl.startsWith("data:")) return;
      if (tab.kind === "internal") return;
      const { title, message } = describeLoadError(code);
      tab.errorUrl = validatedUrl; tab.url = validatedUrl;
      void wc.loadURL(errorPage(title, message, validatedUrl)).catch(() => undefined);
    });
    wc.on("render-process-gone", (_e, details) => {
      if (!alive()) return;
      tab.errorUrl = tab.url;
      void wc.loadURL(errorPage("This page crashed", `The page stopped unexpectedly (${details.reason}). Reload to try again.`, tab.url)).catch(() => undefined);
    });
    wc.on("context-menu", (_e, p) => {
      const items: Electron.MenuItemConstructorOptions[] = [];
      if (p.linkURL && isSafeNavigationUrl(p.linkURL)) {
        items.push({ label: "Open Link in New Tab", click: () => this.newTab(p.linkURL, { activate: false, afterActive: true }) });
        items.push({ label: "Copy Link Address", click: () => clipboard.writeText(p.linkURL) });
        items.push({ type: "separator" });
      }
      if (p.isEditable) items.push({ role: "cut" }, { role: "copy" }, { role: "paste" }, { role: "selectAll" });
      else if (p.selectionText) items.push({ role: "copy" });
      else items.push({ label: "Back", enabled: wc.navigationHistory.canGoBack(), click: () => wc.navigationHistory.goBack() },
        { label: "Forward", enabled: wc.navigationHistory.canGoForward(), click: () => wc.navigationHistory.goForward() },
        { label: "Reload", click: () => this.reload() });
      if (!app.isPackaged) items.push({ type: "separator" }, { label: "Inspect Element", click: () => wc.inspectElement(p.x, p.y) });
      Menu.buildFromTemplate(items).popup({ window: this.window });
    });
  }

  private async setFavicon(tab: Tab, url: string | undefined) {
    if (!url || !/^https?:/.test(url)) { tab.favicon = null; this.queuePush(); return; }
    if (this.faviconCache.has(url)) { tab.favicon = this.faviconCache.get(url) ?? null; this.queuePush(); return; }
    try {
      // Fetched through the TAB'S OWN session so a private window never caches icons in a persistent store.
      const res = await this.session.fetch(url, { signal: AbortSignal.timeout(5000) });
      const type = res.headers.get("content-type") ?? "";
      const buf = Buffer.from(await res.arrayBuffer());
      const ok = res.ok && /^image\//.test(type) && buf.length > 0 && buf.length <= 64 * 1024;
      const data = ok ? `data:${type.split(";")[0]};base64,${buf.toString("base64")}` : null;
      this.faviconCache.set(url, data);
      if (this.tabs.includes(tab)) { tab.favicon = data; this.queuePush(); }
    } catch { this.faviconCache.set(url, null); }
  }

  private async openExternal(url: string) {
    if (!(await this.deps.confirmExternal(this.window, new URL(url).protocol, url))) return;
    void shell.openExternal(url);
  }

  /* ---------------- layout & state ---------------- */
  layout() {
    if (this.window.isDestroyed()) return;
    const [w = 0, h = 0] = this.window.getContentSize();
    this.chromeView.setBounds({ x: 0, y: 0, width: w, height: CHROME_HEIGHT });
    for (const t of this.tabs) {
      t.view.setBounds({ x: 0, y: CHROME_HEIGHT, width: w, height: Math.max(0, h - CHROME_HEIGHT) });
      t.view.setVisible(t.id === this.activeId);
    }
  }

  showNotice(msg: string) {
    this.notice = msg;
    if (this.noticeTimer) clearTimeout(this.noticeTimer);
    this.noticeTimer = setTimeout(() => { this.notice = null; this.queuePush(); }, 5000);
    this.noticeTimer.unref?.();
    this.queuePush();
  }

  state(): WindowState & { notice: string | null } {
    const profile = this.profile;
    const theme: "light" | "dark" = this.isPrivate ? "dark" : profile?.settings.theme === "dark" ? "dark" : profile?.settings.theme === "light" ? "light" : nativeTheme.shouldUseDarkColors ? "dark" : "light";
    const active = this.activeTab;
    const url = active?.errorUrl ?? active?.url ?? "";
    const store = this.ctx.kind === "profile" ? this.deps.services.bookmarksFor(this.ctx.profileId) : null;
    const bar: Bookmark[] = store ? store.list().slice(0, 12) : [];
    const tabs: TabState[] = this.tabs.map((t) => {
      const h = t.view.webContents.isDestroyed() ? null : t.view.webContents.navigationHistory;
      return { id: t.id, title: t.title || (t.kind === "internal" ? "" : t.url), url: t.url, favicon: t.favicon, loading: t.loading, pinned: t.pinned,
        canGoBack: !!h?.canGoBack(), canGoForward: !!h?.canGoForward(), internal: t.kind === "internal", active: t.id === this.activeId };
    });
    return {
      tabs, activeId: this.activeId, private: this.isPrivate,
      profile: profile ? { id: profile.id, name: profile.name } : null,
      bookmarksBar: bar.map((b) => ({ id: b.id, title: b.title, url: b.url })),
      currentBookmarked: !!store && isSafeNavigationUrl(url) && !!store.findByUrl(new URL(url).toString()),
      theme, address: active && active.kind === "web" ? url : "", notice: this.notice,
    };
  }

  queuePush() {
    if (this.pushTimer) return;
    this.pushTimer = setTimeout(() => {
      this.pushTimer = null;
      const wc = this.chromeView.webContents;
      if (!wc.isDestroyed()) wc.send(CH.chromeState, this.state());
      if (!this.window.isDestroyed()) {
        const a = this.activeTab;
        this.window.setTitle(`${a?.title ? a.title + " — " : ""}NEXORA Browser${this.isPrivate ? " (Private)" : ""}`);
      }
    }, 16);
  }

  private afterTabsChanged() { this.queuePush(); this.scheduleSessionSave(); }

  /** Tell open internal pages (history, bookmarks, downloads…) that their data changed. */
  notifyInternal(topic: "history" | "bookmarks" | "downloads" | "settings") {
    for (const t of this.internalTabs()) if (!t.view.webContents.isDestroyed()) t.view.webContents.send(CH.internalEvent, { topic });
  }

  /* ---------------- session restore ---------------- */
  private scheduleSessionSave() {
    if (this.ctx.kind !== "profile" || this.closing) return;
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.saveSessionNow(), 500);
    this.saveTimer.unref?.();
  }
  saveSessionNow() {
    if (this.ctx.kind !== "profile") return; // private sessions are never saved
    if (this.saveTimer) { clearTimeout(this.saveTimer); this.saveTimer = null; }
    const store = this.deps.services.restoreFor(this.ctx.profileId);
    if (!this.deps.services.prefs.value.restoreTabs) { if (store.load().tabs.length) store.save([], 0); return; }
    const saved = this.tabs.map((t) => ({ url: t.errorUrl ?? t.url, pinned: t.pinned }));
    store.save(saved, Math.max(0, this.tabs.findIndex((t) => t.id === this.activeId)));
  }

  /* ---------------- teardown ---------------- */
  close() { if (!this.window.isDestroyed()) this.window.close(); }

  private async cleanup(onClosed?: (c: BrowserWindowController) => void) {
    nativeTheme.off("updated", this.themeListener);
    if (this.pushTimer) clearTimeout(this.pushTimer);
    if (this.noticeTimer) clearTimeout(this.noticeTimer);
    for (const p of this.popups) if (!p.isDestroyed()) p.destroy();
    this.popups.clear();
    for (const t of this.tabs) { BrowserWindowController.byWebContents.delete(t.view.webContents.id); if (!t.view.webContents.isDestroyed()) t.view.webContents.close({ waitForBeforeUnload: false }); }
    BrowserWindowController.byWebContents.delete(this.chromeView.webContents.id);
    if (!this.chromeView.webContents.isDestroyed()) this.chromeView.webContents.close({ waitForBeforeUnload: false });
    this.tabs = [];
    BrowserWindowController.all.delete(this);
    if (BrowserWindowController.lastFocused === this) BrowserWindowController.lastFocused = null;
    if (this.ctx.kind === "private") await this.wipePrivateSession(this.ctx.sessionId);
    onClosed?.(this);
  }

  /** Private window teardown: delete everything the session held, then the temp downloads. */
  private async wipePrivateSession(sessionId: string) {
    const ses = this.session;
    try {
      await ses.clearStorageData();
      await ses.clearCache();
      await ses.clearAuthCache();
      await ses.clearHostResolverCache();
      await ses.closeAllConnections();
    } catch (e) { console.error("private session cleanup failed", e); }
    this.deps.downloads.discardPrivate(sessionId);
  }

  static active(): BrowserWindowController | null {
    return BrowserWindowController.forWindow(BrowserWindow.getFocusedWindow()) ?? BrowserWindowController.lastFocused ?? [...BrowserWindowController.all][0] ?? null;
  }

  static forWindow(win: BrowserWindow | null): BrowserWindowController | null {
    if (!win) return null;
    for (const c of BrowserWindowController.all) if (c.window === win) return c;
    return null;
  }
}

export const NEW_TAB = NEW_TAB_URL;
