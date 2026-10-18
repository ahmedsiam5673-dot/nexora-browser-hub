# NEXORA Browser Hub

Two connected products in one monorepo:

| | What it is | Where |
|---|---|---|
| **Web dashboard** | Next.js 16 app: Google sign-in, onboarding, "Choose Your Browser", omnibox, bookmarks, profiles, settings, export, account deletion | `apps/web` |
| **Desktop browser** | Electron 44 (Chromium) app: real tabs, isolated profiles, private windows, downloads, bookmarks, history | `apps/desktop` |
| **Shared logic** | URL safety, omnibox resolution, search engines, browser catalog, partition naming, privacy prefs | `packages/core` |

## Honest scope

* A web page cannot change its engine or launch Chrome/Firefox. "Choose Your Browser" saves a *preference* and shows official download links; each card states exactly what it does. Safari is marked unavailable off Apple devices. The desktop app is Chromium only and says so (it does **not** embed Firefox).
* Web "private workspace" only avoids storing anything app-side; pages still open in the user's normal browser tabs.
* The desktop app does **not** yet sync with the web account (preferences, bookmarks, history are local to the device). The UI says so.
* Third-party logos are not bundled (trademark permission needed); cards use neutral monograms.

## Run the web app

```bash
npm install
cp apps/web/.env.example apps/web/.env.local   # fill in values (below)
npm run db:migrate -w @nexora/web               # applies apps/web/drizzle/*.sql to DATABASE_URL
npm run dev:web                                 # http://localhost:3000
```

**Database** – any PostgreSQL 14+. `DATABASE_URL=postgresql://user:pass@host:5432/nexora`. Schema: `apps/web/src/db/schema.ts` (users, user_preferences, browser_profiles, bookmark_folders, bookmarks, browsing_history; FKs with cascade delete + indexes). ORM is **Drizzle** (Prisma's engine download is blocked in the build sandbox, so it couldn't be verified; the schema ports directly).

**Google OAuth** – Google Cloud Console → APIs & Services → Credentials → *Create OAuth client ID* → *Web application*. Authorized redirect URI: `http://localhost:3000/api/auth/callback/google` (and your production origin). Put the ID/secret in `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET`; generate `AUTH_SECRET` with `npx auth secret`. Only `openid email profile` is requested. Behind a proxy set `AUTH_URL` and `AUTH_TRUST_HOST=true`.

## Build / run the desktop app

```bash
npm run dev:desktop        # builds and launches Electron
npm run build:desktop      # electron-builder: AppImage/deb, dmg, nsis (build on the target OS)
```
Linux packaged builds need the Chromium sandbox helper (`chrome-sandbox` setuid) – electron-builder handles this for AppImage/deb. Data lives in Electron's userData folder (override with `NEXORA_USER_DATA`). Auto-update only activates when packaged **and** `NEXORA_UPDATE_URL` is set.

## Tests

```bash
npm test                              # unit + DB integration (core 38, web 19, desktop 62)
npm run test:e2e -w @nexora/web       # production server + real PostgreSQL (51 checks)
npm run test:e2e -w @nexora/desktop   # real Electron under Xvfb (55 checks; needs xvfb)
```
Desktop e2e covers: tabs, navigation blocking, cookie persistence, **profile isolation**, **private session isolation and cleanup**, history never receiving private URLs, downloads, restore after restart.
Not covered: the live Google OAuth round-trip, responsive-layout browser tests, automated accessibility audit, packaging/installer runs on Windows/macOS.

## Security design (summary)

* Web: Auth.js JWT session (7-day max, renewed daily), `email_verified` required, nonce-based CSP, HSTS, `frame-ancestors 'none'`; every page/action re-checks the session **and** that the user row still exists; every query is scoped by `user_id`; foreign records (profile/folder) ownership-checked; open-redirect-safe `callbackUrl`; no secrets in client code.
* Desktop: all tabs sandboxed, context-isolated, no Node, **no preload for websites**; only `nexora://` pages get an IPC bridge, and main re-verifies sender frame URL on every call plus a method allowlist and argument validation; web pages cannot navigate to `nexora://`; only http(s) navigable (`javascript:`, `file:`, `data:` blocked); `nexora://` pages have a no-inline/no-remote CSP and cannot reach the network; permissions deny-by-default with prompts for camera/mic/location; dangerous download types confirm before opening; Electron-token removed from the user agent.
* Private windows: in-memory partition, no history/bookmark stores exist for them, downloads in a temp folder deleted on close (unless the user chooses "Keep…"), storage/cache cleared on close.

## Still required for production

Real Google OAuth credentials; production Postgres + migrations; `AUTH_SECRET`; HTTPS domain; code-signing/notarization certificates; an update server (if using auto-update); reviewed Privacy Policy and Terms (current pages are marked templates); trademark clearance before adding browser logos; an admin/monitoring dashboard (only `/api/health` exists today).

## Known gaps

No email/password login (deliberately omitted); no row-level security policies (authorization is enforced in application code, with tests); no extensions, password manager or DRM in the desktop app; no desktop↔web sync; desktop settings are separate from account settings.
