import { and, asc, desc, eq, ilike, or } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import {
  isBrowserOptionId, isSafeNavigationUrl, isSearchEngineId, isTheme, normalizeHomepage,
  parsePrivacy, sanitizeProfileName, type PrivacyPreferences,
} from "@nexora/core";
import * as schema from "./schema";

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;
const { users, userPreferences, browserProfiles, bookmarks, bookmarkFolders, browsingHistory } = schema;

export type RepoErrorCode = "invalid" | "not_found" | "conflict" | "forbidden";
export class RepoError extends Error {
  constructor(public code: RepoErrorCode, message: string) {
    super(message);
    this.name = "RepoError";
  }
}

export const DEFAULT_HOMEPAGE = "https://www.google.com/";
const MAX_PROFILES = 20;
const MAX_TITLE = 300;

/* ---------- users ---------- */

export interface OAuthIdentity {
  provider: string;
  providerUserId: string;
  email: string;
  name?: string | null;
  image?: string | null;
}

/** Create the account on first sign-in, refresh profile fields on later sign-ins. Idempotent. */
export async function upsertUserFromOAuth(db: Db, who: OAuthIdentity) {
  if (!who.provider || !who.providerUserId || !who.email) throw new RepoError("invalid", "Incomplete identity");
  return db.transaction(async (tx) => {
    const [user] = await tx
      .insert(users)
      .values({
        authenticationProvider: who.provider,
        providerUserId: who.providerUserId,
        email: who.email,
        displayName: who.name ?? null,
        avatarUrl: who.image ?? null,
      })
      .onConflictDoUpdate({
        target: [users.authenticationProvider, users.providerUserId],
        set: { email: who.email, displayName: who.name ?? null, avatarUrl: who.image ?? null, updatedAt: new Date() },
      })
      .returning();
    if (!user) throw new Error("User upsert failed");
    await tx.insert(userPreferences).values({ userId: user.id }).onConflictDoNothing({ target: userPreferences.userId });
    const existing = await tx.select({ id: browserProfiles.id }).from(browserProfiles).where(eq(browserProfiles.userId, user.id)).limit(1);
    if (existing.length === 0) await tx.insert(browserProfiles).values({ userId: user.id, profileName: "Personal" });
    return user;
  });
}

export async function getUser(db: Db, userId: string) {
  const [u] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  return u ?? null;
}

/** Permanently deletes the user and (via ON DELETE CASCADE) every record linked to them. */
export async function deleteAccount(db: Db, userId: string): Promise<void> {
  await db.delete(users).where(eq(users.id, userId));
}

/* ---------- preferences ---------- */

export interface PreferencesInput {
  browserExperience?: string;
  theme?: string;
  defaultSearchEngine?: string;
  homepageUrl?: string;
  privacy?: Partial<PrivacyPreferences>;
  onboardingCompleted?: boolean;
}

export async function getPreferences(db: Db, userId: string) {
  const [p] = await db.select().from(userPreferences).where(eq(userPreferences.userId, userId)).limit(1);
  if (!p) throw new RepoError("not_found", "Preferences not found");
  return { ...p, privacy: parsePrivacy(p.privacyPreferences) };
}

export async function savePreferences(db: Db, userId: string, input: PreferencesInput) {
  const current = await getPreferences(db, userId);
  const set: Partial<typeof userPreferences.$inferInsert> = { updatedAt: new Date() };
  if (input.browserExperience !== undefined) {
    if (!isBrowserOptionId(input.browserExperience)) throw new RepoError("invalid", "Unknown browser option");
    set.browserExperience = input.browserExperience;
  }
  if (input.theme !== undefined) {
    if (!isTheme(input.theme)) throw new RepoError("invalid", "Invalid theme");
    set.theme = input.theme;
  }
  if (input.defaultSearchEngine !== undefined) {
    if (!isSearchEngineId(input.defaultSearchEngine)) throw new RepoError("invalid", "Unknown search engine");
    set.defaultSearchEngine = input.defaultSearchEngine;
  }
  if (input.homepageUrl !== undefined) {
    const n = normalizeHomepage(input.homepageUrl, "");
    if (!n) throw new RepoError("invalid", "Homepage must be a valid http(s) address");
    set.homepageUrl = n;
  }
  if (input.privacy) set.privacyPreferences = parsePrivacy({ ...current.privacy, ...input.privacy });
  if (input.onboardingCompleted !== undefined) set.onboardingCompleted = input.onboardingCompleted;
  await db.update(userPreferences).set(set).where(eq(userPreferences.userId, userId));
  return getPreferences(db, userId);
}

