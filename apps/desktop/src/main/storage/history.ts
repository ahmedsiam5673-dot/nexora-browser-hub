import path from "node:path";
import crypto from "node:crypto";
import { isSafeNavigationUrl } from "@nexora/core";
import { JsonFile } from "./json-file";
import type { HistoryEntry } from "../../shared/types";

interface HistoryFile { entries: HistoryEntry[] }
export const MAX_HISTORY = 20_000;
/** Don't log a reload / redirect hop of the same URL more than once per window of time. */
const DEDUPE_MS = 2_000;

function validate(raw: unknown): HistoryFile {
  const o = (raw ?? {}) as Partial<HistoryFile>;
  return { entries: Array.isArray(o.entries) ? o.entries.filter((e) => e && typeof e.id === "string" && isSafeNavigationUrl(String(e.url))) : [] };
}

export type ClearPeriod = "hour" | "day" | "week" | "all";
const PERIOD_MS: Record<Exclude<ClearPeriod, "all">, number> = { hour: 3_600_000, day: 86_400_000, week: 7 * 86_400_000 };

/**
 * Per-profile, normal-mode history. Only http(s) pages are recorded. Private windows are never
 * given a HistoryStore, so there is no code path by which they can write here.
 */
export class HistoryStore {
  private file: JsonFile<HistoryFile>;
  constructor(profileDir: string, private readonly now: () => number = Date.now) {
    this.file = new JsonFile<HistoryFile>(path.join(profileDir, "history.json"), () => ({ entries: [] }), validate);
  }

  record(url: string, title: string, enabled: boolean): HistoryEntry | null {
    if (!enabled || !isSafeNavigationUrl(url)) return null;
    const now = this.now();
    const last = this.file.value.entries[this.file.value.entries.length - 1];
    if (last && last.url === url && now - last.visitedAt < DEDUPE_MS) { this.file.update(() => { if (title) last.title = title; }); return last; }
    const e: HistoryEntry = { id: crypto.randomUUID(), url, title: (title || new URL(url).hostname).slice(0, 300), visitedAt: now };
    this.file.update((d) => { d.entries.push(e); if (d.entries.length > MAX_HISTORY) d.entries.splice(0, d.entries.length - MAX_HISTORY); });
    return e;
  }

  updateTitle(url: string, title: string) {
    const e = [...this.file.value.entries].reverse().find((x) => x.url === url);
    if (e && title) this.file.update(() => { e.title = title.slice(0, 300); });
  }

  list(opts: { search?: string; since?: number; limit?: number } = {}): HistoryEntry[] {
    let items = this.file.value.entries;
    if (opts.since !== undefined) items = items.filter((e) => e.visitedAt >= opts.since!);
    const q = opts.search?.trim().toLowerCase();
    if (q) items = items.filter((e) => e.title.toLowerCase().includes(q) || e.url.toLowerCase().includes(q));
    return [...items].reverse().slice(0, opts.limit ?? 500);
  }

  remove(id: string): void { this.file.update((d) => { d.entries = d.entries.filter((e) => e.id !== id); }); }

  clear(period: ClearPeriod): number {
    const before = this.file.value.entries.length;
    if (period === "all") this.file.update((d) => { d.entries = []; });
    else { const cutoff = this.now() - PERIOD_MS[period]; this.file.update((d) => { d.entries = d.entries.filter((e) => e.visitedAt < cutoff); }); }
    return before - this.file.value.entries.length;
  }

  count() { return this.file.value.entries.length; }
  flush() { return this.file.flush(); }
  destroy() { return this.file.remove(); }
}
