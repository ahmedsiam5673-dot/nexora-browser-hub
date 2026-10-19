import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import * as schema from "../src/db/schema";
import * as repo from "../src/db/repo";
import type { Db } from "../src/db/repo";

let db: Db;
let alice: string;
let bob: string;

beforeAll(async () => {
  const client = new PGlite();
  const d = drizzle(client, { schema });
  await migrate(d, { migrationsFolder: path.resolve(__dirname, "../drizzle") });
  db = d as unknown as Db;
  alice = (await repo.upsertUserFromOAuth(db, { provider: "google", providerUserId: "g-alice", email: "alice@example.com", name: "Alice" })).id;
  bob = (await repo.upsertUserFromOAuth(db, { provider: "google", providerUserId: "g-bob", email: "bob@example.com", name: "Bob" })).id;
});

const rejects = async (p: Promise<unknown>, code: repo.RepoErrorCode) => {
  await expect(p).rejects.toMatchObject({ name: "RepoError", code });
};

describe("account creation", () => {
  it("creates preferences and a default Personal profile on first login", async () => {
    const prefs = await repo.getPreferences(db, alice);
    expect(prefs.onboardingCompleted).toBe(false);
    expect(prefs.defaultSearchEngine).toBe("google");
    expect((await repo.listProfiles(db, alice)).map((p) => p.profileName)).toEqual(["Personal"]);
  });
  it("is idempotent and refreshes profile fields without duplicating rows", async () => {
    const again = await repo.upsertUserFromOAuth(db, { provider: "google", providerUserId: "g-alice", email: "alice@example.com", name: "Alice B." });
    expect(again.id).toBe(alice);
    expect(again.displayName).toBe("Alice B.");
    expect(await repo.listProfiles(db, alice)).toHaveLength(1);
  });
  it("rejects incomplete identities", async () => {
    await rejects(repo.upsertUserFromOAuth(db, { provider: "google", providerUserId: "", email: "x@y.z" }), "invalid");
  });
});

describe("preferences", () => {
  it("persists validated values", async () => {
    const p = await repo.savePreferences(db, alice, {
      theme: "dark", defaultSearchEngine: "duckduckgo", homepageUrl: "example.org", browserExperience: "nexora-desktop",
      privacy: { recordHistory: false }, onboardingCompleted: true,
    });
    expect(p).toMatchObject({ theme: "dark", defaultSearchEngine: "duckduckgo", homepageUrl: "https://example.org/", onboardingCompleted: true });
    expect(p.privacy.recordHistory).toBe(false);
    expect((await repo.getPreferences(db, alice)).theme).toBe("dark");
  });
  it("merges partial privacy updates", async () => {
    const p = await repo.savePreferences(db, alice, { privacy: { restoreTabs: true } });
    expect(p.privacy).toMatchObject({ recordHistory: false, restoreTabs: true });
  });
  it("rejects bad input and leaves data unchanged", async () => {
    await rejects(repo.savePreferences(db, alice, { theme: "neon" }), "invalid");
    await rejects(repo.savePreferences(db, alice, { defaultSearchEngine: "evil" }), "invalid");
    await rejects(repo.savePreferences(db, alice, { homepageUrl: "javascript:alert(1)" }), "invalid");
    await rejects(repo.savePreferences(db, alice, { browserExperience: "netscape" }), "invalid");
    expect((await repo.getPreferences(db, alice)).theme).toBe("dark");
  });
  it("is per-user", async () => {
    expect((await repo.getPreferences(db, bob)).theme).toBe("system");
  });
});

describe("profiles", () => {
  it("creates, renames, and prevents duplicates and invalid names", async () => {
    const work = await repo.createProfile(db, alice, "Work");
    await rejects(repo.createProfile(db, alice, "Work"), "conflict");
    await rejects(repo.createProfile(db, alice, "  "), "invalid");
    await rejects(repo.createProfile(db, alice, "<script>"), "invalid");
    const r = await repo.renameProfile(db, alice, work.id, "Office");
    expect(r.profileName).toBe("Office");
    await rejects(repo.renameProfile(db, alice, work.id, "Personal"), "conflict");
  });
  it("two users may use the same profile name", async () => {
    await repo.createProfile(db, bob, "Work");
    expect((await repo.listProfiles(db, bob)).map((p) => p.profileName).sort()).toEqual(["Personal", "Work"]);
  });
  it("cannot touch another user's profile", async () => {
    const bobProfile = (await repo.listProfiles(db, bob))[0]!;
    await rejects(repo.renameProfile(db, alice, bobProfile.id, "Pwned"), "not_found");
    await rejects(repo.deleteProfile(db, alice, bobProfile.id), "not_found");
    expect((await repo.listProfiles(db, bob)).some((p) => p.id === bobProfile.id)).toBe(true);
  });
  it("won't delete the last remaining profile", async () => {
    const carol = (await repo.upsertUserFromOAuth(db, { provider: "google", providerUserId: "g-carol", email: "c@example.com" })).id;
    const only = (await repo.listProfiles(db, carol))[0]!;
    await rejects(repo.deleteProfile(db, carol, only.id), "invalid");
  });
});

