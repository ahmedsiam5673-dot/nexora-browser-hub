import { EventEmitter } from "node:events";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { app, dialog, shell, type BrowserWindow, type DownloadItem, type Event as ElectronEvent, type WebContents } from "electron";
import type { DownloadRecord } from "../shared/types";
import { hostOf, isDangerousFile, safeFileName, uniqueFileName } from "./download-utils";
import type { PrefsStore } from "./storage/prefs";

export interface DownloadScope { private: boolean; id: string } // id = private session id or profile id
export interface DownloadOrigin { scope: DownloadScope; window: BrowserWindow | null }

const key = (s: DownloadScope) => `${s.private ? "private" : "profile"}:${s.id}`;

export class DownloadManager extends EventEmitter {
  private records = new Map<string, { rec: DownloadRecord; scope: DownloadScope; item?: DownloadItem }>();

  constructor(
    private readonly prefs: PrefsStore,
    private readonly resolveOrigin: (wc: WebContents | null) => DownloadOrigin | null,
    private readonly tempRoot = path.join(os.tmpdir(), "nexora-private-downloads"),
  ) { super(); }

  handleWillDownload(_e: ElectronEvent, item: DownloadItem, wc: WebContents | null): void {
    const origin = this.resolveOrigin(wc);
    if (!origin) { item.cancel(); return; }
    const { scope } = origin;
    const id = crypto.randomUUID();
    const filename = safeFileName(item.getFilename());

    if (scope.private) {
      const dir = path.join(this.tempRoot, scope.id);
      fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
      item.setSavePath(path.join(dir, uniqueFileName(dir, filename, fs.existsSync)));
    } else if (!this.prefs.value.askDownloadLocation) {
      const dir = app.getPath("downloads");
      item.setSavePath(path.join(dir, uniqueFileName(dir, filename, fs.existsSync)));
    } // else: let Electron show its Save dialog

    const rec: DownloadRecord = {
      id, filename, source: hostOf(item.getURL()), path: item.getSavePath(), state: "progressing",
      receivedBytes: 0, totalBytes: item.getTotalBytes(), startedAt: Date.now(), private: scope.private,
    };
    this.records.set(id, { rec, scope, item });
    this.changed(scope);

    item.on("updated", (_ev, state) => {
      rec.receivedBytes = item.getReceivedBytes();
      rec.totalBytes = item.getTotalBytes();
      rec.path = item.getSavePath() || rec.path;
      if (state === "interrupted") { rec.state = "interrupted"; rec.error = "The download was interrupted."; }
      this.changed(scope);
    });
    item.once("done", (_ev, state) => {
      rec.path = item.getSavePath() || rec.path;
      rec.filename = rec.path ? path.basename(rec.path) : rec.filename;
      rec.receivedBytes = item.getReceivedBytes();
      rec.state = state === "completed" ? "completed" : state === "cancelled" ? "cancelled" : "interrupted";
      if (state === "interrupted") rec.error = "The download failed. Check your connection and try again.";
      const entry = this.records.get(id); if (entry) entry.item = undefined;
      this.changed(scope);
    });
  }

  list(scope: DownloadScope): DownloadRecord[] {
    return [...this.records.values()].filter((e) => key(e.scope) === key(scope)).map((e) => ({ ...e.rec })).sort((a, b) => b.startedAt - a.startedAt);
  }

  private find(scope: DownloadScope, id: string) {
    const e = this.records.get(id);
    return e && key(e.scope) === key(scope) ? e : null; // a window can only act on its own downloads
  }

  cancel(scope: DownloadScope, id: string) { this.find(scope, id)?.item?.cancel(); }

  /** Removes the list entry. The file on disk is left alone (except private temp files, deleted here). */
  remove(scope: DownloadScope, id: string) {
    const e = this.find(scope, id);
    if (!e) return;
    e.item?.cancel();
    if (e.rec.private && !e.rec.kept && e.rec.path) fs.rmSync(e.rec.path, { force: true });
    this.records.delete(id);
    this.changed(scope);
  }

  async open(scope: DownloadScope, id: string, parent: BrowserWindow | null): Promise<{ ok: boolean; error?: string }> {
    const e = this.find(scope, id);
    if (!e || e.rec.state !== "completed") return { ok: false, error: "That file isn't available." };
    if (!fs.existsSync(e.rec.path)) return { ok: false, error: "The file was moved or deleted." };
    if (isDangerousFile(e.rec.filename)) {
      const opts = { type: "warning" as const, buttons: ["Cancel", "Open anyway"], defaultId: 0, cancelId: 0, title: "Open this file?",
        message: `“${e.rec.filename}” can run code on your computer.`, detail: `It came from ${e.rec.source || "an unknown site"}. Only open it if you trust that site.` };
      const r = parent ? await dialog.showMessageBox(parent, opts) : await dialog.showMessageBox(opts);
      if (r.response !== 1) return { ok: false, error: "Cancelled." };
    }
    const err = await shell.openPath(e.rec.path);
    return err ? { ok: false, error: err } : { ok: true };
  }

  show(scope: DownloadScope, id: string): boolean {
    const e = this.find(scope, id);
    if (!e?.rec.path || !fs.existsSync(e.rec.path)) return false;
    shell.showItemInFolder(e.rec.path);
    return true;
  }

  /** Private download -> user chooses a permanent location (explicit consent to keep it). */
  async keep(scope: DownloadScope, id: string, parent: BrowserWindow | null): Promise<{ ok: boolean; error?: string }> {
    const e = this.find(scope, id);
    if (!e || !e.rec.private || e.rec.state !== "completed") return { ok: false, error: "Nothing to keep." };
    const opts = { title: "Keep this private download", defaultPath: path.join(app.getPath("downloads"), e.rec.filename) };
    const r = parent ? await dialog.showSaveDialog(parent, opts) : await dialog.showSaveDialog(opts);
    if (r.canceled || !r.filePath) return { ok: false, error: "Cancelled." };
    try {
      await fs.promises.copyFile(e.rec.path, r.filePath);
      e.rec.kept = true;
      this.changed(scope);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  }

  activeCount(scope: DownloadScope): number {
    return [...this.records.values()].filter((e) => key(e.scope) === key(scope) && e.rec.state === "progressing").length;
  }

  /** Called when a private session ends: unfinished downloads are cancelled and every temp file is deleted. */
  discardPrivate(sessionId: string) {
    for (const [id, e] of this.records) {
      if (e.scope.private && e.scope.id === sessionId) { e.item?.cancel(); this.records.delete(id); }
    }
    fs.rmSync(path.join(this.tempRoot, sessionId), { recursive: true, force: true });
  }

  /** On quit: nothing from any private session may remain on disk. */
  discardAllPrivate() {
    for (const e of this.records.values()) if (e.scope.private) e.item?.cancel();
    fs.rmSync(this.tempRoot, { recursive: true, force: true });
  }

  private changed(scope: DownloadScope) { this.emit("changed", scope); }
}
