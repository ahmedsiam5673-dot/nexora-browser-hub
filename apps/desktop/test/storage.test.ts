import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ProfileStore } from "../src/main/storage/profiles";
import { BookmarkStore } from "../src/main/storage/bookmarks";
import { HistoryStore } from "../src/main/storage/history";
import { PrefsStore } from "../src/main/storage/prefs";
import { SessionRestoreStore } from "../src/main/storage/session-restore";
import { JsonFile } from "../src/main/storage/json-file";

let dir: string;
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), "nexora-store-")); });
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

describe("JsonFile", () => {
  it("persists atomically and survives a reload", async () => {
    const f = new JsonFile<{ n: number }>(path.join(dir, "x.json"), () => ({ n: 0 }));
    f.update((d) => { d.n = 5; });
    await f.flush();
    expect(new JsonFile<{ n: number }>(path.join(dir, "x.json"), () => ({ n: 0 })).value.n).toBe(5);
    expect(fs.readdirSync(dir).filter((x) => x.endsWith(".tmp"))).toHaveLength(0);
  });
  it("recovers from a corrupt file by falling back to defaults", () => {
    fs.writeFileSync(path.join(dir, "bad.json"), "{not json");
    expect(new JsonFile<{ n: number }>(path.join(dir, "bad.json"), () => ({ n: 7 })).value.n).toBe(7);
  });
  it("serialises overlapping flushes without corruption", async () => {
    const f = new JsonFile<{ n: number }>(path.join(dir, "y.json"), () => ({ n: 0 }));
    const writes: Promise<void>[] = [];
    for (let i = 1; i <= 25; i++) { f.update((d) => { d.n = i; }); writes.push(f.flush()); }
    await Promise.all(writes);
    expect(JSON.parse(fs.readFileSync(path.join(dir, "y.json"), "utf8")).n).toBe(25);
  });
  it("is private to the owner (0600)", async () => {
    const f = new JsonFile<{ n: number }>(path.join(dir, "z.json"), () => ({ n: 1 }));
    await f.flush();
    if (process.platform !== "win32") expect(fs.statSync(path.join(dir, "z.json")).mode & 0o077).toBe(0);
  });
});

describe("ProfileStore", () => {
  it("creates a default Personal profile and persists", async () => {
    const s = new ProfileStore(dir);
    expect(s.list().map((p) => p.name)).toEqual(["Personal"]);
    s.create("Work");
    await s.flush();
    expect(new ProfileStore(dir).list().map((p) => p.name)).toEqual(["Personal", "Work"]);
  });
  it("validates names, rejects duplicates (case-insensitive), and keeps ids filesystem-safe", () => {
    const s = new ProfileStore(dir);
    expect(() => s.create("  ")).toThrow();
    expect(() => s.create("personal")).toThrow(/already exists/);
    const p = s.create("Étude / ../Travail");
    expect(p.id).toMatch(/^[a-z0-9-]+$/);
    expect(s.dirFor(p.id).startsWith(dir)).toBe(true);
    expect(() => s.dirFor("../evil")).toThrow();
  });
  it("renames, updates settings with validation, and can't delete the last profile", () => {
    const s = new ProfileStore(dir);
    const w = s.create("Work");
    expect(s.rename(w.id, "Office").name).toBe("Office");
    expect(() => s.rename(w.id, "Personal")).toThrow(/already exists/);
    expect(s.updateSettings(w.id, { searchEngine: "duckduckgo", theme: "dark", homepage: "example.org" })).toMatchObject({ searchEngine: "duckduckgo", theme: "dark", homepage: "https://example.org/" });
    expect(() => s.updateSettings(w.id, { homepage: "javascript:alert(1)" })).toThrow();
    expect(() => s.updateSettings(w.id, { searchEngine: "evil" as never })).toThrow();
    s.remove(w.id);
    expect(() => s.remove(s.list()[0]!.id)).toThrow(/only profile/);
  });
  it("profile settings are independent per profile", () => {
    const s = new ProfileStore(dir);
    const w = s.create("Work");
    s.updateSettings(w.id, { searchEngine: "bing" });
    expect(s.get("personal")!.settings.searchEngine).toBe("google");
  });
});

