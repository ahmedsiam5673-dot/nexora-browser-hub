import type { Metadata } from "next";
import { headers } from "next/headers";
import { BROWSER_OPTIONS, availabilityFor, detectPlatform, type BrowserOption } from "@nexora/core";
import { ActionForm, SubmitButton } from "@/components/ActionForm";
import { selectBrowserAction } from "@/app/actions";
import { requireOnboardedUser } from "@/lib/session";

export const metadata: Metadata = { title: "Choose Your Browser" };

const MODE_LABEL: Record<BrowserOption["mode"], string> = {
  embedded: "Embedded browser engine (desktop app)",
  web: "Web browsing mode",
  external: "External browser",
};

export default async function BrowsersPage() {
  const { prefs } = await requireOnboardedUser();
  const platform = detectPlatform((await headers()).get("user-agent") ?? "");

  return (
    <div className="fade-in space-y-6">
      <header>
        <h1 className="text-2xl font-bold sm:text-3xl">Choose Your Browser</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          A website can&apos;t change the engine of the browser you&apos;re using, and it can&apos;t launch or embed Chrome, Firefox or others. Each card says exactly what it does. Selecting one saves it as your preference.
        </p>
      </header>

      <ul className="grid gap-4 md:grid-cols-2">
        {BROWSER_OPTIONS.map((b) => {
          const avail = availabilityFor(b, platform);
          const selected = prefs.browserExperience === b.id;
          return (
            <li key={b.id} className={`card flex flex-col gap-3 ${selected ? "border-brand" : ""}`}>
              <div className="flex items-start gap-3">
                <span aria-hidden="true" className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-surface-2 text-lg font-bold text-brand">{b.name.replace("NEXORA ", "")[0]}</span>
                <div className="min-w-0">
                  <h2 className="font-semibold">{b.name}</h2>
                  <p className="mt-0.5 text-sm text-muted">{b.description}</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <span className="badge">{MODE_LABEL[b.mode]}</span>
                <span className="badge">Engine: {b.engine}</span>
                <span className={`badge ${avail.status === "available" ? "!bg-ok-bg !text-ok" : "!bg-warn-bg !text-warn"}`}>{avail.label}</span>
                {selected && <span className="badge !bg-brand !text-brand-fg">Your preference</span>}
              </div>
              <p className="text-xs text-muted"><b className="text-ink">Limits:</b> {b.limitation}</p>
              <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
                <ActionForm action={selectBrowserAction} className="contents">
                  <input type="hidden" name="browserExperience" value={b.id} />
                  <SubmitButton className={selected ? "btn-ghost" : "btn-primary"}>{selected ? "Selected" : "Select"}</SubmitButton>
                </ActionForm>
                {b.downloadUrl && avail.status === "available" && (
                  <a href={b.downloadUrl} target="_blank" rel="noopener noreferrer" className="btn-ghost">
                    Official download page <span className="sr-only">(opens in a new tab)</span>
                  </a>
                )}
                {b.id === "safari" && avail.status === "available" && <span className="text-xs text-muted">Already installed on Apple devices.</span>}
                {b.id === "nexora-desktop" && <span className="text-xs text-muted">Build instructions are in the project README; there is no hosted installer yet.</span>}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
