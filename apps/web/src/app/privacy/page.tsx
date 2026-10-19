import type { Metadata } from "next";
import Link from "next/link";
export const metadata: Metadata = { title: "Privacy policy" };

export default function PrivacyPage() {
  return (
    <main id="main" className="prose-nx mx-auto max-w-2xl space-y-4 px-4 py-10">
      <Link href="/" className="text-sm text-brand">← Back</Link>
      <h1 className="text-3xl font-bold">Privacy policy</h1>
      <p className="rounded-xl bg-warn-bg px-3 py-2 text-sm text-warn">Template for operators: have this reviewed by a lawyer and adapt it to your jurisdiction (e.g. GDPR) before launch.</p>
      <h2 className="text-xl font-semibold">What we store</h2>
      <p className="text-muted">From Google sign-in: your Google account&apos;s unique ID, name, email address and profile photo URL. From you: your preferences, browser profile names, and bookmarks. That&apos;s all.</p>
      <h2 className="text-xl font-semibold">What we never store</h2>
      <p className="text-muted">Your Google password, Gmail content, website passwords, cookies or session tokens from sites you visit, and anything from private browsing sessions. Website sessions live only inside the desktop app on your own device.</p>
      <h2 className="text-xl font-semibold">Browsing history</h2>
      <p className="text-muted">The web dashboard does not record what you browse. The optional &ldquo;recent searches&rdquo; list is kept in your own browser&apos;s local storage and you can clear it at any time. Private sessions are never written to any history.</p>
      <h2 className="text-xl font-semibold">Your controls</h2>
      <p className="text-muted">You can export your data and permanently delete your account in Settings. Deletion removes your user record and everything linked to it.</p>
      <h2 className="text-xl font-semibold">Cookies</h2>
      <p className="text-muted">We use a strictly necessary, encrypted session cookie to keep you signed in, and a theme cookie to remember light or dark mode. We use no advertising or analytics trackers.</p>
    </main>
  );
}
