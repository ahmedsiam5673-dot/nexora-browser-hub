import { banner, bridge, confirmDialog, h, init, onChange, root, skeleton } from "./lib";

interface Folder { id: string; name: string }
interface Mark { id: string; title: string; url: string; folderId: string | null }
let search = ""; let filter = "all";

async function load(el: HTMLElement) {
  el.replaceChildren(...skeleton(4));
  const [m, f] = await Promise.all([bridge.invoke<Mark[]>("bookmarks:list", { search }), bridge.invoke<Folder[]>("bookmarks:folders")]);
  el.replaceChildren();
  if (!m.ok || !f.ok) { el.append(banner("err", m.error ?? f.error ?? "Couldn't load bookmarks.")); return; }
  const folders = f.data!;
  const marks = m.data!.filter((b) => filter === "all" || (filter === "none" ? !b.folderId : b.folderId === filter));

  const chips = h("div", { class: "row", role: "group", "aria-label": "Folders" });
  const chip = (id: string, label: string) => h("button", { class: filter === id ? "primary" : "", "aria-pressed": String(filter === id), onClick: () => { filter = id; void load(el); } }, label);
  chips.append(chip("all", "All"), chip("none", "Unfiled"), ...folders.map((x) => chip(x.id, x.name)));
  const msg = h("div", {});
  const nf = h("input", { type: "text", placeholder: "New folder", "aria-label": "New folder name", maxLength: 80 });
  const addFolder = h("button", { onClick: async () => { const r = await bridge.invoke("bookmarks:addFolder", { name: (nf as HTMLInputElement).value }); if (!r.ok) msg.replaceChildren(banner("err", r.error ?? "Couldn't create the folder.")); else void load(el); } }, "Create folder");
  el.append(h("div", { class: "card" }, chips, h("div", { class: "row", style: "margin-top:12px" }, h("div", { class: "grow" }, nf), addFolder), msg));

  if (marks.length === 0) { el.append(h("div", { class: "empty card" }, h("b", {}, search ? `No bookmarks match “${search}”` : "No bookmarks here yet"), "Press Ctrl+D (⌘D on Mac) on a page to add one.")); return; }
  const card = h("div", { class: "card" });
  for (const b of marks) {
    const title = h("input", { type: "text", value: b.title, "aria-label": "Name", maxLength: 300 });
    const url = h("input", { type: "text", value: b.url, "aria-label": "Address" });
    const sel = h("select", { "aria-label": "Folder" }, h("option", { value: "" }, "No folder"), ...folders.map((x) => h("option", { value: x.id, selected: x.id === b.folderId }, x.name)));
    const err = h("div", {});
    const edit = h("button", { onClick: async () => {
      const dlg = h("dialog", { "aria-labelledby": "ed" }, h("h2", { id: "ed" }, "Edit bookmark"), h("label", { class: "field" }, h("span", {}, "Name"), title), h("label", { class: "field" }, h("span", {}, "Address"), url), h("label", { class: "field" }, h("span", {}, "Folder"), sel), err,
        h("div", { class: "row", style: "justify-content:flex-end" }, h("button", { onClick: () => dlg.close() }, "Cancel"),
          h("button", { class: "primary", onClick: async () => {
            const r = await bridge.invoke("bookmarks:update", { id: b.id, title: (title as HTMLInputElement).value, url: (url as HTMLInputElement).value, folderId: (sel as HTMLSelectElement).value });
            if (!r.ok) err.replaceChildren(banner("err", r.error ?? "Couldn't save.")); else { dlg.close(); void load(el); }
          } }, "Save")));
      dlg.addEventListener("close", () => dlg.remove()); document.body.append(dlg); dlg.showModal();
    } }, "Edit");
    const del = h("button", { onClick: async () => { if (await confirmDialog("Delete this bookmark?", `“${b.title}” will be removed.`, "Delete")) { await bridge.invoke("bookmarks:remove", { id: b.id }); void load(el); } } }, "Delete");
    card.append(h("div", { class: "item" }, h("div", { class: "grow" }, h("a", { href: "#", onClick: (e: Event) => { e.preventDefault(); void bridge.invoke("nav:open", { url: b.url }); } }, b.title), h("small", {}, b.url)), edit, del));
  }
  el.append(card);
  if (filter !== "all" && filter !== "none") el.append(h("button", { class: "link", onClick: async () => { if (await confirmDialog("Delete this folder?", "Its bookmarks are kept and moved to Unfiled.", "Delete folder")) { await bridge.invoke("bookmarks:removeFolder", { id: filter }); filter = "all"; void load(el); } } }, "Delete this folder"));
}

async function main() {
  const info = await init();
  const el = root();
  if (info.private) { el.append(h("h1", {}, "Bookmarks"), h("div", { class: "empty card" }, h("b", {}, "Bookmarks aren't available in private windows"), "Open a normal window to manage them.")); return; }
  const list = h("div", {});
  const input = h("input", { type: "search", placeholder: "Search bookmarks", "aria-label": "Search bookmarks" });
  input.addEventListener("input", () => { search = (input as HTMLInputElement).value; void load(list); });
  el.append(h("h1", {}, "Bookmarks"), h("p", { class: "sub" }, `Profile: ${info.profile?.name ?? ""} · stored on this device`), h("div", { class: "card" }, input), list);
  void load(list);
  onChange("bookmarks", () => void load(list));
}
void main();
