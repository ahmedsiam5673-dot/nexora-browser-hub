import Link from "next/link";
import type { Metadata } from "next";
import { QUICK_LINKS, isSearchEngineId, DEFAULT_SEARCH_ENGINE } from "@nexora/core";
import { Omnibox } from "@/components/Omnibox";
import { getDb } from "@/db";
import { listBookmarks } from "@/db/repo";
import { requireOnboardedUser } from "@/lib/session";

export const metadata: Metadata = { title: "Home" };

export default async function DashboardHome() {
  const { user, prefs } = await requireOnboardedUser();
  const engine = isSearchEngineId(prefs.defaultSearchEngine) ? prefs.defaultSearchEngine : DEFAULT_SEARCH_ENGINE;
  const recent = (await listBookmarks(getDb(), user.id)).slice(0, 6);
  const first = user.displayName?.split(" ")[0];

  return (
    <div className="fade-in space-y-8">
      <header>
        <h1 className="text-2xl font-bold sm:text-3xl">{first ? `Hi, ${first}` : "Welcome back"}</h1>
        <p className="mt-1 text-sm text-muted">Search or go to a site. Web mode opens pages in a new tab of this browser.</p>
      </header>

      <Omnibox engine={engine} homepage={prefs.homepageUrl} />

      <section aria-labelledby="quick">
        <h2 id="quick" className="mb-3 text-sm font-semibold">Quick access</h2>
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {QUICK_LINKS.map((l) => (
            <li key={l.url}>
              <a href={l.url} target="_blank" rel="noopener noreferrer" className="card flex min-h-16 items-center justify-between gap-2 py-3 hover:border-brand">
                <span className="text-sm font-medium">{l.name}</span><span aria-hidden="true" className="text-muted">↗</span>
                <span className="sr-only">(opens in a new tab)</span>
              </a>
            </li>
          ))}
        </ul>
        <p className="hint">You sign in to Gmail and other Google services on Google&apos;s own site. Signing in here doesn&apos;t sign you in there.</p>
      </section>

      <section aria-labelledby="marks">
        <div className="mb-3 flex items-center justify-between">
          <h2 id="marks" className="text-sm font-semibold">Recent bookmarks</h2>
          <Link href="/dashboard/bookmarks" className="text-sm text-brand">Manage</Link>
        </div>
        {recent.length === 0 ? (
          <div className="card text-center">
            <p className="text-sm font-medium">No bookmarks yet</p>
            <p className="mt-1 text-sm text-muted">Save the sites you visit most so they&apos;re one tap away.</p>
            <Link href="/dashboard/bookmarks" className="btn-primary mt-4">Add a bookmark</Link>
          </div>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {recent.map((b) => (
              <li key={b.id}>
                <a href={b.url} target="_blank" rel="noopener noreferrer" className="card block py-3 hover:border-brand">
                  <span className="block truncate text-sm font-medium">{b.title}</span>
                  <span className="block truncate text-xs text-muted">{b.url}</span>
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
