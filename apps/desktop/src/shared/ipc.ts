/** IPC contract between the main process and the two kinds of trusted renderers. */
import type { ClearPeriod } from "../main/storage/history";

export const CH = {
  chromeState: "chrome:state", // main -> chrome UI push
  chromeGetState: "chrome:get-state",
  chromeAction: "chrome:action",
  chromeFocusAddress: "chrome:focus-address", // main -> chrome UI
  internalInvoke: "internal:invoke",
  internalEvent: "internal:event", // main -> internal page push
} as const;

export type ChromeAction =
  | { type: "newTab" }
  | { type: "closeTab"; id: number }
  | { type: "activateTab"; id: number }
  | { type: "moveTab"; id: number; to: number }
  | { type: "tabMenu"; id: number }
  | { type: "back" } | { type: "forward" } | { type: "reload" } | { type: "stop" } | { type: "home" }
  | { type: "go"; input: string }
  | { type: "toggleBookmark" }
  | { type: "openBookmark"; id: string }
  | { type: "mainMenu"; x: number; y: number }
  | { type: "profileMenu"; x: number; y: number };

const isInt = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 0 && v < 1e9;
const isStr = (v: unknown, max = 4096): v is string => typeof v === "string" && v.length <= max;
const isCoord = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && Math.abs(v) < 1e5;

export function parseChromeAction(raw: unknown): ChromeAction | null {
  if (typeof raw !== "object" || raw === null) return null;
  const o = raw as Record<string, unknown>;
  switch (o.type) {
    case "newTab": case "back": case "forward": case "reload": case "stop": case "home": case "toggleBookmark":
      return { type: o.type };
    case "closeTab": case "activateTab": case "tabMenu":
      return isInt(o.id) ? { type: o.type, id: o.id } : null;
    case "moveTab":
      return isInt(o.id) && isInt(o.to) ? { type: "moveTab", id: o.id, to: o.to } : null;
    case "go":
      return isStr(o.input, 8192) ? { type: "go", input: o.input } : null;
    case "openBookmark":
      return isStr(o.id, 100) ? { type: "openBookmark", id: o.id } : null;
    case "mainMenu": case "profileMenu":
      return isCoord(o.x) && isCoord(o.y) ? { type: o.type, x: o.x, y: o.y } : null;
    default:
      return null;
  }
}

/** Methods an internal (nexora://) page may call. Anything else is rejected by name. */
export const INTERNAL_METHODS = [
  "page:init", "newtab:data", "nav:open", "nav:go",
  "bookmarks:list", "bookmarks:folders", "bookmarks:add", "bookmarks:update", "bookmarks:remove", "bookmarks:addFolder", "bookmarks:removeFolder",
  "history:list", "history:remove", "history:clear",
  "downloads:list", "downloads:cancel", "downloads:remove", "downloads:open", "downloads:show", "downloads:keep",
  "settings:get", "settings:update", "settings:updatePrefs",
  "profiles:create", "profiles:rename", "profiles:remove", "profiles:open",
] as const;
export type InternalMethod = (typeof INTERNAL_METHODS)[number];

export function isInternalMethod(v: unknown): v is InternalMethod {
  return typeof v === "string" && (INTERNAL_METHODS as readonly string[]).includes(v);
}

export const CLEAR_PERIODS: readonly ClearPeriod[] = ["hour", "day", "week", "all"];
export function isClearPeriod(v: unknown): v is ClearPeriod {
  return typeof v === "string" && (CLEAR_PERIODS as readonly string[]).includes(v);
}

export interface InternalResult<T = unknown> { ok: boolean; data?: T; error?: string }
