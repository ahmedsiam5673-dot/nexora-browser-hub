import type { Metadata } from "next";
import Link from "next/link";
import { isSearchEngineId, DEFAULT_SEARCH_ENGINE } from "@nexora/core";
import { Omnibox } from "@/components/Omnibox";
import { requireOnboardedUser } from "@/lib/session";

export const metadata: Metadata = { title: "Private workspace" };

export default async function PrivateWorkspace() {
  const { prefs } = await requireOnboardedUser();
  const engine = isSearchEngineId(prefs.defaultSearchEngine) ? prefs.defaultSearchEngine : DEFAULT_SEARCH_ENGINE;
  return (
    <div className="fade-in space-y-6">
      <header className="rounded-2xl bg-ink px-5 py-4 text-bg">
        <p className="text-xs font-semibold uppercase tracking-wider opacity-80">Private workspace</p>
        <h1 className="text-2xl font-bold">Private web workspace</h1>
      </header>

      <Omnibox engine={engine} homepage={prefs.homepageUrl} mode="private" />

      <section className="card space-y-3" aria-labelledby="what">
        <h2 id="what" className="font-semibold">What this does</h2>
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
          <li>Nothing you enter here is saved to your account, the server, or this browser&apos;s local storage.</li>
          <li>The list of items opened in this session lives only in memory and is cleared when you leave or close the page.</li>
          <li>The normal home page&apos;s &ldquo;recent&rdquo; list is not updated from here.</li>
        </ul>
        <h2 className="pt-2 font-semibold">What it can&apos;t do</h2>
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
          <li>Pages open in your browser&apos;s <b>normal</b> tabs, so your browser, its extensions and synced history may still record them. For a real private window, use your browser&apos;s own private mode or the NEXORA desktop app.</li>
          <li>Websites, your network provider, your employer or school, and your device can still see your activity. This does not make you anonymous.</li>
        </ul>
        <Link href="/dashboard" className="btn-ghost mt-2">Exit and clear</Link>
      </section>
    </div>
  );
}
