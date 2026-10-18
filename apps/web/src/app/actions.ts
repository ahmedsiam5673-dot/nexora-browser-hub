"use server";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { signIn, signOut } from "@/auth";
import { getDb } from "@/db";
import * as repo from "@/db/repo";
import { RepoError } from "@/db/repo";
import { requireUser } from "@/lib/session";
import type { ActionState } from "@/lib/action-state";

const str = (fd: FormData, k: string) => {
  const v = fd.get(k);
  return typeof v === "string" ? v : "";
};
const bool = (fd: FormData, k: string) => fd.get(k) === "on";

async function run(fn: () => Promise<string>): Promise<ActionState> {
  try {
    return { ok: true, message: await fn() };
  } catch (e) {
    unstable_rethrow(e); // let Next.js redirects / not-found pass through
    if (e instanceof RepoError) return { ok: false, message: e.message };
    if (e instanceof z.ZodError) return { ok: false, message: e.issues[0]?.message ?? "Invalid input" };
    console.error("[action error]", e);
    return { ok: false, message: "Something went wrong. Please try again." };
  }
}

async function setThemeCookie(theme: string) {
  (await cookies()).set("nexora-theme", theme, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax", secure: process.env.NODE_ENV === "production" });
}

/* ---------- auth ---------- */
export async function signInWithGoogle(formData: FormData) {
  const raw = str(formData, "callbackUrl");
  // Only same-site relative paths are allowed as post-login destinations (prevents open redirects).
  const to = /^\/(?!\/)[\w\-./?=&%]*$/.test(raw) ? raw : "/dashboard";
  await signIn("google", { redirectTo: to });
}

export async function logoutAction() {
  await signOut({ redirectTo: "/" });
}

/* ---------- preferences ---------- */
const prefsSchema = z.object({
  browserExperience: z.string().min(1, "Choose a browsing experience"),
  defaultSearchEngine: z.string().min(1),
  theme: z.string().min(1),
  homepageUrl: z.string().trim().min(1, "Enter a homepage address").max(2048),
});

export async function completeOnboardingAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const user = await requireUser();
    const v = prefsSchema.parse({
      browserExperience: str(fd, "browserExperience"), defaultSearchEngine: str(fd, "defaultSearchEngine"),
      theme: str(fd, "theme"), homepageUrl: str(fd, "homepageUrl"),
    });
    const saved = await repo.savePreferences(getDb(), user.id, {
      ...v,
      privacy: {
        recordHistory: bool(fd, "recordHistory"), restoreTabs: bool(fd, "restoreTabs"),
        askDownloadLocation: bool(fd, "askDownloadLocation"), sendGlobalPrivacyControl: bool(fd, "sendGlobalPrivacyControl"),
      },
      onboardingCompleted: true,
    });
    await setThemeCookie(saved.theme);
    revalidatePath("/", "layout");
    return "Saved";
  });
}

export async function savePreferencesAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const user = await requireUser();
    const v = prefsSchema.parse({
      browserExperience: str(fd, "browserExperience"), defaultSearchEngine: str(fd, "defaultSearchEngine"),
      theme: str(fd, "theme"), homepageUrl: str(fd, "homepageUrl"),
    });
    const saved = await repo.savePreferences(getDb(), user.id, v);
    await setThemeCookie(saved.theme);
    revalidatePath("/", "layout");
    return "Preferences saved.";
  });
}

export async function savePrivacyAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const user = await requireUser();
    await repo.savePreferences(getDb(), user.id, {
      privacy: {
        recordHistory: bool(fd, "recordHistory"), restoreTabs: bool(fd, "restoreTabs"),
        askDownloadLocation: bool(fd, "askDownloadLocation"), sendGlobalPrivacyControl: bool(fd, "sendGlobalPrivacyControl"),
      },
    });
    revalidatePath("/dashboard/settings");
    return "Privacy settings saved.";
  });
}

export async function selectBrowserAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const user = await requireUser();
    await repo.savePreferences(getDb(), user.id, { browserExperience: str(fd, "browserExperience") });
    revalidatePath("/dashboard/browsers");
    return "Saved as your preferred experience.";
  });
}

/* ---------- bookmarks ---------- */
export async function createBookmarkAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const user = await requireUser();
    await repo.createBookmark(getDb(), user.id, {
      title: str(fd, "title"), url: str(fd, "url"), folderId: str(fd, "folderId") || null, profileId: str(fd, "profileId") || null,
    });
    revalidatePath("/dashboard/bookmarks");
    revalidatePath("/dashboard");
    return "Bookmark added.";
  });
}

export async function updateBookmarkAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const user = await requireUser();
    await repo.updateBookmark(getDb(), user.id, str(fd, "id"), {
      title: str(fd, "title"), url: str(fd, "url"), folderId: str(fd, "folderId") || null,
    });
    revalidatePath("/dashboard/bookmarks");
    return "Bookmark updated.";
  });
}

export async function deleteBookmarkAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const user = await requireUser();
    await repo.deleteBookmark(getDb(), user.id, str(fd, "id"));
    revalidatePath("/dashboard/bookmarks");
    revalidatePath("/dashboard");
    return "Bookmark deleted.";
  });
}

export async function createFolderAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const user = await requireUser();
    await repo.createFolder(getDb(), user.id, str(fd, "name"));
    revalidatePath("/dashboard/bookmarks");
    return "Folder created.";
  });
}

export async function deleteFolderAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const user = await requireUser();
    await repo.deleteFolder(getDb(), user.id, str(fd, "id"));
    revalidatePath("/dashboard/bookmarks");
    return "Folder deleted. Its bookmarks were kept.";
  });
}

/* ---------- profiles ---------- */
export async function createProfileAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const user = await requireUser();
    await repo.createProfile(getDb(), user.id, str(fd, "name"));
    revalidatePath("/dashboard/profiles");
    return "Profile created.";
  });
}

export async function renameProfileAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const user = await requireUser();
    await repo.renameProfile(getDb(), user.id, str(fd, "id"), str(fd, "name"));
    revalidatePath("/dashboard/profiles");
    return "Profile renamed.";
  });
}

export async function deleteProfileAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const user = await requireUser();
    await repo.deleteProfile(getDb(), user.id, str(fd, "id"));
    revalidatePath("/dashboard/profiles");
    revalidatePath("/dashboard/bookmarks");
    return "Profile deleted.";
  });
}

/* ---------- account ---------- */
export async function deleteAccountAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const result = await run(async () => {
    const user = await requireUser();
    if (str(fd, "confirm") !== "DELETE") throw new RepoError("invalid", "Type DELETE to confirm");
    await repo.deleteAccount(getDb(), user.id);
    (await cookies()).delete("nexora-theme");
    return "Account deleted.";
  });
  if (result?.ok) await signOut({ redirectTo: "/?account=deleted" });
  return result;
}
