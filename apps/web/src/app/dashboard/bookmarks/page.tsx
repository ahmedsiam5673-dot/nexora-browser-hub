import type { Metadata } from "next";
import { ActionForm, SubmitButton } from "@/components/ActionForm";
import { ConfirmForm } from "@/components/ConfirmForm";
import { FormDialog } from "@/components/FormDialog";
import { createBookmarkAction, createFolderAction, deleteBookmarkAction, deleteFolderAction, updateBookmarkAction } from "@/app/actions";
import { getDb } from "@/db";
import { listBookmarks, listFolders } from "@/db/repo";
import { requireOnboardedUser } from "@/lib/session";

export const metadata: Metadata = { title: "Bookmarks" };

export default async function BookmarksPage({ searchParams }: { searchParams: Promise<{ q?: string; folder?: string }> }) {
  const { user } = await requireOnboardedUser();
  const { q = "", folder = "" } = await searchParams;
  const db = getDb();
  const [all, folders] = await Promise.all([listBookmarks(db, user.id, { search: q.slice(0, 100) }), listFolders(db, user.id)]);
  const items = folder === "none" ? all.filter((b) => !b.folderId) : folder ? all.filter((b) => b.folderId === folder) : all;
  const folderName = (id: string | null) => folders.find((f) => f.id === id)?.name;

  return (
    <div className="fade-in space-y-8">
      <header>
        <h1 className="text-2xl font-bold sm:text-3xl">Bookmarks</h1>
        <p className="mt-1 text-sm text-muted">Saved to your account. The desktop browser&apos;s own bookmark toolbar doesn&apos;t sync with these yet.</p>
      </header>

      <section className="card" aria-labelledby="add">
        <h2 id="add" className="mb-3 font-semibold">Add a bookmark</h2>
        <ActionForm action={createBookmarkAction} resetOnSuccess className="grid gap-3 sm:grid-cols-2">
          <div><label className="label" htmlFor="b-title">Name</label><input id="b-title" name="title" className="input" maxLength={300} placeholder="Optional" /></div>
          <div><label className="label" htmlFor="b-url">Address</label><input id="b-url" name="url" className="input" required inputMode="url" placeholder="https://example.com" /></div>
          <div>
            <label className="label" htmlFor="b-folder">Folder</label>
            <select id="b-folder" name="folderId" className="input" defaultValue="">
              <option value="">No folder</option>
              {folders.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          </div>
          <div className="flex items-end"><SubmitButton>Add bookmark</SubmitButton></div>
        </ActionForm>
      </section>

      <section aria-labelledby="folders" className="space-y-3">
        <h2 id="folders" className="font-semibold">Folders</h2>
        <div className="flex flex-wrap items-center gap-2">
          <a href="/dashboard/bookmarks" className={`badge ${!folder ? "!bg-brand !text-brand-fg" : ""}`}>All</a>
          <a href="/dashboard/bookmarks?folder=none" className={`badge ${folder === "none" ? "!bg-brand !text-brand-fg" : ""}`}>Unfiled</a>
          {folders.map((f) => (
            <span key={f.id} className="inline-flex items-center gap-1">
              <a href={`/dashboard/bookmarks?folder=${f.id}`} className={`badge ${folder === f.id ? "!bg-brand !text-brand-fg" : ""}`}>{f.name}</a>
              <ConfirmForm action={deleteFolderAction} hidden={{ id: f.id }} triggerLabel="✕" triggerClassName="px-1 text-xs text-muted hover:text-danger"
                title={`Delete folder “${f.name}”?`} description="The bookmarks inside are kept and moved to Unfiled." confirmLabel="Delete folder" />
            </span>
          ))}
        </div>
        <ActionForm action={createFolderAction} resetOnSuccess className="flex max-w-md gap-2">
          <label className="sr-only" htmlFor="f-name">New folder name</label>
          <input id="f-name" name="name" className="input" placeholder="New folder" maxLength={80} required />
          <SubmitButton className="btn-ghost">Create</SubmitButton>
        </ActionForm>
      </section>

      <section aria-labelledby="list" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="list" className="font-semibold">{items.length} bookmark{items.length === 1 ? "" : "s"}</h2>
          <form method="get" role="search" className="flex gap-2">
            {folder && <input type="hidden" name="folder" value={folder} />}
            <label className="sr-only" htmlFor="q">Search bookmarks</label>
            <input id="q" name="q" defaultValue={q} className="input w-56" placeholder="Search bookmarks" />
            <button className="btn-ghost" type="submit">Search</button>
          </form>
        </div>

        {items.length === 0 ? (
          <div className="card text-center">
            <p className="text-sm font-medium">{q ? `No bookmarks match “${q}”` : "Nothing here yet"}</p>
            <p className="mt-1 text-sm text-muted">{q ? "Try a different search." : "Add your first bookmark above."}</p>
          </div>
        ) : (
          <ul className="space-y-2">
            {items.map((b) => (
              <li key={b.id} className="card flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <a href={b.url} target="_blank" rel="noopener noreferrer" className="block truncate text-sm font-medium hover:text-brand">{b.title}</a>
                  <p className="truncate text-xs text-muted">{b.url}{folderName(b.folderId) ? ` · ${folderName(b.folderId)}` : ""}</p>
                </div>
                <div className="flex gap-2">
                  <FormDialog triggerLabel="Edit" title="Edit bookmark" action={updateBookmarkAction}>
                    <input type="hidden" name="id" value={b.id} />
                    <div><label className="label" htmlFor={`t-${b.id}`}>Name</label><input id={`t-${b.id}`} name="title" className="input" defaultValue={b.title} maxLength={300} /></div>
                    <div><label className="label" htmlFor={`u-${b.id}`}>Address</label><input id={`u-${b.id}`} name="url" className="input" defaultValue={b.url} required /></div>
                    <div>
                      <label className="label" htmlFor={`f-${b.id}`}>Folder</label>
                      <select id={`f-${b.id}`} name="folderId" className="input" defaultValue={b.folderId ?? ""}>
                        <option value="">No folder</option>
                        {folders.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                      </select>
                    </div>
                  </FormDialog>
                  <ConfirmForm action={deleteBookmarkAction} hidden={{ id: b.id }} triggerLabel="Delete" triggerClassName="btn-ghost min-h-9 px-3"
                    title="Delete this bookmark?" description={`“${b.title}” will be removed.`} confirmLabel="Delete" />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
