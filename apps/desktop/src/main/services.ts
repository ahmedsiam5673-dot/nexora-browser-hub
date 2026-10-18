import fs from "node:fs";
import path from "node:path";
import { persistentPartition } from "@nexora/core";
import { ProfileStore } from "./storage/profiles";
import { PrefsStore } from "./storage/prefs";
import { BookmarkStore } from "./storage/bookmarks";
import { HistoryStore } from "./storage/history";
import { SessionRestoreStore } from "./storage/session-restore";

/** Electron-free container for everything persisted to disk. Private windows never touch it. */
export class AppServices {
  readonly profiles: ProfileStore;
  readonly prefs: PrefsStore;
  private bookmarks = new Map<string, BookmarkStore>();
  private histories = new Map<string, HistoryStore>();
  private restores = new Map<string, SessionRestoreStore>();

  constructor(readonly root: string) {
    fs.mkdirSync(root, { recursive: true });
    this.profiles = new ProfileStore(root);
    this.prefs = new PrefsStore(root);
  }

  bookmarksFor(profileId: string): BookmarkStore {
    let s = this.bookmarks.get(profileId);
    if (!s) this.bookmarks.set(profileId, (s = new BookmarkStore(this.profiles.dirFor(profileId))));
    return s;
  }
  historyFor(profileId: string): HistoryStore {
    let s = this.histories.get(profileId);
    if (!s) this.histories.set(profileId, (s = new HistoryStore(this.profiles.dirFor(profileId))));
    return s;
  }
  restoreFor(profileId: string): SessionRestoreStore {
    let s = this.restores.get(profileId);
    if (!s) this.restores.set(profileId, (s = new SessionRestoreStore(this.profiles.dirFor(profileId))));
    return s;
  }

  async flushAll(): Promise<void> {
    await Promise.all([
      this.profiles.flush(), this.prefs.flush(),
      ...[...this.bookmarks.values()].map((s) => s.flush()),
      ...[...this.histories.values()].map((s) => s.flush()),
      ...[...this.restores.values()].map((s) => s.flush()),
    ]);
  }

  /** Deletes the profile's metadata and all of its on-disk files (bookmarks, history, tabs). */
  async deleteProfile(id: string): Promise<void> {
    const dir = this.profiles.dirFor(id);
    this.profiles.remove(id);
    this.bookmarks.delete(id); this.histories.delete(id); this.restores.delete(id);
    await fs.promises.rm(dir, { recursive: true, force: true });
    await this.profiles.flush();
  }

  /** Where Chromium keeps the cookie/localStorage/etc. for a persistent partition. */
  partitionDir(userData: string, profileId: string): string {
    return path.join(userData, "Partitions", persistentPartition(profileId).replace(/^persist:/, ""));
  }
}
