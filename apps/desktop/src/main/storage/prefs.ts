import path from "node:path";
import { DEFAULT_PRIVACY, parsePrivacy, type PrivacyPreferences } from "@nexora/core";
import { JsonFile } from "./json-file";

export class PrefsStore {
  private file: JsonFile<PrivacyPreferences>;
  constructor(root: string) {
    this.file = new JsonFile<PrivacyPreferences>(path.join(root, "prefs.json"), () => ({ ...DEFAULT_PRIVACY }), parsePrivacy);
  }
  get value(): PrivacyPreferences { return this.file.value; }
  update(patch: Partial<PrivacyPreferences>): PrivacyPreferences {
    const next = parsePrivacy({ ...this.file.value, ...patch });
    this.file.update(() => next);
    return next;
  }
  flush() { return this.file.flush(); }
}
