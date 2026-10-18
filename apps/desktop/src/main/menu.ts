import { BrowserWindow, Menu, app, type MenuItemConstructorOptions } from "electron";
import { BrowserWindowController } from "./window";
import type { AppServices } from "./services";

export interface MenuDeps {
  services: AppServices;
  openProfileWindow: (id: string) => void;
  openNormalWindow: () => void;
  openPrivateWindow: () => void;
}

const isMac = process.platform === "darwin";
const act = (fn: (c: BrowserWindowController) => void) => () => { const c = BrowserWindowController.active(); if (c) fn(c); };

export function closeAllPrivateWindows() {
  for (const c of [...BrowserWindowController.all]) if (c.isPrivate) c.close();
}

export function buildMenu(deps: MenuDeps) {
  const profileItems: MenuItemConstructorOptions[] = deps.services.profiles.list().map((p) => ({ label: p.name, click: () => deps.openProfileWindow(p.id) }));
  const template: MenuItemConstructorOptions[] = [
    ...(isMac ? [{ label: app.name, submenu: [{ role: "about" as const }, { type: "separator" as const }, { role: "hide" as const }, { role: "hideOthers" as const }, { role: "unhide" as const }, { type: "separator" as const }, { role: "quit" as const }] }] : []),
    { label: "File", submenu: [
      { id: "new-tab", label: "New Tab", accelerator: "CmdOrCtrl+T", click: act((c) => { c.newTab(); c.focusAddress(); }) },
      { id: "new-window", label: "New Window", accelerator: "CmdOrCtrl+N", click: () => deps.openNormalWindow() },
      { id: "new-private", label: "New Private Window", accelerator: "CmdOrCtrl+Shift+N", click: () => deps.openPrivateWindow() },
      { id: "close-private", label: "Close All Private Windows", click: () => closeAllPrivateWindows() },
      { type: "separator" },
      { id: "reopen-tab", label: "Reopen Closed Tab", accelerator: "CmdOrCtrl+Shift+T", click: act((c) => c.reopenClosed()) },
      { id: "close-tab", label: "Close Tab", accelerator: "CmdOrCtrl+W", click: act((c) => { const t = c.activeTab; if (t) c.closeTab(t.id); }) },
      { id: "close-window", label: "Close Window", accelerator: "CmdOrCtrl+Shift+W", click: act((c) => c.close()) },
      ...(isMac ? [] : [{ type: "separator" as const }, { role: "quit" as const }]),
    ] },
    { label: "Edit", submenu: [{ role: "undo" }, { role: "redo" }, { type: "separator" }, { role: "cut" }, { role: "copy" }, { role: "paste" }, { role: "selectAll" }] },
    { label: "View", submenu: [
      { id: "focus-address", label: "Focus Address Bar", accelerator: "CmdOrCtrl+L", click: act((c) => c.focusAddress()) },
      { id: "reload", label: "Reload", accelerator: "CmdOrCtrl+R", click: act((c) => c.reload()) },
      { id: "reload-f5", label: "Reload (F5)", accelerator: "F5", visible: false, click: act((c) => c.reload()) },
      { id: "stop", label: "Stop Loading", click: act((c) => c.stop()) },
      { type: "separator" },
      { id: "next-tab", label: "Next Tab", accelerator: "Ctrl+Tab", click: act((c) => c.cycle(1)) },
      { id: "prev-tab", label: "Previous Tab", accelerator: "Ctrl+Shift+Tab", click: act((c) => c.cycle(-1)) },
      ...Array.from({ length: 8 }, (_, i): MenuItemConstructorOptions => ({ id: `tab-${i + 1}`, label: `Tab ${i + 1}`, accelerator: `CmdOrCtrl+${i + 1}`, visible: false, click: act((c) => c.selectByIndex(i)) })),
      { id: "tab-last", label: "Last Tab", accelerator: "CmdOrCtrl+9", visible: false, click: act((c) => c.selectByIndex(-1)) },
      { type: "separator" },
      { role: "zoomIn", accelerator: "CmdOrCtrl+=" }, { role: "zoomOut" }, { role: "resetZoom" }, { role: "togglefullscreen" },
    ] },
    { label: "History", submenu: [
      { id: "back", label: "Back", accelerator: isMac ? "Cmd+[" : "Alt+Left", click: act((c) => c.back()) },
      { id: "forward", label: "Forward", accelerator: isMac ? "Cmd+]" : "Alt+Right", click: act((c) => c.forward()) },
      { id: "home", label: "Home", accelerator: isMac ? "Cmd+Shift+H" : "Alt+Home", click: act((c) => c.home()) },
      { type: "separator" },
      { id: "show-history", label: "Show All History", accelerator: isMac ? "Cmd+Y" : "Ctrl+H", click: act((c) => c.newTab("nexora://history/")) },
      { id: "show-downloads", label: "Downloads", accelerator: "CmdOrCtrl+J", click: act((c) => c.newTab("nexora://downloads/")) },
    ] },
    { label: "Bookmarks", submenu: [
      { id: "bookmark-page", label: "Bookmark This Page", accelerator: "CmdOrCtrl+D", click: act((c) => c.toggleBookmark()) },
      { id: "show-bookmarks", label: "Show All Bookmarks", accelerator: "CmdOrCtrl+Shift+O", click: act((c) => c.newTab("nexora://bookmarks/")) },
    ] },
    { label: "Profiles", submenu: [...profileItems, { type: "separator" }, { label: "Manage Profiles…", click: act((c) => c.newTab("nexora://settings/")) }] },
    { label: "Help", submenu: [
      { id: "about", label: "About NEXORA Browser", click: act((c) => c.newTab("nexora://about/")) },
      { id: "settings", label: "Settings", accelerator: "CmdOrCtrl+,", click: act((c) => c.newTab("nexora://settings/")) },
    ] },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

export function focusedWindowController() { return BrowserWindowController.forWindow(BrowserWindow.getFocusedWindow()); }