/* ---------- profiles ---------- */

export async function listProfiles(db: Db, userId: string) {
  return db.select().from(browserProfiles).where(eq(browserProfiles.userId, userId)).orderBy(asc(browserProfiles.createdAt));
}

export async function createProfile(db: Db, userId: string, name: string) {
  const clean = sanitizeProfileName(name);
  if (!clean) throw new RepoError("invalid", "Profile name must be 1–40 characters without < > or control characters");
  if ((await listProfiles(db, userId)).length >= MAX_PROFILES) throw new RepoError("invalid", `You can have at most ${MAX_PROFILES} profiles`);
  try {
    const [p] = await db.insert(browserProfiles).values({ userId, profileName: clean }).returning();
    return p!;
  } catch (e) {
    if (isUniqueViolation(e)) throw new RepoError("conflict", "A profile with that name already exists");
    throw e;
  }
}

export async function renameProfile(db: Db, userId: string, profileId: string, name: string) {
  const clean = sanitizeProfileName(name);
  if (!clean) throw new RepoError("invalid", "Invalid profile name");
  try {
    const rows = await db.update(browserProfiles).set({ profileName: clean, updatedAt: new Date() })
      .where(and(eq(browserProfiles.id, profileId), eq(browserProfiles.userId, userId))).returning();
    if (rows.length === 0) throw new RepoError("not_found", "Profile not found");
    return rows[0]!;
  } catch (e) {
    if (isUniqueViolation(e)) throw new RepoError("conflict", "A profile with that name already exists");
    throw e;
  }
}

export async function deleteProfile(db: Db, userId: string, profileId: string) {
  const all = await listProfiles(db, userId);
  if (!all.some((p) => p.id === profileId)) throw new RepoError("not_found", "Profile not found");
  if (all.length <= 1) throw new RepoError("invalid", "You can't delete your only profile");
  await db.delete(browserProfiles).where(and(eq(browserProfiles.id, profileId), eq(browserProfiles.userId, userId)));
}

async function assertProfileOwned(db: Db, userId: string, profileId: string | null | undefined) {
  if (!profileId) return;
  const [p] = await db.select({ id: browserProfiles.id }).from(browserProfiles)
    .where(and(eq(browserProfiles.id, profileId), eq(browserProfiles.userId, userId))).limit(1);
  if (!p) throw new RepoError("not_found", "Profile not found");
}

/* ---------- bookmarks ---------- */

export interface BookmarkInput { title: string; url: string; profileId?: string | null; folderId?: string | null }

function cleanTitle(t: string, url: string): string {
  const s = (t ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_TITLE);
  return s || new URL(url).hostname;
}

async function assertFolderOwned(db: Db, userId: string, folderId: string | null | undefined) {
  if (!folderId) return;
  const [f] = await db.select({ id: bookmarkFolders.id }).from(bookmarkFolders)
    .where(and(eq(bookmarkFolders.id, folderId), eq(bookmarkFolders.userId, userId))).limit(1);
  if (!f) throw new RepoError("not_found", "Folder not found");
}

export async function listBookmarks(db: Db, userId: string, opts: { search?: string; profileId?: string | null } = {}) {
  const conds = [eq(bookmarks.userId, userId)];
  if (opts.profileId) conds.push(eq(bookmarks.profileId, opts.profileId));
  const q = opts.search?.trim();
  if (q) {
    const like = `%${q.replace(/[%_\\]/g, "\\$&")}%`;
    conds.push(or(ilike(bookmarks.title, like), ilike(bookmarks.url, like))!);
  }
  return db.select().from(bookmarks).where(and(...conds)).orderBy(desc(bookmarks.createdAt));
}

