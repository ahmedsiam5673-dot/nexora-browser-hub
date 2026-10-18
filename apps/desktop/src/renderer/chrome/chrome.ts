import type { WindowState, TabState } from "../../shared/types";

type State = WindowState & { notice: string | null };
interface Bridge {
  getState(): Promise<State | null>;
  action(a: unknown): Promise<void>;
  onState(cb: (s: State) => void): void;
  onFocusAddress(cb: () => void): void;
}
const api = (window as unknown as { nexoraChrome: Bridge }).nexoraChrome;

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const app = $("app"), strip = $("tabstrip"), address = $<HTMLInputElement>("address"), infobar = $("infobar");
const back = $<HTMLButtonElement>("back"), forward = $<HTMLButtonElement>("forward"), reload = $<HTMLButtonElement>("reload");
const star = $<HTMLButtonElement>("star"), profile = $<HTMLButtonElement>("profile"), menu = $<HTMLButtonElement>("menu"), home = $<HTMLButtonElement>("home");

const ICONS = {
  back: '<svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg>',
  forward: '<svg viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"/></svg>',
  reload: '<svg viewBox="0 0 24 24"><path d="M20 12a8 8 0 1 1-2.3-5.7M20 4v5h-5"/></svg>',
  stop: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  home: '<svg viewBox="0 0 24 24"><path d="M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/></svg>',
  star: '<svg viewBox="0 0 24 24"><path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/></svg>',
  menu: '<svg viewBox="0 0 24 24"><circle cx="12" cy="5" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="12" cy="19" r="1.2"/></svg>',
};
back.innerHTML = ICONS.back; forward.innerHTML = ICONS.forward; home.innerHTML = ICONS.home; star.innerHTML = ICONS.star; menu.innerHTML = ICONS.menu; reload.innerHTML = ICONS.reload;

let state: State | null = null;
let dirty = false; // the user is editing the address; don't overwrite it
let dragId: number | null = null;
const send = (a: unknown) => { void api.action(a); };

function tabEl(t: TabState, index: number): HTMLElement {
  const el = document.createElement("div");
  el.className = `tab${t.pinned ? " pinned" : ""}${t.loading ? " loading" : ""}`;
  el.setAttribute("role", "tab");
  el.setAttribute("aria-selected", String(t.active));
  el.tabIndex = t.active ? 0 : -1;
  el.dataset.id = String(t.id);
  el.draggable = true;
  const label = t.title || (t.internal ? "New Tab" : "Loading…");
  el.setAttribute("aria-label", `${label}${t.pinned ? " (pinned)" : ""}${t.loading ? ", loading" : ""}`);
  el.title = label;

  const fav = document.createElement("span");
  fav.className = "fav";
  if (t.favicon) { const img = document.createElement("img"); img.src = t.favicon; img.alt = ""; fav.appendChild(img); }
  else fav.textContent = (label[0] ?? "N").toUpperCase();
  const title = document.createElement("span"); title.className = "title"; title.textContent = label;
  const close = document.createElement("button"); close.className = "close"; close.textContent = "×"; close.setAttribute("aria-label", `Close tab ${label}`); close.tabIndex = -1;
  close.addEventListener("click", (e) => { e.stopPropagation(); send({ type: "closeTab", id: t.id }); });
  el.append(fav, title, close);

  el.addEventListener("mousedown", (e) => { if (e.button === 0) send({ type: "activateTab", id: t.id }); if (e.button === 1) { e.preventDefault(); send({ type: "closeTab", id: t.id }); } });
  el.addEventListener("contextmenu", (e) => { e.preventDefault(); send({ type: "tabMenu", id: t.id }); });
  el.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); send({ type: "activateTab", id: t.id }); }
    if (e.key === "Delete") send({ type: "closeTab", id: t.id });
    if (e.altKey && e.key === "ArrowLeft") { e.preventDefault(); send({ type: "moveTab", id: t.id, to: index - 1 }); }
    if (e.altKey && e.key === "ArrowRight") { e.preventDefault(); send({ type: "moveTab", id: t.id, to: index + 1 }); }
  });
  el.addEventListener("dragstart", (e) => { dragId = t.id; e.dataTransfer?.setData("text/plain", String(t.id)); });
  el.addEventListener("dragover", (e) => { if (dragId !== null && dragId !== t.id) { e.preventDefault(); el.classList.add("dragover"); } });
  el.addEventListener("dragleave", () => el.classList.remove("dragover"));
  el.addEventListener("drop", (e) => { e.preventDefault(); el.classList.remove("dragover"); if (dragId !== null && dragId !== t.id) send({ type: "moveTab", id: dragId, to: index }); dragId = null; });
  el.addEventListener("dragend", () => { dragId = null; });
  return el;
}