describe("bookmarks", () => {
  it("creates with normalised URL, default title, and searches", async () => {
    const b = await repo.createBookmark(db, alice, { title: "", url: "https://example.com/a b" });
    expect(b.url).toBe("https://example.com/a%20b");
    expect(b.title).toBe("example.com");
    await repo.createBookmark(db, alice, { title: "Hacker News", url: "https://news.ycombinator.com" });
    expect((await repo.listBookmarks(db, alice, { search: "hacker" })).map((x) => x.title)).toEqual(["Hacker News"]);
    expect(await repo.listBookmarks(db, alice, { search: "100%" })).toHaveLength(0); // wildcard escaped
  });
  it("rejects unsafe URLs", async () => {
    for (const url of ["javascript:alert(1)", "file:///etc/passwd", "data:text/html,x", "nonsense"]) {
      await rejects(repo.createBookmark(db, alice, { title: "x", url }), "invalid");
    }
  });
  it("edits and deletes", async () => {
    const b = await repo.createBookmark(db, alice, { title: "Old", url: "https://old.example" });
    const u = await repo.updateBookmark(db, alice, b.id, { title: "New", url: "https://new.example" });
    expect(u).toMatchObject({ title: "New", url: "https://new.example/" });
    await rejects(repo.updateBookmark(db, alice, b.id, { url: "javascript:1" }), "invalid");
    await repo.deleteBookmark(db, alice, b.id);
    await rejects(repo.deleteBookmark(db, alice, b.id), "not_found");
  });
  it("isolates users: no read, edit, delete across accounts", async () => {
    const b = await repo.createBookmark(db, bob, { title: "Bob secret", url: "https://bob.example" });
    expect((await repo.listBookmarks(db, alice)).some((x) => x.id === b.id)).toBe(false);
    await rejects(repo.updateBookmark(db, alice, b.id, { title: "hijack" }), "not_found");
    await rejects(repo.deleteBookmark(db, alice, b.id), "not_found");
  });
  it("refuses to attach another user's profile or folder", async () => {
    const bobProfile = (await repo.listProfiles(db, bob))[0]!;
    const bobFolder = await repo.createFolder(db, bob, "Private");
    await rejects(repo.createBookmark(db, alice, { title: "x", url: "https://a.example", profileId: bobProfile.id }), "not_found");
    await rejects(repo.createBookmark(db, alice, { title: "x", url: "https://a.example", folderId: bobFolder.id }), "not_found");
    await rejects(repo.createFolder(db, alice, "x", bobProfile.id), "not_found");
  });
  it("filters by profile and unfiles bookmarks when a folder is deleted", async () => {
    const [personal, office] = await repo.listProfiles(db, alice);
    const folder = await repo.createFolder(db, alice, "Reading", personal!.id);
    const b = await repo.createBookmark(db, alice, { title: "In folder", url: "https://f.example", profileId: personal!.id, folderId: folder.id });
    await repo.createBookmark(db, alice, { title: "Other profile", url: "https://o.example", profileId: office!.id });
    expect((await repo.listBookmarks(db, alice, { profileId: personal!.id })).map((x) => x.title)).toEqual(["In folder"]);
    await repo.deleteFolder(db, alice, folder.id);
    const after = (await repo.listBookmarks(db, alice, { search: "In folder" }))[0]!;
    expect(after.id).toBe(b.id);
    expect(after.folderId).toBeNull();
  });
});

describe("export and account deletion", () => {
  it("exports only the caller's data and states what is excluded", async () => {
    const data = await repo.exportUserData(db, alice);
    expect(data.account.email).toBe("alice@example.com");
    expect(data.bookmarks.every((b) => b.userId === alice)).toBe(true);
    expect(JSON.stringify(data)).not.toContain("Bob secret");
    expect(data.note).toMatch(/Cookies, passwords/);
  });
  it("deleting an account cascades to every linked record and spares others", async () => {
    const dave = (await repo.upsertUserFromOAuth(db, { provider: "google", providerUserId: "g-dave", email: "d@example.com" })).id;
    const p = (await repo.listProfiles(db, dave))[0]!;
    await repo.createBookmark(db, dave, { title: "d", url: "https://d.example", profileId: p.id });
    await repo.createFolder(db, dave, "F");
    await repo.deleteAccount(db, dave);
    expect(await repo.getUser(db, dave)).toBeNull();
    expect(await db.select().from(schema.bookmarks).where(eqUser(dave))).toHaveLength(0);
    expect(await db.select().from(schema.browserProfiles).where(eqProfileUser(dave))).toHaveLength(0);
    expect(await repo.getUser(db, bob)).not.toBeNull();
    expect((await repo.listBookmarks(db, bob)).length).toBeGreaterThan(0);
  });
});

import { eq } from "drizzle-orm";
const eqUser = (id: string) => eq(schema.bookmarks.userId, id);
const eqProfileUser = (id: string) => eq(schema.browserProfiles.userId, id);
