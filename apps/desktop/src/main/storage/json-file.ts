import fs from "node:fs";
import path from "node:path";

/**
 * A small JSON document persisted atomically (write temp file, then rename) with writes
 * serialized so concurrent saves can never interleave or leave a half-written file.
 */
export class JsonFile<T> {
  private data: T;
  private writing: Promise<void> = Promise.resolve();
  private timer: NodeJS.Timeout | null = null;

  constructor(readonly file: string, private readonly defaults: () => T, private readonly validate?: (raw: unknown) => T) {
    this.data = this.load();
  }

  private load(): T {
    try {
      const raw = JSON.parse(fs.readFileSync(this.file, "utf8")) as unknown;
      return this.validate ? this.validate(raw) : (raw as T);
    } catch {
      return this.defaults();
    }
  }

  get value(): T {
    return this.data;
  }

  /** Mutate in place (or return a replacement) and schedule a save. */
  update(fn: (draft: T) => T | void): void {
    const next = fn(this.data);
    if (next !== undefined) this.data = next;
    this.schedule();
  }

  private schedule() {
    if (this.timer) return;
    this.timer = setTimeout(() => { this.timer = null; void this.flush(); }, 150);
    this.timer.unref?.();
  }

  /** Write now. Resolves when the file is durably replaced. */
  flush(): Promise<void> {
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    const snapshot = JSON.stringify(this.data);
    this.writing = this.writing.then(async () => {
      await fs.promises.mkdir(path.dirname(this.file), { recursive: true });
      const tmp = `${this.file}.${process.pid}.tmp`;
      await fs.promises.writeFile(tmp, snapshot, { mode: 0o600 });
      await fs.promises.rename(tmp, this.file);
    });
    return this.writing;
  }

  async remove(): Promise<void> {
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    await this.writing.catch(() => undefined);
    await fs.promises.rm(this.file, { force: true });
    this.data = this.defaults();
  }
}
