import type { Metadata } from "next";
import { ActionForm, SubmitButton } from "@/components/ActionForm";
import { ConfirmForm } from "@/components/ConfirmForm";
import { FormDialog } from "@/components/FormDialog";
import { createProfileAction, deleteProfileAction, renameProfileAction } from "@/app/actions";
import { getDb } from "@/db";
import { listProfiles } from "@/db/repo";
import { requireOnboardedUser } from "@/lib/session";

export const metadata: Metadata = { title: "Profiles" };

export default async function ProfilesPage() {
  const { user } = await requireOnboardedUser();
  const profiles = await listProfiles(getDb(), user.id);
  return (
    <div className="fade-in space-y-6">
      <header>
        <h1 className="text-2xl font-bold sm:text-3xl">Browser profiles</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Profiles are used by the desktop browser. Each one gets its own cookies, website logins and storage on your device. They are separate from your NEXORA account and from any Google accounts you sign in to on websites.
        </p>
      </header>

      <ul className="grid gap-3 sm:grid-cols-2">
        {profiles.map((p) => (
          <li key={p.id} className="card flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate font-medium">{p.profileName}</p>
              <p className="text-xs text-muted">Created {p.createdAt.toLocaleDateString("en", { dateStyle: "medium" })}</p>
            </div>
            <div className="flex gap-2">
              <FormDialog triggerLabel="Rename" title="Rename profile" action={renameProfileAction}>
                <input type="hidden" name="id" value={p.id} />
                <div><label className="label" htmlFor={`n-${p.id}`}>Name</label><input id={`n-${p.id}`} name="name" className="input" defaultValue={p.profileName} maxLength={40} required /></div>
              </FormDialog>
              {profiles.length > 1 && (
                <ConfirmForm action={deleteProfileAction} hidden={{ id: p.id }} triggerLabel="Delete" triggerClassName="btn-ghost min-h-9 px-3"
                  title={`Delete “${p.profileName}”?`} description="This profile and its bookmarks are deleted from your account. Cookies and logins stored by the desktop app on your devices are not touched; delete the profile in the desktop app too if you want those removed." confirmLabel="Delete profile" />
              )}
            </div>
          </li>
        ))}
      </ul>

      <section className="card" aria-labelledby="new">
        <h2 id="new" className="mb-3 font-semibold">New profile</h2>
        <ActionForm action={createProfileAction} resetOnSuccess className="flex max-w-md gap-2">
          <label className="sr-only" htmlFor="p-name">Profile name</label>
          <input id="p-name" name="name" className="input" placeholder="e.g. Work, Study, Shopping" maxLength={40} required />
          <SubmitButton>Create</SubmitButton>
        </ActionForm>
        <p className="hint">Private sessions are separate: they are temporary and never saved as profiles.</p>
      </section>
    </div>
  );
}
