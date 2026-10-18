import { build } from "esbuild";
import fs from "node:fs";
import path from "node:path";

const out = "dist";
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(path.join(out, "internal", "assets"), { recursive: true });
fs.mkdirSync(path.join(out, "preload"), { recursive: true });

const common = { bundle: true, platform: "node", target: "node22", sourcemap: false, logLevel: "info" };
await build({ ...common, entryPoints: ["src/main/main.ts"], outfile: "dist/main.cjs", format: "cjs", external: ["electron", "electron-updater"] });
for (const n of ["chrome", "internal"]) {
  await build({ ...common, entryPoints: [`src/preload/${n}.ts`], outfile: `dist/preload/${n}.cjs`, format: "cjs", external: ["electron"] });
}

const pages = ["newtab", "history", "bookmarks", "downloads", "settings", "about"];
await build({
  bundle: true, platform: "browser", target: "chrome140", format: "iife", logLevel: "info", minify: false,
  entryPoints: { chrome: "src/renderer/chrome/chrome.ts", ...Object.fromEntries(pages.map((p) => [p, `src/renderer/internal/${p}.ts`])) },
  outdir: "dist/internal/assets",
});
fs.copyFileSync("src/renderer/chrome/chrome.html", "dist/internal/chrome.html");
fs.copyFileSync("src/renderer/chrome/chrome.css", "dist/internal/assets/chrome.css");
fs.copyFileSync("src/renderer/internal/internal.css", "dist/internal/assets/internal.css");
for (const p of pages) fs.copyFileSync(`src/renderer/internal/${p}.html`, `dist/internal/${p}.html`);
console.log("desktop build ok");
