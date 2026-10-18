/**
 * End-to-end smoke test of the PRODUCTION server (`next start`) against a real, throwaway
 * PostgreSQL (embedded-postgres, a PG 18 beta build used for tests only).
 * Sessions are minted with Auth.js's own JWT encoder.
 *
 * NOT covered: the live Google OAuth round-trip (needs real credentials + a browser).
 */
import EmbeddedPostgres from "embedded-postgres";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import fs from "node:fs";
import os from "node:os";
import { encode } from "@auth/core/jwt";
import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import * as schema from "../src/db/schema";
import * as repo from "../src/db/repo";
import type { Db } from "../src/db/repo";

const PG_PORT = 54329;
const WEB_PORT = 3111;
const BASE = `http://localhost:${WEB_PORT}`;
const SECRET = "e2e-secret-e2e-secret-e2e-secret-12345";
const COOKIE = "authjs.session-token";
const WIN_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130 Safari/537.36";

let passed = 0;
const failures: string[] = [];
function check(name: string, ok: boolean, detail = "") {
  if (ok) { passed++; console.log(`  ✓ ${name}`); }
  else { failures.push(name); console.log(`  ✗ ${name} ${detail}`); }
}
const get = (p: string, cookie?: string, extra: Record<string, string> = {}) =>
  fetch(BASE + p, { redirect: "manual", headers: { ...(cookie ? { cookie: `${COOKIE}=${cookie}` } : {}), "user-agent": WIN_UA, ...extra } });
const mint = (uid: string, email: string, name: string) =>
  encode({ token: { sub: uid, uid, email, name }, secret: SECRET, salt: COOKIE, maxAge: 3600 });

