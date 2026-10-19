import Link from "next/link";
import { Logo } from "@/components/Logo";
import { BottomNav, SidebarNav } from "@/components/Nav";
import { logoutAction } from "@/app/actions";
import { requireOnboardedUser } from "@/lib/session";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user } = await requireOnboardedUser();
  return (
    <div className="mx-auto flex min-h-dvh max-w-6xl gap-6 px-4 sm:px-6">
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col justify-between py-6 md:flex">
        <div className="space-y-8">
          <Link href="/dashboard" aria-label="NEXORA Browser Hub dashboard"><Logo size={30} /></Link>
          <SidebarNav />
        </div>
        <div className="space-y-3">
          <div className="flex items-center gap-3 rounded-xl border border-line bg-surface p-3">
            {user.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={user.avatarUrl} alt="" width={36} height={36} referrerPolicy="no-referrer" className="h-9 w-9 rounded-full" />
            ) : (
              <span className="grid h-9 w-9 place-items-center rounded-full bg-surface-2 text-sm font-semibold" aria-hidden="true">{(user.displayName ?? user.email)[0]?.toUpperCase()}</span>
            )}
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{user.displayName ?? "Your account"}</p>
              <p className="truncate text-xs text-muted">{user.email}</p>
            </div>
          </div>
          <form action={logoutAction}><button className="btn-ghost w-full" type="submit">Log out</button></form>
        </div>
      </aside>
      <main id="main" className="min-w-0 flex-1 py-6 pb-24 md:pb-10">
        <div className="mb-6 flex items-center justify-between md:hidden"><Logo size={28} /></div>
        {children}
      </main>
      <BottomNav />
    </div>
  );
}
