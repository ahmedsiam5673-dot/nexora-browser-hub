import Link from "next/link";
import { Logo } from "@/components/Logo";
import { GoogleSignInButton } from "@/components/GoogleSignInButton";
import { getCurrentUser } from "@/lib/session";

export default async function Home({ searchParams }: { searchParams: Promise<{ account?: string }> }) {
  const { account } = await searchParams;
  let signedIn = false;
  try { signedIn = Boolean(await getCurrentUser()); } catch { /* DB unavailable: still show the public page */ }

  return (
    <div className="mx-auto flex min-h-dvh max-w-5xl flex-col px-4 sm:px-6">
      <header className="flex items-center justify-between py-5">
        <Logo />
        <nav aria-label="Legal" className="flex gap-4 text-sm text-muted">
          <Link href="/privacy" className="hover:text-ink">Privacy</Link>
          <Link href="/terms" className="hover:text-ink">Terms</Link>
        </nav>
      </header>

      <main id="main" className="flex-1 py-10 sm:py-16">
        {account === "deleted" && (
          <p role="status" className="mb-8 rounded-xl bg-ok-bg px-4 py-3 text-sm text-ok">Your account and its data were permanently deleted.</p>
        )}
        <div className="fade-in max-w-2xl">
          <p className="badge mb-4">Web dashboard + desktop browser</p>
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">One hub for how you browse.</h1>
          <p className="mt-4 text-lg text-muted">
            Sign in with Google to keep your preferences, bookmarks and browser profiles in one place. Install the NEXORA desktop browser for real tabs, isolated profiles and private sessions.
          </p>
          <div className="mt-8">
            {signedIn ? (
              <Link href="/dashboard" className="btn-primary">Open your dashboard</Link>
            ) : (
              <GoogleSignInButton />
            )}
          </div>
        </div>

        <section aria-labelledby="honest" className="mt-16 grid gap-4 sm:grid-cols-2">
          <h2 id="honest" className="sr-only">What it does and doesn&apos;t do</h2>
          <article className="card">
            <h3 className="font-semibold">On the web</h3>
            <p className="mt-2 text-sm text-muted">Search or enter an address and it opens in a new tab of the browser you&apos;re already using. Manage bookmarks, profiles and settings from any device.</p>
          </article>
          <article className="card">
            <h3 className="font-semibold">In the desktop app</h3>
            <p className="mt-2 text-sm text-muted">A real Chromium-based browser: tabs, isolated profiles, private sessions and downloads. Website logins stay on your device.</p>
          </article>
          <article className="card">
            <h3 className="font-semibold">What a website can&apos;t do</h3>
            <p className="mt-2 text-sm text-muted">A web page can&apos;t switch your browser engine or launch Chrome or Firefox for you, so we show honest download links instead of pretending.</p>
          </article>
          <article className="card">
            <h3 className="font-semibold">Your Google sign-in</h3>
            <p className="mt-2 text-sm text-muted">We only ask for your name, email and photo to create your account. We never see your Google password or your Gmail.</p>
          </article>
        </section>
      </main>
      <footer className="py-8 text-xs text-muted">© NEXORA Browser Hub. Third-party names are trademarks of their owners.</footer>
    </div>
  );
}