async function waitReady() {
  for (let i = 0; i < 60; i++) {
    try { const r = await fetch(`${BASE}/api/health`); if (r.status === 200 || r.status === 503) return; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("server did not start");
}

async function main() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "nexora-e2e-pg-"));
  const pg = new EmbeddedPostgres({ databaseDir: dataDir, user: "postgres", password: "postgres", port: PG_PORT, persistent: false });
  await pg.initialise();
  await pg.start();
  await pg.createDatabase("nexora");
  const pool = new Pool({ connectionString: `postgres://postgres:postgres@127.0.0.1:${PG_PORT}/nexora` });
  const db = drizzle(pool, { schema });
  await migrate(db, { migrationsFolder: path.resolve(process.cwd(), "drizzle") });
  const repoDb = db as unknown as Db;

  const user = await repo.upsertUserFromOAuth(repoDb, { provider: "google", providerUserId: "e2e-1", email: "test@example.com", name: "Test User" });

  const server: ChildProcess = spawn(process.execPath, [path.resolve(process.cwd(), "../../node_modules/next/dist/bin/next"), "start", "-p", String(WEB_PORT)], {
    detached: true,
    env: {
      ...process.env, NODE_ENV: "production", AUTH_SECRET: SECRET, AUTH_URL: BASE, AUTH_TRUST_HOST: "true",
      AUTH_GOOGLE_ID: "dummy-id", AUTH_GOOGLE_SECRET: "dummy-secret",
      DATABASE_URL: `postgres://postgres:postgres@127.0.0.1:${PG_PORT}/nexora`,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let serverLog = "";
  server.stdout?.on("data", (d) => (serverLog += d));
  server.stderr?.on("data", (d) => (serverLog += d));

  try {
    await waitReady();

    console.log("\nPublic pages & headers");
    let r = await get("/");
    const html = await r.text();
    const csp = r.headers.get("content-security-policy") ?? "";
    check("GET / is 200", r.status === 200, String(r.status));
    check("landing offers Continue with Google", html.includes("Continue with Google"));
    check("CSP present with nonce, no unsafe-inline for scripts", /script-src[^;]*'nonce-[^']+'/.test(csp) && !/script-src[^;]*'unsafe-inline'/.test(csp), csp);
    check("CSP frame-ancestors none + object-src none", csp.includes("frame-ancestors 'none'") && csp.includes("object-src 'none'"));
    check("nonce in header matches script tags", (() => { const m = csp.match(/'nonce-([^']+)'/); return !!m && html.includes(`nonce="${m[1]}"`); })());
    check("X-Frame-Options DENY", r.headers.get("x-frame-options") === "DENY");
    check("X-Content-Type-Options nosniff", r.headers.get("x-content-type-options") === "nosniff");
    check("HSTS in production", (r.headers.get("strict-transport-security") ?? "").includes("max-age"));
    check("no X-Powered-By", !r.headers.get("x-powered-by"));

    r = await get("/login?error=AccessDenied");
    check("login shows cancellation message", (await r.text()).includes("cancelled"));
    r = await get("/login?error=Configuration");
    check("login shows configuration error", (await r.text()).includes("isn&#x27;t configured correctly"));
    r = await get("/login?error=SomethingWeird");
    check("login handles unknown error code generically", (await r.text()).includes("Something went wrong while signing in"));
    check("/privacy and /terms are public", (await get("/privacy")).status === 200 && (await get("/terms")).status === 200);

    r = await get("/api/health");
    const health = (await r.json()) as { status: string; database: string };
    check("health reports DB up", r.status === 200 && health.database === "up", JSON.stringify(health));
    check("health leaks no user data", !JSON.stringify(health).includes("@"));

    console.log("\nUnauthenticated access is blocked");
    for (const p of ["/dashboard", "/dashboard/settings", "/dashboard/bookmarks", "/dashboard/profiles", "/dashboard/browsers", "/dashboard/private", "/onboarding"]) {
      r = await get(p);
      check(`${p} redirects to /login`, r.status >= 300 && r.status < 400 && (r.headers.get("location") ?? "").includes("/login"), `${r.status} ${r.headers.get("location")}`);
    }
    r = await get("/api/export");
    check("/api/export is 401 without session", r.status === 401);
    r = await get("/dashboard", "garbage.not.a.jwt");
    check("garbage session cookie is rejected", r.status >= 300 && r.status < 400 && (r.headers.get("location") ?? "").includes("/login"));
    const wrongSecret = await encode({ token: { sub: user.id, uid: user.id }, secret: "a-different-secret-a-different-secret!!", salt: COOKIE, maxAge: 3600 });
    r = await get("/dashboard", wrongSecret);
    check("token signed with the wrong secret is rejected", r.status >= 300 && r.status < 400 && (r.headers.get("location") ?? "").includes("/login"));

    console.log("\nSigned-in, not yet onboarded");
    const tok = await mint(user.id, "test@example.com", "Test User");
    r = await get("/dashboard", tok);
    check("dashboard redirects to /onboarding", r.status >= 300 && r.status < 400 && (r.headers.get("location") ?? "").includes("/onboarding"), `${r.status} ${r.headers.get("location")}`);
    r = await get("/onboarding", tok);
    const ob = await r.text();
    check("onboarding renders welcome + all five choices", r.status === 200 && ob.includes("Welcome, Test") && ob.includes("Default search engine") && ob.includes("Appearance") && ob.includes("Homepage") && ob.includes("Privacy"));
    r = await get("/login", tok);
    check("login redirects an already-signed-in user to the dashboard", r.status >= 300 && r.status < 400 && (r.headers.get("location") ?? "").includes("/dashboard"));

    await repo.savePreferences(repoDb, user.id, { onboardingCompleted: true, defaultSearchEngine: "duckduckgo", theme: "dark" });

    console.log("\nSigned-in dashboard pages");
    const page = async (p: string) => { const res = await get(p, tok); return { res, text: await res.text() }; };
    let pg1 = await page("/dashboard");
    check("home 200, greets user, omnibox present, shows DuckDuckGo", pg1.res.status === 200 && pg1.text.includes("Hi, Test") && pg1.text.includes("Search DuckDuckGo"));
    check("home lists Gmail quick link", pg1.text.includes("https://mail.google.com/"));
    check("home has empty-state for no bookmarks", pg1.text.includes("No bookmarks yet"));
    check("home explains Google sign-in is separate from Gmail", pg1.text.includes("doesn&#x27;t sign you in there"));

    pg1 = await page("/dashboard/browsers");
    check("browsers page titled 'Choose Your Browser'", pg1.res.status === 200 && pg1.text.includes("Choose Your Browser"));
    check("all required browsers listed", ["Google Chrome", "Mozilla Firefox", "Microsoft Edge", "Brave Browser", "Opera", "Safari"].every((n) => pg1.text.includes(n)));
    check("Safari marked unavailable on Windows UA", /Safari[\s\S]{0,900}Not available on your device/.test(pg1.text));
    check("Firefox card states Chromium limitation", pg1.text.includes("the desktop app uses Chromium"));
    check("states a website can't launch other browsers", pg1.text.includes("can&#x27;t launch or embed"));

    for (const [p, needle] of [["/dashboard/bookmarks", "Add a bookmark"], ["/dashboard/profiles", "Browser profiles"], ["/dashboard/private", "What it can&#x27;t do"], ["/dashboard/settings", "Delete my account"]] as const) {
      const x = await page(p);
      check(`${p} renders`, x.res.status === 200 && x.text.includes(needle), String(x.res.status));
    }
    const st = (await page("/dashboard/settings")).text;
    check("settings: history labelled unavailable (not a fake control)", st.includes("Unavailable here"));
    check("settings: says desktop doesn't read account settings yet", st.includes("doesn&#x27;t read account settings yet"));
    check("theme cookie not required: dark pref stored", (await repo.getPreferences(repoDb, user.id)).theme === "dark");

    console.log("\nExport");
    r = await get("/api/export", tok);
    const exp = (await r.json()) as { account: { email: string } };
    check("export is a JSON attachment for the caller", r.status === 200 && (r.headers.get("content-disposition") ?? "").includes("attachment") && exp.account.email === "test@example.com");
    check("export is not cacheable", r.headers.get("cache-control") === "no-store");

    console.log("\nDeleted-account token grants nothing");
    const ghost = await repo.upsertUserFromOAuth(repoDb, { provider: "google", providerUserId: "e2e-ghost", email: "ghost@example.com" });
    const ghostTok = await mint(ghost.id, "ghost@example.com", "Ghost");
    r = await get("/api/export", ghostTok);
    check("ghost can export before deletion", r.status === 200);
    await repo.deleteAccount(repoDb, ghost.id);
    r = await get("/dashboard", ghostTok);
    check("dashboard redirects to /login after deletion", r.status >= 300 && r.status < 400 && (r.headers.get("location") ?? "").includes("/login"), `${r.status} ${r.headers.get("location")}`);
    r = await get("/api/export", ghostTok);
    check("export is 401 after deletion", r.status === 401, String(r.status));

    console.log("\nUser isolation through the real app");
    const other = await repo.upsertUserFromOAuth(repoDb, { provider: "google", providerUserId: "e2e-2", email: "other@example.com", name: "Other" });
    await repo.savePreferences(repoDb, other.id, { onboardingCompleted: true });
    await repo.createBookmark(repoDb, other.id, { title: "OTHER-USERS-SECRET-BOOKMARK", url: "https://secret.example" });
    pg1 = await page("/dashboard/bookmarks");
    check("one user's bookmarks never render for another", !pg1.text.includes("OTHER-USERS-SECRET-BOOKMARK"));
    const otherTok = await mint(other.id, "other@example.com", "Other");
    const otherPage = await (await get("/dashboard/bookmarks", otherTok)).text();
    check("…but do render for their owner", otherPage.includes("OTHER-USERS-SECRET-BOOKMARK"));
  } catch (e) {
    console.log("\n--- script crashed; server log tail ---\n" + serverLog.slice(-3500));
    throw e;
  } finally {
    try { if (server.pid) process.kill(-server.pid, "SIGTERM"); } catch { /* already gone */ }
    await pool.end();
    await pg.stop();
  }
  console.log(`\n${passed} passed, ${failures.length} failed`);
  if (failures.length) { console.log("Failures:\n - " + failures.join("\n - ")); console.log("\n--- server log tail ---\n" + serverLog.slice(-2000)); process.exit(1); }
}
main().catch((e) => { console.error(e); process.exit(1); });
