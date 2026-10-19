import { signInWithGoogle } from "@/app/actions";
import { googleConfigured } from "@/lib/env";

export function GoogleSignInButton({ callbackUrl = "/dashboard", className = "btn-primary w-full sm:w-auto" }: { callbackUrl?: string; className?: string }) {
  const ok = googleConfigured();
  return (
    <form action={signInWithGoogle}>
      <input type="hidden" name="callbackUrl" value={callbackUrl} />
      <button type="submit" className={className} disabled={!ok} aria-describedby={ok ? undefined : "google-unconfigured"}>
        Continue with Google
      </button>
      {!ok && (
        <p id="google-unconfigured" className="mt-2 rounded-xl bg-warn-bg px-3 py-2 text-sm text-warn">
          Google sign-in isn&apos;t configured on this server yet. Set <code>AUTH_SECRET</code>, <code>AUTH_GOOGLE_ID</code> and <code>AUTH_GOOGLE_SECRET</code> (see README).
        </p>
      )}
    </form>
  );
}