export async function createBookmark(db: Db, userId: string, input: BookmarkInput) {
  if (!isSafeNavigationUrl(input.url)) throw new RepoError("invalid", "Bookmark URL must be a valid http(s) address");
  await assertProfileOwned(db, userId, input.profileId);
  await assertFolderOwned(db, userId, input.folderId);
  const url = new URL(input.url).toString();
  const [b] = await db.insert(bookmarks).values({
    userId, url, title: cleanTitle(input.title, url), profileId: input.profileId ?? null, folderId: input.folderId ?? null,
  }).returning();
  return b!;
}

export async function updateBookmark(db: Db, userId: string, bookmarkId: string, input: Partial<BookmarkInput>) {
  const set: Partial<typeof bookmarks.$inferInsert> = {};
  if (input.url !== undefined) {
    if (!isSafeNavigationUrl(input.url)) throw new RepoError("invalid", "Bookmark URL must be a valid http(s) address");
    set.url = new URL(input.url).toString();
  }
  if (input.title !== undefined) set.title = cleanTitle(input.title, set.url ?? "https://invalid.local");
  if (input.folderId !== undefined) { await assertFolderOwned(db, userId, input.folderId); set.folderId = input.folderId; }
  if (input.profileId !== undefined) { await assertProfileOwned(db, userId, input.profileId); set.profileId = input.profileId; }
  if (Object.keys(set).length === 0) throw new RepoError("invalid", "Nothing to update");
  const rows = await db.update(bookmarks).set(set).where(and(eq(bookmarks.id, bookmarkId), eq(bookmarks.userId, userId))).returning();
  if (rows.length === 0) throw new RepoError("not_found", "Bookmark not found");
  return rows[0]!;
}

export async function deleteBookmark(db: Db, userId: string, bookmarkId: string) {
  const rows = await db.delete(bookmarks).where(and(eq(bookmarks.id, bookmarkId), eq(bookmarks.userId, userId))).returning({ id: bookmarks.id });
  if (rows.length === 0) throw new RepoError("not_found", "Bookmark not found");
}

/* ---------- bookmark folders ---------- */

export async function listFolders(db: Db, userId: string) {
  return db.select().from(bookmarkFolders).where(eq(bookmarkFolders.userId, userId)).orderBy(asc(bookmarkFolders.name));
}

export async function createFolder(db: Db, userId: string, name: string, profileId?: string | null) {
  const clean = (name ?? "").replace(/\s+/g, " ").trim();
  if (!clean || clean.length > 80 || /[\u0000-\u001f<>]/.test(clean)) throw new RepoError("invalid", "Folder name must be 1–80 characters");
  await assertProfileOwned(db, userId, profileId);
  const [f] = await db.insert(bookmarkFolders).values({ userId, name: clean, profileId: profileId ?? null }).returning();
  return f!;
}

export async function deleteFolder(db: Db, userId: string, folderId: string) {
  const rows = await db.delete(bookmarkFolders).where(and(eq(bookmarkFolders.id, folderId), eq(bookmarkFolders.userId, userId))).returning({ id: bookmarkFolders.id });
  if (rows.length === 0) throw new RepoError("not_found", "Folder not found");
}

/* ---------- export ---------- */

export async function exportUserData(db: Db, userId: string) {
  const user = await getUser(db, userId);
  if (!user) throw new RepoError("not_found", "User not found");
  const [prefs, profiles, folders, marks, history] = await Promise.all([
    getPreferences(db, userId),
    listProfiles(db, userId),
    listFolders(db, userId),
    listBookmarks(db, userId),
    db.select().from(browsingHistory).where(eq(browsingHistory.userId, userId)),
  ]);
  return {
    exportedAt: new Date().toISOString(),
    account: { id: user.id, email: user.email, displayName: user.displayName, avatarUrl: user.avatarUrl, createdAt: user.createdAt },
    preferences: { ...prefs, privacyPreferences: undefined },
    profiles, bookmarkFolders: folders, bookmarks: marks, browsingHistory: history,
    note: "Cookies, passwords and website sessions live only inside the desktop app on your device and are not part of this export.",
  };
}

function isUniqueViolation(e: unknown): boolean {
  const err = e as { code?: string; cause?: { code?: string }; message?: string };
  return err?.code === "23505" || err?.cause?.code === "23505" || /duplicate key|unique constraint/i.test(err?.message ?? "");
}
