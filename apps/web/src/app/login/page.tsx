import { redirect } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { Logo } from "@/components/Logo";
import { GoogleSignInButton } from "@/components/GoogleSignInButton";
import { getCurrentUser } from "@/lib/session";

export const metadata: Metadata = { title: "Sign in" };

const MESSAGES: Record<string, string> = {
  AccessDenied: "Sign-in was cancelled, or Google couldn't confirm your email address. Please try again.",
  OAuthSignin: "We couldn't start Google sign-in. Please try again.",
  OAuthCallbackError: "Google sign-in didn't complete. If you cancelled, you can try again any time.",
  OAuthAccountNotLinked: "That email is already linked to a different sign-in method.",
  Configuration: "Sign-in isn't configured correctly on this server. Please contact the administrator.",
  SessionRequired: "Please sign in to continue.",
  Verification: "That sign-in link has expired. Please try again.",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; callbackUrl?: string }> }) {
  const { error, callbackUrl } = await searchParams;
  let user = null;
  try { user = await getCurrentUser(); } catch { /* DB down: show login, the action will report */ }
  if (user) redirect("/dashboard");

  const message = error ? (MESSAGES[error] ?? "Something went wrong while signing in. Please try again.") : null;
  const safeCallback = callbackUrl && /^\/(?!\/)[\w\-./?=&%]*$/.test(callbackUrl) ? callbackUrl : "/dashboard";

  return (
    <main id="main" className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4 py-10">
      <div className="mb-8"><Link href="/" aria-label="NEXORA Browser Hub home"><Logo /></Link></div>
      <div className="card fade-in space-y-5">
        <div>
          <h1 className="text-2xl font-bold">Sign in</h1>
          <p className="mt-1 text-sm text-muted">Use your Google account. A NEXORA account is created automatically the first time.</p>
        </div>
        {message && <p role="alert" className="rounded-xl bg-danger-bg px-3 py-2 text-sm text-danger">{message}</p>}
        <GoogleSignInButton callbackUrl={safeCallback} className="btn-primary w-full" />
        <p className="text-xs text-muted">
          We request only your name, email address and profile photo. We never receive your Google password and never request access to Gmail.
        </p>
      </div>
    </main>
  );
}
