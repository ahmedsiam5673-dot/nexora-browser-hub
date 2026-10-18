import path from "node:path";
import crypto from "node:crypto";
import { DEFAULT_SEARCH_ENGINE, isSearchEngineId, isValidProfileId, normalizeHomepage, sanitizeProfileName, slugifyProfileName } from "@nexora/core";
import { JsonFile } from "./json-file";
import type { ProfileMeta, ProfileSettings } from "../../shared/types";

export const DEFAULT_HOMEPAGE = "nexora://newtab/";

interface AppFile { version: 1; profiles: ProfileMeta[]; lastProfileId: string | null }

const defaultSettings = (): ProfileSettings => ({ homepage: DEFAULT_HOMEPAGE, searchEngine: DEFAULT_SEARCH_ENGINE, theme: "system" });

function validate(raw: unknown): AppFile {
  const o = (raw ?? {}) as Partial<AppFile>;
  const profiles = Array.isArray(o.profiles) ? o.profiles.filter((p) => p && isValidProfileId(String(p.id)) && typeof p.name === "string") : [];
  return {
    version: 1,
    profiles: profiles.map((p) => ({
      id: p.id, name: p.name, createdAt: Number(p.createdAt) || Date.now(),
      settings: { ...defaultSettings(), ...(p.settings ?? {}) },
    })),
    lastProfileId: typeof o.lastProfileId === "string" ? o.lastProfileId : null,
  };
}

export class ProfileStore {
  private file: JsonFile<AppFile>;
  constructor(private readonly root: string) {
    this.file = new JsonFile<AppFile>(path.join(root, "app.json"), () => ({ version: 1, profiles: [], lastProfileId: null }), validate);
    if (this.file.value.profiles.length === 0) this.create("Personal");
  }

  list(): ProfileMeta[] { return this.file.value.profiles; }
  get(id: string): ProfileMeta | undefined { return this.file.value.profiles.find((p) => p.id === id); }
  dirFor(id: string): string {
    if (!isValidProfileId(id)) throw new Error("invalid profile id");
    return path.join(this.root, "profiles", id);
  }
  get lastProfileId(): string { const id = this.file.value.lastProfileId; return id && this.get(id) ? id : this.list()[0]!.id; }
  setLast(id: string) { if (this.get(id)) this.file.update((d) => { d.lastProfileId = id; }); }

  create(name: string): ProfileMeta {
    const clean = sanitizeProfileName(name);
    if (!clean) throw new Error("Profile name must be 1–40 characters.");
    if (this.list().some((p) => p.name.toLowerCase() === clean.toLowerCase())) throw new Error("A profile with that name already exists.");
    let id = slugifyProfileName(clean);
    while (this.get(id)) id = `${slugifyProfileName(clean).slice(0, 30)}-${crypto.randomBytes(3).toString("hex")}`;
    const meta: ProfileMeta = { id, name: clean, createdAt: Date.now(), settings: defaultSettings() };
    this.file.update((d) => { d.profiles.push(meta); if (!d.lastProfileId) d.lastProfileId = id; });
    return meta;
  }

  rename(id: string, name: string): ProfileMeta {
    const clean = sanitizeProfileName(name);
    if (!clean) throw new Error("Profile name must be 1–40 characters.");
    const p = this.get(id);
    if (!p) throw new Error("Profile not found.");
    if (this.list().some((x) => x.id !== id && x.name.toLowerCase() === clean.toLowerCase())) throw new Error("A profile with that name already exists.");
    this.file.update(() => { p.name = clean; });
    return p;
  }

  updateSettings(id: string, patch: Partial<ProfileSettings>): ProfileSettings {
    const p = this.get(id);
    if (!p) throw new Error("Profile not found.");
    const next: ProfileSettings = { ...p.settings };
    if (patch.homepage !== undefined) {
      const hp = patch.homepage.trim() === DEFAULT_HOMEPAGE ? DEFAULT_HOMEPAGE : normalizeHomepage(patch.homepage, "");
      if (!hp) throw new Error("Homepage must be a valid http(s) address.");
      next.homepage = hp;
    }
    if (patch.searchEngine !== undefined) {
      if (!isSearchEngineId(patch.searchEngine)) throw new Error("Unknown search engine.");
      next.searchEngine = patch.searchEngine;
    }
    if (patch.theme !== undefined) {
      if (!["system", "light", "dark"].includes(patch.theme)) throw new Error("Invalid theme.");
      next.theme = patch.theme;
    }
    this.file.update(() => { p.settings = next; });
    return next;
  }

  /** Removes metadata only. The caller wipes browser storage and on-disk data for the profile. */
  remove(id: string): void {
    if (this.list().length <= 1) throw new Error("You can't delete your only profile.");
    if (!this.get(id)) throw new Error("Profile not found.");
    this.file.update((d) => { d.profiles = d.profiles.filter((p) => p.id !== id); if (d.lastProfileId === id) d.lastProfileId = d.profiles[0]!.id; });
  }

  flush() { return this.file.flush(); }
}
