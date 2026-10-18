import { banner, bridge, confirmDialog, h, init, onChange, root } from "./lib";

interface Prefs { recordHistory: boolean; restoreTabs: boolean; askDownloadLocation: boolean; sendGlobalPrivacyControl: boolean }
interface Data {
  private: boolean; prefs: Prefs;
  profile: { id: string; name: string; settings: { homepage: string; searchEngine: string; theme: string } } | null;
  profiles: { id: string; name: string }[]; engines: { id: string; name: string }[]; currentProfileId: string | null;
}

async function render(el: HTMLElement) {
  const r = await bridge.invoke<Data>("settings:get");
  el.replaceChildren();
  if (!r.ok || !r.data) { el.append(banner("err", r.error ?? "Couldn't load settings.")); return; }
  const d = r.data;
  el.append(h("h1", {}, "Settings"));

  const msg = h("div", {});
  const say = (kind: "ok" | "err", t: string) => msg.replaceChildren(banner(kind, t));
  el.append(msg);

  if (d.private || !d.profile) {
    el.append(h("div", { class: "card" }, h("p", {}, "Profile settings aren't available in private windows. Open a normal window to change them.")));
  } else {
    const p = d.profile;
    const hp = h("input", { type: "text", value: p.settings.homepage, id: "hp" });
    const se = h("select", { id: "se" }, ...d.engines.map((e) => h("option", { value: e.id, selected: e.id === p.settings.searchEngine }, e.name)));
    const th = h("select", { id: "th" }, ...[["system", "Match my device"], ["light", "Light"], ["dark", "Dark"]].map(([v, l]) => h("option", { value: v, selected: v === p.settings.theme }, l)));
    el.append(h("div", { class: "card" }, h("h2", {}, `Profile: ${p.name}`),
      h("label", { class: "field" }, h("span", {}, "Homepage (use nexora://newtab/ for the new tab page)"), hp),
      h("label", { class: "field" }, h("span", {}, "Search engine"), se),
      h("label", { class: "field" }, h("span", {}, "Theme"), th),
      h("button", { class: "primary", onClick: async () => {
        const res = await bridge.invoke("settings:update", { homepage: (hp as HTMLInputElement).value, searchEngine: (se as HTMLSelectElement).value, theme: (th as HTMLSelectElement).value });
        say(res.ok ? "ok" : "err", res.ok ? "Profile settings saved." : (res.error ?? "Couldn't save."));
      } }, "Save profile settings")));
  }

  const checks: [keyof Prefs, string, string][] = [
    ["recordHistory", "Record browsing history", "Normal windows only. Private windows are never recorded."],
    ["restoreTabs", "Restore tabs after restart", "Normal profiles only. Never applies to private windows."],
    ["askDownloadLocation", "Ask where to save each download", "Otherwise files go to your Downloads folder."],
    ["sendGlobalPrivacyControl", "Send Global Privacy Control signal", "Asks sites not to sell or share your data. Sites may ignore it."],
  ];
  el.append(h("div", { class: "card" }, h("h2", {}, "Privacy and downloads (all profiles)"),
    ...checks.map(([k, t, s]) => h("label", { class: "check" }, h("input", { type: "checkbox", checked: d.prefs[k], onChange: async (e: Event) => {
      const res = await bridge.invoke("settings:updatePrefs", { [k]: (e.target as HTMLInputElement).checked });
      say(res.ok ? "ok" : "err", res.ok ? "Saved." : (res.error ?? "Couldn't save."));
    } }), h("span", {}, t, h("small", {}, s))))));

  if (!d.private) {
    const list = h("div", {});
    for (const p of d.profiles) {
      const current = p.id === d.currentProfileId;
      list.append(h("div", { class: "item" }, h("div", { class: "grow" }, h("strong", {}, p.name), current ? h("span", { class: "pill", style: "margin-left:8px" }, "this window") : null),
        h("button", { onClick: async () => {
          const dlg = h("dialog", { "aria-labelledby": "rn" }, h("h2", { id: "rn" }, "Rename profile"), h("input", { type: "text", value: p.name, maxLength: 40, "aria-label": "Profile name", id: "rnv" }), h("div", { id: "rne" }),
            h("div", { class: "row", style: "justify-content:flex-end;margin-top:14px" }, h("button", { onClick: () => dlg.close() }, "Cancel"), h("button", { class: "primary", onClick: async () => {
              const res = await bridge.invoke("profiles:rename", { id: p.id, name: (dlg.querySelector("#rnv") as HTMLInputElement).value });
              if (!res.ok) dlg.querySelector("#rne")!.replaceChildren(banner("err", res.error ?? "Couldn't rename.")); else { dlg.close(); void render(el); }
            } }, "Save")));
          dlg.addEventListener("close", () => dlg.remove()); document.body.append(dlg); dlg.showModal();
        } }, "Rename"),
        current ? null : h("button", { onClick: async () => { const res = await bridge.invoke("profiles:open", { id: p.id }); if (!res.ok) say("err", res.error ?? "Couldn't open."); } }, "Open"),
        d.profiles.length > 1 && !current ? h("button", { onClick: async () => {
          if (!(await confirmDialog(`Delete “${p.name}”?`, "Its cookies, logins, site data, bookmarks and history on this device will be permanently deleted.", "Delete profile"))) return;
          const res = await bridge.invoke("profiles:remove", { id: p.id });
          if (!res.ok && res.error !== "Cancelled.") say("err", res.error ?? "Couldn't delete."); else void render(el);
        } }, "Delete") : null));
    }
    const name = h("input", { type: "text", placeholder: "New profile name (e.g. Work)", maxLength: 40, "aria-label": "New profile name" });
    el.append(h("div", { class: "card" }, h("h2", {}, "Profiles"),
      h("p", { class: "muted" }, "Each profile has its own cookies, website logins, storage, bookmarks, history and settings. They are separate from your NEXORA account and from any Google account you sign in to on a website."),
      list, h("div", { class: "row", style: "margin-top:12px" }, h("div", { class: "grow" }, name),
        h("button", { class: "primary", onClick: async () => { const res = await bridge.invoke("profiles:create", { name: (name as HTMLInputElement).value }); if (!res.ok) say("err", res.error ?? "Couldn't create."); else void render(el); } }, "Create profile"))));
  }
  el.append(h("p", { class: "muted", style: "font-size:13px" }, "These settings live on this device. The desktop app doesn't sync with your NEXORA web account yet."));
}

async function main() { await init(); const el = root(); await render(el); onChange("settings", () => void render(el)); }
void main();
