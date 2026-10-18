import { bridge, h, init, root } from "./lib";

interface Data { quickLinks: { name: string; url: string }[]; topBookmarks: { title: string; url: string }[]; engineName: string; private: boolean }

async function main() {
  const info = await init();
  const r = await bridge.invoke<Data>("newtab:data");
  const d = r.data;
  const el = root();

  const input = h("input", { type: "search", id: "q", placeholder: `Search ${d?.engineName ?? "the web"} or enter address`, "aria-label": "Search or enter address", autocomplete: "off", spellcheck: false });
  const err = h("div", {});
  const form = h("form", { onSubmit: async (e: Event) => {
    e.preventDefault(); err.replaceChildren();
    const res = await bridge.invoke("nav:go", { input: (input as HTMLInputElement).value });
    if (!res.ok && res.error) err.append(h("p", { class: "msg err", role: "alert" }, res.error));
  } }, input);

  const hero = h("div", { class: "hero" }, h("h1", {}, info.private ? "Private window" : "NEXORA"), form, err);
  el.append(hero);
  queueMicrotask(() => (input as HTMLInputElement).focus());

  if (info.private) {
    el.append(h("div", { class: "banner" },
      h("b", {}, "What private mode does: "), "keeps this window's cookies, logins, history and cache separate from your profiles and deletes them when the window closes. Nothing is added to history or bookmarks, and downloads go to a temporary folder you can choose to keep. ",
      h("br", {}), h("b", {}, "What it doesn't do: "), "hide you from the websites you visit, your internet provider, your employer or school, or anyone watching your network. It does not make you anonymous."));
  }

  const tile = (name: string, url: string) => h("a", { class: "tile", href: "#", onClick: (e: Event) => { e.preventDefault(); void bridge.invoke("nav:open", { url }); } },
    h("span", { class: "ico", "aria-hidden": "true" }, (name[0] ?? "?").toUpperCase()), h("span", {}, name));

  el.append(h("h2", {}, "Quick access"), h("div", { class: "grid", role: "list" }, ...(d?.quickLinks ?? []).map((l) => tile(l.name, l.url))));
  if (!info.private) {
    el.append(h("h2", { style: "margin-top:24px" }, "Bookmarks"));
    if (!d?.topBookmarks.length) el.append(h("p", { class: "muted" }, "No bookmarks yet. Press Ctrl+D (⌘D on Mac) on any page to add one."));
    else el.append(h("div", { class: "grid" }, ...d.topBookmarks.map((b) => tile(b.title, b.url))));
  }
  el.append(h("p", { class: "muted", style: "margin-top:24px;font-size:13px" }, "You sign in to Gmail and other Google services on Google's own site, inside this browser. Your NEXORA account is separate."));
}
void main();
