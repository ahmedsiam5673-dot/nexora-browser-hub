import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { Logo } from "@/components/Logo";
import { OnboardingForm } from "@/components/OnboardingForm";
import { getDb } from "@/db";
import { getPreferences } from "@/db/repo";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "Welcome" };

export default async function OnboardingPage() {
  const user = await requireUser();
  const prefs = await getPreferences(getDb(), user.id);
  if (prefs.onboardingCompleted) redirect("/dashboard");
  const first = user.displayName?.split(" ")[0];
  return (
    <main id="main" className="mx-auto max-w-2xl px-4 py-10">
      <Logo />
      <h1 className="mt-8 text-3xl font-bold">{`Welcome${first ? `, ${first}` : ""}`}</h1>
      <p className="mt-2 text-muted">A few quick choices. You can change every one of them later in Settings.</p>
      <OnboardingForm defaults={{ homepageUrl: prefs.homepageUrl, theme: prefs.theme, defaultSearchEngine: prefs.defaultSearchEngine, privacy: prefs.privacy }} />
    </main>
  );
}
