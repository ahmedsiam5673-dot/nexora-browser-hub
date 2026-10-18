import path from "node:path";
import { isSafeNavigationUrl } from "@nexora/core";
import { isInternalUrl } from "../navigation-policy";
import { JsonFile } from "./json-file";

export interface SavedTab { url: string; pinned: boolean }
interface SavedSession { tabs: SavedTab[]; activeIndex: number }

function validate(raw: unknown): SavedSession {
  const o = (raw ?? {}) as Partial<SavedSession>;
  const tabs = Array.isArray(o.tabs)
    ? o.tabs.filter((t) => t && typeof t.url === "string" && (isSafeNavigationUrl(t.url) || isInternalUrl(t.url))).map((t) => ({ url: t.url, pinned: !!t.pinned })).slice(0, 100)
    : [];
  return { tabs, activeIndex: Math.max(0, Math.min(tabs.length - 1, Number(o.activeIndex) || 0)) };
}

/** Per-profile tab restore. Never created for private sessions. */
export class SessionRestoreStore {
  private file: JsonFile<SavedSession>;
  constructor(profileDir: string) {
    this.file = new JsonFile<SavedSession>(path.join(profileDir, "tabs.json"), () => ({ tabs: [], activeIndex: 0 }), validate);
  }
  load(): SavedSession { return this.file.value; }
  save(tabs: SavedTab[], activeIndex: number) { this.file.update(() => validate({ tabs, activeIndex })); }
  clear() { return this.file.remove(); }
  flush() { return this.file.flush(); }
}