describe("BookmarkStore", () => {
  it("adds, edits, searches, folders and removes", () => {
    const s = new BookmarkStore(dir);
    const f = s.addFolder("Reading");
    const b = s.add({ title: "HN", url: "https://news.ycombinator.com", folderId: f.id });
    s.add({ title: "", url: "https://example.com/a" });
    expect(s.list({ search: "hn" }).map((x) => x.title)).toEqual(["HN"]);
    expect(s.list({ folderId: f.id })).toHaveLength(1);
    const u = s.update(b.id, { title: "Hacker News", url: "https://news.ycombinator.com/newest" });
    expect(u).toMatchObject({ title: "Hacker News", url: "https://news.ycombinator.com/newest", folderId: f.id });
    expect(() => s.update(b.id, { url: "news.ycombinator.com" })).toThrow(/http/);
    expect(() => s.update("missing", { title: "x" })).toThrow(/not found/);
    s.remove(b.id);
    expect(s.list({ folderId: f.id })).toHaveLength(0);
    expect(() => s.remove(b.id)).toThrow(/not found/);
  });
  it("rejects unsafe URLs and unknown folders", () => {
    const s = new BookmarkStore(dir);
    for (const url of ["javascript:1", "file:///etc/passwd", "data:text/html,x", "nexora://settings/"]) expect(() => s.add({ title: "x", url })).toThrow();
    expect(() => s.add({ title: "x", url: "https://a.com", folderId: "nope" })).toThrow(/Folder/);
  });
  it("deleting a folder keeps its bookmarks", () => {
    const s = new BookmarkStore(dir);
    const f = s.addFolder("F");
    const b = s.add({ title: "x", url: "https://a.com", folderId: f.id });
    s.removeFolder(f.id);
    expect(s.list().find((x) => x.id === b.id)?.folderId).toBeNull();
  });
  it("persists and drops corrupt/unsafe entries on load", async () => {
    const s = new BookmarkStore(dir);
    s.add({ title: "ok", url: "https://ok.example" });
    await s.flush();
    const file = path.join(dir, "bookmarks.json");
    const raw = JSON.parse(fs.readFileSync(file, "utf8"));
    raw.bookmarks.push({ id: "evil", title: "x", url: "javascript:alert(1)", folderId: null, createdAt: 1 });
    fs.writeFileSync(file, JSON.stringify(raw));
    expect(new BookmarkStore(dir).list().map((b) => b.title)).toEqual(["ok"]);
  });
});

describe("HistoryStore", () => {
  it("records only when enabled and only http(s)", () => {
    const h = new HistoryStore(dir);
    expect(h.record("https://a.com", "A", false)).toBeNull();
    expect(h.record("nexora://history/", "H", true)).toBeNull();
    expect(h.record("file:///etc/passwd", "x", true)).toBeNull();
    expect(h.record("https://a.com", "A", true)).not.toBeNull();
    expect(h.count()).toBe(1);
  });
  it("dedupes rapid repeats of the same URL", () => {
    let t = 1_000_000;
    const h = new HistoryStore(dir, () => t);
    h.record("https://a.com", "A", true); t += 500; h.record("https://a.com", "A2", true);
    expect(h.count()).toBe(1);
    t += 5_000; h.record("https://a.com", "A", true);
    expect(h.count()).toBe(2);
  });
  it("searches, removes one, and clears by period", () => {
    let t = 10 * 86_400_000;
    const h = new HistoryStore(dir, () => t);
    h.record("https://old.example", "Old", true);          // 10 days ago relative to "now" below
    t += 8 * 86_400_000; const mid = h.record("https://week.example", "Week", true)!;
    t += 6 * 86_400_000; h.record("https://day.example", "Day", true);
    t += 23 * 3_600_000; h.record("https://hour.example", "Hour", true);
    t += 30 * 60_000;
    expect(h.list({ search: "week" }).map((e) => e.title)).toEqual(["Week"]);
    h.remove(mid.id);
    expect(h.list().map((e) => e.title)).toEqual(["Hour", "Day", "Old"]);
    expect(h.clear("hour")).toBe(1);
    expect(h.list().map((e) => e.title)).toEqual(["Day", "Old"]);
    expect(h.clear("week")).toBe(1);
    expect(h.clear("all")).toBe(1);
    expect(h.count()).toBe(0);
  });
  it("persists across restarts", async () => {
    const h = new HistoryStore(dir);
    h.record("https://persist.example", "P", true);
    await h.flush();
    expect(new HistoryStore(dir).list().map((e) => e.title)).toEqual(["P"]);
  });
});

describe("isolation between profiles' on-disk data", () => {
  it("each profile dir has its own bookmarks and history", async () => {
    const ps = new ProfileStore(dir);
    const w = ps.create("Work");
    const a = new BookmarkStore(ps.dirFor("personal")); const b = new BookmarkStore(ps.dirFor(w.id));
    a.add({ title: "personal-only", url: "https://p.example" });
    await Promise.all([a.flush(), b.flush()]);
    expect(b.list()).toHaveLength(0);
    expect(new BookmarkStore(ps.dirFor("personal")).list()).toHaveLength(1);
    const ha = new HistoryStore(ps.dirFor("personal")); ha.record("https://p.example", "p", true);
    expect(new HistoryStore(ps.dirFor(w.id)).count()).toBe(0);
  });
});

describe("PrefsStore & SessionRestoreStore", () => {
  it("merges and validates global prefs", async () => {
    const p = new PrefsStore(dir);
    expect(p.value.recordHistory).toBe(true);
    p.update({ recordHistory: false, restoreTabs: true });
    await p.flush();
    expect(new PrefsStore(dir).value).toMatchObject({ recordHistory: false, restoreTabs: true });
  });
  it("saves tabs, filters unsafe URLs on load, and clears", async () => {
    const s = new SessionRestoreStore(dir);
    s.save([{ url: "https://a.com", pinned: true }, { url: "javascript:1", pinned: false }, { url: "nexora://newtab/", pinned: false }], 2);
    await s.flush();
    const loaded = new SessionRestoreStore(dir).load();
    expect(loaded.tabs.map((t) => t.url)).toEqual(["https://a.com", "nexora://newtab/"]);
    await s.clear();
    expect(new SessionRestoreStore(dir).load().tabs).toHaveLength(0);
  });
});
