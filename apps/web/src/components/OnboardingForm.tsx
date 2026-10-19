"use client";
import { useRouter } from "next/navigation";
import { BROWSER_OPTIONS, SEARCH_ENGINES, type PrivacyPreferences } from "@nexora/core";
import { completeOnboardingAction } from "@/app/actions";
import { Message, PendingContext, SubmitButton, useActionSubmit } from "./ActionForm";

export function OnboardingForm({ defaults }: { defaults: { homepageUrl: string; theme: string; defaultSearchEngine: string; privacy: PrivacyPreferences } }) {
  const router = useRouter();
  const { state, pending, onSubmit } = useActionSubmit(completeOnboardingAction, { onSuccess: () => router.replace("/dashboard") });
  return (
    <form onSubmit={onSubmit} className="mt-8 space-y-6">
      <PendingContext.Provider value={pending}>
        <fieldset className="card">
          <legend className="px-1 text-sm font-semibold">1. Preferred browsing experience</legend>
          <div className="mt-3 space-y-2">
            {BROWSER_OPTIONS.map((b) => (
              <label key={b.id} className="flex cursor-pointer items-start gap-3 rounded-xl border border-line p-3 has-[:checked]:border-brand">
                <input type="radio" name="browserExperience" value={b.id} defaultChecked={b.id === "nexora-web"} className="mt-1" />
                <span>
                  <span className="block text-sm font-medium">{b.name} <span className="badge ml-1">{b.mode === "embedded" ? "Embedded engine" : b.mode === "web" ? "Web mode" : "External browser"}</span></span>
                  <span className="block text-xs text-muted">{b.description}</span>
                </span>
              </label>
            ))}
          </div>
          <p className="hint">This is a preference only. A website can&apos;t switch or launch browsers; see &ldquo;Choose Your Browser&rdquo; for what each option really does.</p>
        </fieldset>

        <fieldset className="card grid gap-4 sm:grid-cols-2">
          <legend className="px-1 text-sm font-semibold">2. Search, theme and homepage</legend>
          <div>
            <label className="label" htmlFor="defaultSearchEngine">Default search engine</label>
            <select id="defaultSearchEngine" name="defaultSearchEngine" className="input" defaultValue={defaults.defaultSearchEngine}>
              {Object.values(SEARCH_ENGINES).map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="theme">Appearance</label>
            <select id="theme" name="theme" className="input" defaultValue={defaults.theme}>
              <option value="system">Match my device</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="label" htmlFor="homepageUrl">Homepage</label>
            <input id="homepageUrl" name="homepageUrl" className="input" defaultValue={defaults.homepageUrl} inputMode="url" autoComplete="off" />
          </div>
        </fieldset>

        <fieldset className="card">
          <legend className="px-1 text-sm font-semibold">3. Privacy (optional)</legend>
          <div className="mt-2 space-y-3">
            <PrivacyChecks privacy={defaults.privacy} />
          </div>
          <p className="hint">These apply to the desktop browser. They are saved to your account now; the desktop app doesn&apos;t read them yet.</p>
        </fieldset>

        <Message state={state} />
        <SubmitButton pendingLabel="Saving…">Save and continue</SubmitButton>
      </PendingContext.Provider>
    </form>
  );
}

export function PrivacyChecks({ privacy }: { privacy: PrivacyPreferences }) {
  const rows: { name: keyof PrivacyPreferences; label: string; hint: string }[] = [
    { name: "recordHistory", label: "Record browsing history", hint: "Normal windows only. Private sessions are never recorded." },
    { name: "restoreTabs", label: "Restore tabs after restart", hint: "Normal profiles only; never for private sessions." },
    { name: "askDownloadLocation", label: "Ask where to save each download", hint: "Otherwise files go to your Downloads folder." },
    { name: "sendGlobalPrivacyControl", label: "Send Global Privacy Control signal", hint: "Asks sites not to sell or share your data. Sites may ignore it." },
  ];
  return (
    <>
      {rows.map((r) => (
        <label key={r.name} className="flex items-start gap-3">
          <input type="checkbox" name={r.name} defaultChecked={privacy[r.name]} className="mt-1" />
          <span><span className="block text-sm font-medium">{r.label}</span><span className="block text-xs text-muted">{r.hint}</span></span>
        </label>
      ))}
    </>
  );
}
