import { banner, bridge, fmtBytes, h, init, onChange, root, skeleton } from "./lib";

interface Item { id: string; filename: string; source: string; path: string; state: string; receivedBytes: number; totalBytes: number; startedAt: number; error?: string; private: boolean; kept?: boolean }

async function load(el: HTMLElement, isPrivate: boolean) {
  const r = await bridge.invoke<{ items: Item[] }>("downloads:list");
  el.replaceChildren();
  if (!r.ok) { el.append(banner("err", r.error ?? "Couldn't load downloads.")); return; }
  const items = r.data!.items;
  if (items.length === 0) { el.append(h("div", { class: "empty card" }, h("b", {}, "No downloads"), "Files you download appear here.")); return; }
  const msg = h("div", {});
  const act = (m: string, id: string) => async () => { const res = await bridge.invoke(m, { id }); msg.replaceChildren(res.ok ? "" : banner("err", res.error ?? "That didn't work.")); };
  const card = h("div", { class: "card" });
  for (const d of items) {
    const pct = d.totalBytes > 0 ? Math.min(100, Math.round((d.receivedBytes / d.totalBytes) * 100)) : 0;
    const status = d.state === "progressing" ? `${fmtBytes(d.receivedBytes)} of ${d.totalBytes > 0 ? fmtBytes(d.totalBytes) : "unknown size"}` : d.state === "completed" ? `${fmtBytes(d.receivedBytes)} · from ${d.source || "unknown"}` : d.state === "cancelled" ? "Cancelled" : (d.error ?? "Failed");
    const buttons: HTMLElement[] = [];
    if (d.state === "progressing") buttons.push(h("button", { onClick: act("downloads:cancel", d.id) }, "Cancel"));
    if (d.state === "completed") {
      buttons.push(h("button", { onClick: act("downloads:open", d.id) }, "Open"));
      if (!d.private) buttons.push(h("button", { onClick: act("downloads:show", d.id) }, "Show in folder"));
      if (d.private && !d.kept) buttons.push(h("button", { onClick: act("downloads:keep", d.id) }, "Keep…"));
    }
    buttons.push(h("button", { onClick: act("downloads:remove", d.id) }, "Remove"));
    const body = h("div", { class: "grow" }, h("strong", {}, d.filename), h("small", { class: d.state === "interrupted" ? "err" : "" }, status));
    if (d.state === "progressing") body.append(h("div", { class: "bar", role: "progressbar", "aria-valuenow": String(pct), "aria-valuemin": "0", "aria-valuemax": "100", "aria-label": `${d.filename} progress` }, h("i", { style: `width:${pct}%` })));
    card.append(h("div", { class: "item" }, body, ...buttons));
  }
  el.append(msg, card);
  if (isPrivate) el.append(h("p", { class: "muted" }, "Private downloads are saved to a temporary folder and deleted when this window closes unless you choose “Keep…”."));
}

async function main() {
  const info = await init();
  const el = root();
  const list = h("div", {}, ...skeleton(3));
  el.append(h("h1", {}, "Downloads"), h("p", { class: "sub" }, info.private ? "Private window" : `Profile: ${info.profile?.name ?? ""}`), list);
  void load(list, info.private);
  onChange("downloads", () => void load(list, info.private));
}
void main();
