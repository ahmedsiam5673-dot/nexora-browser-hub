import { h, init, root } from "./lib";

async function main() {
  const info = await init();
  root().append(
    h("h1", {}, "About NEXORA Browser"),
    h("div", { class: "card" },
      h("p", {}, `Version ${info.versions.app}`),
      h("p", { class: "muted" }, `Built on Electron ${info.versions.electron} with Chromium ${info.versions.chromium}.`),
      h("p", {}, "This browser uses the Chromium engine. It does not embed Firefox, Safari or any other engine, and it is not Google Chrome, Microsoft Edge or Brave.")),
    h("div", { class: "card" }, h("h2", {}, "What's stored on this device"),
      h("p", { class: "muted" }, "Each profile keeps its own cookies, site logins and storage, plus its bookmarks and history. Private windows keep all of that in memory and delete it when they close. Nothing here is uploaded to your NEXORA account."),
      h("p", { class: "muted" }, "Known limitations: no extensions, no built-in password manager, no sync with the web dashboard yet, and no Widevine/DRM video.")));
}
void main();
