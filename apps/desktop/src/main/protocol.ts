import fs from "node:fs";
import path from "node:path";
import type { Session } from "electron";
import { INTERNAL_PAGES } from "./navigation-policy";

const PAGE_HOSTS = new Set<string>([...INTERNAL_PAGES, "chrome"]);
const ASSET_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,80}$/;
const TYPES: Record<string, string> = { ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".html": "text/html; charset=utf-8" };

/** No inline script or style, nothing remote: internal pages can only run code that ships in the app bundle. */
export const INTERNAL_CSP = [
  "default-src 'none'", "script-src nexora://assets", "style-src nexora://assets", "img-src nexora://assets data:",
  "base-uri 'none'", "form-action 'none'", "frame-ancestors 'none'",
].join("; ");

export interface ResolvedAsset { file: string; type: string; isPage: boolean }

/** Pure resolver (unit-tested): maps a nexora:// URL to a file inside `root`, or null. */
export function resolveInternalAsset(rawUrl: string, root: string): ResolvedAsset | null {
  let u: URL;
  try { u = new URL(rawUrl); } catch { return null; }
  if (u.protocol !== "nexora:" || u.username || u.password) return null;
  if (u.hostname === "assets") {
    const name = decodeURIComponent(u.pathname.slice(1));
    const ext = path.extname(name);
    if (!ASSET_NAME.test(name) || name.includes("..") || !TYPES[ext] || ext === ".html") return null;
    const assetsDir = path.resolve(root, "assets");
    const file = path.resolve(assetsDir, name);
    if (!file.startsWith(assetsDir + path.sep)) return null; // defense in depth: never leave the assets folder
    return { file, type: TYPES[ext]!, isPage: false };
  }
  if (PAGE_HOSTS.has(u.hostname) && (u.pathname === "/" || u.pathname === "")) {
    return { file: path.join(root, `${u.hostname}.html`), type: TYPES[".html"]!, isPage: true };
  }
  return null;
}

export function registerInternalProtocol(ses: Session, root: string): void {
  ses.protocol.handle("nexora", async (request) => {
    const asset = resolveInternalAsset(request.url, root);
    if (!asset) return new Response("Not found", { status: 404, headers: { "Content-Type": "text/plain" } });
    try {
      const data = await fs.promises.readFile(asset.file);
      const headers: Record<string, string> = { "Content-Type": asset.type, "X-Content-Type-Options": "nosniff", "Cache-Control": "no-store" };
      if (asset.isPage) { headers["Content-Security-Policy"] = INTERNAL_CSP; headers["Referrer-Policy"] = "no-referrer"; }
      return new Response(new Uint8Array(data), { status: 200, headers });
    } catch {
      return new Response("Not found", { status: 404, headers: { "Content-Type": "text/plain" } });
    }
  });
}
