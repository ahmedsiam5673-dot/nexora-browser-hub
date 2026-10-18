import { banner, bridge, confirmDialog, fmtDay, fmtTime, h, init, onChange, root, skeleton } from "./lib";

interface Entry { id: string; title: string; url: string; visitedAt: number }
let search = "";

async function load(el: HTMLElement) {
  el.replaceChildren(...skeleton(5));
  const r = await bridge.invoke<{ enabled: boolean; entries: Entry[] }>("history:list", { search });
  el.replaceChildren();
  if (!r.ok) { el.append(banner("err", r.error ?? "Couldn't load history.")); return; }
  const { enabled, entries } = r.data!;
  if (!enabled) el.append(h("p", { class: "msg ok" }, "History recording is turned off in Settings, so new visits aren't being saved."));
  if (entries.length === 0) {
    el.append(h("div", { class: "empty card" }, h("b", {}, search ? `No history matches “${search}”` : "No history yet"), search ? "Try a different search." : "Pages you visit in normal windows will appear here."));
    return;
  }
  let day = "";
  let card: HTMLElement | null = null;
  for (const e of entries) {
    const d = fmtDay(e.visitedAt);
    if (d !== day) { day = d; el.append(h("h2", { style: "margin-top:18px" }, d)); card = h("div", { class: "card" }); el.append(card); }
    card!.append(h("div", { class: "item" },
      h("span", { class: "time" }, fmtTime(e.visitedAt)),
      h("div", { class: "grow" }, h("a", { href: "#", onClick: (ev: Event) => { ev.preventDefault(); void bridge.invoke("nav:open", { url: e.url }); } }, e.title || e.url), h("small", {}, e.url)),
      h("button", { class: "link", "aria-label": `Remove ${e.title || e.url} from history`, onClick: async () => { await bridge.invoke("history:remove", { id: e.id }); void load(el); } }, "Remove")));
  }
}

async function main() {
  const info = await init();
  const el = root();
  const list = h("div", {});
  if (info.private) { el.append(h("h1", {}, "History"), h("div", { class: "empty card" }, h("b", {}, "Private windows don't keep history"), "Nothing you do here is recorded.")); return; }
  const input = h("input", { type: "search", placeholder: "Search history", "aria-label": "Search history", value: "" });
  input.addEventListener("input", () => { search = (input as HTMLInputElement).value; void load(list); });
  const clear = h("select", { "aria-label": "Clear browsing history for…" },
    h("option", { value: "" }, "Clear history…"), h("option", { value: "hour" }, "Last hour"), h("option", { value: "day" }, "Last 24 hours"), h("option", { value: "week" }, "Last 7 days"), h("option", { value: "all" }, "All time"));
  clear.addEventListener("change", async () => {
    const period = (clear as HTMLSelectElement).value; (clear as HTMLSelectElement).value = "";
    if (!period) return;
    const label = { hour: "the last hour", day: "the last 24 hours", week: "the last 7 days", all: "all time" }[period] as string;
    if (await confirmDialog("Clear browsing history?", `This permanently removes history from ${label} for this profile. Cookies and bookmarks are not affected.`, "Clear history")) { await bridge.invoke("history:clear", { period }); void load(list); }
  });
  el.append(h("h1", {}, "History"), h("p", { class: "sub" }, `Profile: ${info.profile?.name ?? ""}`), h("div", { class: "row card" }, h("div", { class: "grow" }, input), h("div", { style: "width:190px" }, clear)), list);
  void load(list);
  onChange("history", () => void load(list));
}
void main();
