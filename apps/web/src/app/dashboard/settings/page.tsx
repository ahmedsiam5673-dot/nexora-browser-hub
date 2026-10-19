import type { Metadata } from "next";
import Link from "next/link";
import { BROWSER_OPTIONS, SEARCH_ENGINES } from "@nexora/core";
import { ActionForm, SubmitButton } from "@/components/ActionForm";
import { ConfirmForm } from "@/components/ConfirmForm";
import { PrivacyChecks } from "@/components/OnboardingForm";
import { deleteAccountAction, logoutAction, savePreferencesAction, savePrivacyAction } from "@/app/actions";
import { requireOnboardedUser } from "@/lib/session";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const { user, prefs } = await requireOnboardedUser();
  return (
    <div className="fade-in max-w-3xl space-y-6">
      <h1 className="text-2xl font-bold sm:text-3xl">Settings</h1>

      <section className="card space-y-3" aria-labelledby="acct">
        <h2 id="acct" className="font-semibold">Account</h2>
        <div className="flex items-center gap-4">
          {user.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={user.avatarUrl} alt="" width={56} height={56} referrerPolicy="no-referrer" className="h-14 w-14 rounded-full" />
          ) : <span aria-hidden="true" className="grid h-14 w-14 place-items-center rounded-full bg-surface-2 text-xl font-semibold">{(user.displayName ?? user.email)[0]?.toUpperCase()}</span>}
          <dl className="min-w-0 text-sm">
            <dt className="sr-only">Name</dt><dd className="truncate font-medium">{user.displayName ?? "—"}</dd>
            <dt className="sr-only">Email</dt><dd className="truncate text-muted">{user.email}</dd>
            <dt className="sr-only">Sign-in method</dt><dd className="text-xs text-muted">Signed in with Google · Name and photo come from your Google account</dd>
          </dl>
        </div>
      </section>

      <section className="card" aria-labelledby="prefs">
        <h2 id="prefs" className="mb-3 font-semibold">Browsing preferences</h2>
        <ActionForm action={savePreferencesAction} className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="browserExperience">Default browser experience</label>
            <select id="browserExperience" name="browserExperience" className="input" defaultValue={prefs.browserExperience}>
              {BROWSER_OPTIONS.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="defaultSearchEngine">Default search engine</label>
            <select id="defaultSearchEngine" name="defaultSearchEngine" className="input" defaultValue={prefs.defaultSearchEngine}>
              {Object.values(SEARCH_ENGINES).map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="theme">Theme</label>
            <select id="theme" name="theme" className="input" defaultValue={prefs.theme}>
              <option value="system">Match my device</option><option value="light">Light</option><option value="dark">Dark</option>
            </select>
          </div>
          <div>
            <label className="label" htmlFor="homepageUrl">Homepage</label>
            <input id="homepageUrl" name="homepageUrl" className="input" defaultValue={prefs.homepageUrl} inputMode="url" />
          </div>
          <div className="sm:col-span-2"><SubmitButton>Save preferences</SubmitButton></div>
        </ActionForm>
      </section>

      <section className="card" aria-labelledby="priv">
        <h2 id="priv" className="mb-1 font-semibold">Privacy and downloads</h2>
        <p className="mb-3 text-sm text-muted">Saved to your account for the desktop browser. <b>The desktop app doesn&apos;t read account settings yet</b>; set them in the app too until sync is added.</p>
        <ActionForm action={savePrivacyAction}>
          <div className="space-y-3"><PrivacyChecks privacy={prefs.privacy} /></div>
          <SubmitButton>Save privacy settings</SubmitButton>
        </ActionForm>
      </section>

      <section className="card space-y-2" aria-labelledby="data">
        <h2 id="data" className="font-semibold">Your data</h2>
        <ul className="space-y-2 text-sm">
          <li><Link href="/dashboard/bookmarks" className="text-brand">Manage bookmarks</Link></li>
          <li>
            <span className="font-medium">Browsing history:</span>{" "}
            <span className="text-muted">Unavailable here. History is recorded only by the desktop app, on your device, and is not synced to your account.</span>
          </li>
          <li>
            <a href="/api/export" className="btn-ghost mt-1" download>Download my data (JSON)</a>
            <p className="hint">Includes your account details, preferences, profiles and bookmarks. Website cookies and passwords stay on your device and aren&apos;t included.</p>
          </li>
        </ul>
      </section>

      <section className="card space-y-3" aria-labelledby="danger">
        <h2 id="danger" className="font-semibold">Session and account</h2>
        <div className="flex flex-wrap gap-3">
          <form action={logoutAction}><button type="submit" className="btn-ghost">Log out</button></form>
          <ConfirmForm action={deleteAccountAction} triggerLabel="Delete my account" triggerClassName="btn-danger"
            title="Permanently delete your account?" requireText="DELETE" confirmLabel="Delete everything"
            description="This removes your account, preferences, profiles and bookmarks from our servers. It can't be undone. Data stored inside the desktop app on your devices is not affected.">
            <input type="hidden" name="confirm" value="DELETE" />
          </ConfirmForm>
        </div>
        <p className="text-xs text-muted"><Link href="/privacy" className="underline">Privacy policy</Link> · <Link href="/terms" className="underline">Terms</Link></p>
      </section>
    </div>
  );
}