function render(s: State) {
  state = s;
  app.dataset.theme = s.theme;
  app.dataset.private = String(s.private);

  strip.replaceChildren(...s.tabs.map(tabEl));
  const plus = document.createElement("button");
  plus.id = "newtab"; plus.textContent = "+"; plus.setAttribute("aria-label", "New tab"); plus.title = "New tab (Ctrl+T)";
  plus.addEventListener("click", () => send({ type: "newTab" }));
  strip.appendChild(plus);

  const active = s.tabs.find((t) => t.active);
  back.disabled = !active?.canGoBack;
  forward.disabled = !active?.canGoForward;
  reload.innerHTML = active?.loading ? ICONS.stop : ICONS.reload;
  reload.setAttribute("aria-label", active?.loading ? "Stop loading" : "Reload");
  reload.title = active?.loading ? "Stop loading" : "Reload (Ctrl+R)";

  if (!dirty && document.activeElement !== address) address.value = s.address;
  star.hidden = s.private;
  star.setAttribute("aria-pressed", String(s.currentBookmarked));
  star.setAttribute("aria-label", s.currentBookmarked ? "Remove bookmark" : "Bookmark this page");
  star.disabled = !s.address;

  profile.textContent = s.private ? "Private" : (s.profile?.name ?? "Profile");
  profile.setAttribute("aria-label", s.private ? "Private window" : `Profile: ${s.profile?.name ?? ""}`);

  infobar.replaceChildren();
  if (s.notice) {
    const n = document.createElement("span"); n.className = "notice"; n.setAttribute("role", "status"); n.textContent = s.notice; infobar.appendChild(n);
  } else if (s.private) {
    const p = document.createElement("span"); p.className = "private";
    p.textContent = "Private window: history, cookies and site data are deleted when this window closes. Websites, your network and your employer or school can still see your activity.";
    infobar.appendChild(p);
  } else if (s.bookmarksBar.length === 0) {
    const e = document.createElement("span"); e.className = "empty"; e.textContent = "Bookmarks you add appear here (Ctrl+D)."; infobar.appendChild(e);
  } else {
    for (const b of s.bookmarksBar) {
      const btn = document.createElement("button"); btn.className = "bm"; btn.textContent = b.title; btn.title = b.url;
      btn.addEventListener("click", () => send({ type: "openBookmark", id: b.id }));
      infobar.appendChild(btn);
    }
  }
}

$("omnibox").addEventListener("submit", (e) => { e.preventDefault(); const v = address.value; dirty = false; send({ type: "go", input: v }); address.blur(); });
address.addEventListener("input", () => { dirty = true; });
address.addEventListener("focus", () => address.select());
address.addEventListener("blur", () => { dirty = false; if (state) address.value = state.address; });
address.addEventListener("keydown", (e) => { if (e.key === "Escape") { dirty = false; if (state) address.value = state.address; address.blur(); } });

back.addEventListener("click", () => send({ type: "back" }));
forward.addEventListener("click", () => send({ type: "forward" }));
reload.addEventListener("click", () => send({ type: state?.tabs.find((t) => t.active)?.loading ? "stop" : "reload" }));
home.addEventListener("click", () => send({ type: "home" }));
star.addEventListener("click", () => send({ type: "toggleBookmark" }));
profile.addEventListener("click", () => { const r = profile.getBoundingClientRect(); send({ type: "profileMenu", x: r.left, y: r.bottom }); });
menu.addEventListener("click", () => { const r = menu.getBoundingClientRect(); send({ type: "mainMenu", x: r.left, y: r.bottom }); });

api.onState(render);
api.onFocusAddress(() => { address.focus(); address.select(); });
void api.getState().then((s) => { if (s) render(s); });
