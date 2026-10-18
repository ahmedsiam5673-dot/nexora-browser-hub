import path from "node:path";
import crypto from "node:crypto";
import { isSafeNavigationUrl } from "@nexora/core";
import { JsonFile } from "./json-file";
import type { Bookmark, BookmarkFolder } from "../../shared/types";

interface BookmarkFile { folders: BookmarkFolder[]; bookmarks: Bookmark[] }
const MAX_TITLE = 300;
const uid = () => crypto.randomUUID();

function validate(raw: unknown): BookmarkFile {
  const o = (raw ?? {}) as Partial<BookmarkFile>;
  return {
    folders: Array.isArray(o.folders) ? o.folders.filter((f) => f && typeof f.id === "string" && typeof f.name === "string") : [],
    bookmarks: Array.isArray(o.bookmarks) ? o.bookmarks.filter((b) => b && typeof b.id === "string" && isSafeNavigationUrl(String(b.url))) : [],
  };
}

/** Per-profile bookmarks. Private windows never get one of these. */
export class BookmarkStore {
  private file: JsonFile<BookmarkFile>;
  constructor(profileDir: string) {
    this.file = new JsonFile<BookmarkFile>(path.join(profileDir, "bookmarks.json"), () => ({ folders: [], bookmarks: [] }), validate);
  }

  list(opts: { search?: string; folderId?: string | null } = {}): Bookmark[] {
    let items = [...this.file.value.bookmarks].sort((a, b) => b.createdAt - a.createdAt);
    if (opts.folderId !== undefined) items = items.filter((b) => b.folderId === opts.folderId);
    const q = opts.search?.trim().toLowerCase();
    if (q) items = items.filter((b) => b.title.toLowerCase().includes(q) || b.url.toLowerCase().includes(q));
    return items;
  }
  folders(): BookmarkFolder[] { return [...this.file.value.folders].sort((a, b) => a.name.localeCompare(b.name)); }
  findByUrl(url: string): Bookmark | undefined { return this.file.value.bookmarks.find((b) => b.url === url); }

  add(input: { title: string; url: string; folderId?: string | null }): Bookmark {
    if (!isSafeNavigationUrl(input.url)) throw new Error("Only http and https pages can be bookmarked.");
    const url = new URL(input.url).toString();
    if (input.folderId && !this.file.value.folders.some((f) => f.id === input.folderId)) throw new Error("Folder not found.");
    const title = (input.title ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_TITLE) || new URL(url).hostname;
    const b: Bookmark = { id: uid(), title, url, folderId: input.folderId ?? null, createdAt: Date.now() };
    this.file.update((d) => { d.bookmarks.push(b); });
    return b;
  }

  update(id: string, patch: { title?: string; url?: string; folderId?: string | null }): Bookmark {
    const b = this.file.value.bookmarks.find((x) => x.id === id);
    if (!b) throw new Error("Bookmark not found.");
    const next = { ...b };
    if (patch.url !== undefined) {
      if (!isSafeNavigationUrl(patch.url)) throw new Error("Only http and https pages can be bookmarked.");
      next.url = new URL(patch.url).toString();
    }
    if (patch.title !== undefined) next.title = patch.title.replace(/\s+/g, " ").trim().slice(0, MAX_TITLE) || new URL(next.url).hostname;
    if (patch.folderId !== undefined) {
      if (patch.folderId && !this.file.value.folders.some((f) => f.id === patch.folderId)) throw new Error("Folder not found.");
      next.folderId = patch.folderId;
    }
    this.file.update((d) => { Object.assign(b, next); });
    return b;
  }

  remove(id: string): void {
    if (!this.file.value.bookmarks.some((b) => b.id === id)) throw new Error("Bookmark not found.");
    this.file.update((d) => { d.bookmarks = d.bookmarks.filter((b) => b.id !== id); });
  }

  addFolder(name: string): BookmarkFolder {
    const clean = (name ?? "").replace(/\s+/g, " ").trim();
    if (!clean || clean.length > 80 || /[\u0000-\u001f<>]/.test(clean)) throw new Error("Folder name must be 1–80 characters.");
    const f: BookmarkFolder = { id: uid(), name: clean, createdAt: Date.now() };
    this.file.update((d) => { d.folders.push(f); });
    return f;
  }

  /** Deleting a folder keeps its bookmarks (they become unfiled). */
  removeFolder(id: string): void {
    if (!this.file.value.folders.some((f) => f.id === id)) throw new Error("Folder not found.");
    this.file.update((d) => { d.folders = d.folders.filter((f) => f.id !== id); for (const b of d.bookmarks) if (b.folderId === id) b.folderId = null; });
  }

  flush() { return this.file.flush(); }
  destroy() { return this.file.remove(); }
}
