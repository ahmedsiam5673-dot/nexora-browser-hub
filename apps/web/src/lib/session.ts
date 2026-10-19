import "server-only";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getDb } from "@/db";
import { getPreferences, getUser } from "@/db/repo";

/**
 * Authoritative server-side check. Verifies the session AND that the user still exists,
 * so a deleted account's still-unexpired token grants nothing.
 */
export async function getCurrentUser() {
  const session = await auth();
  const id = session?.user?.id;
  if (!id) return null;
  return getUser(getDb(), id);
}

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireOnboardedUser() {
  const user = await requireUser();
  const prefs = await getPreferences(getDb(), user.id);
  if (!prefs.onboardingCompleted) redirect("/onboarding");
  return { user, prefs };
}
