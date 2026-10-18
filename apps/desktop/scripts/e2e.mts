/**
 * Behavioural end-to-end test of the REAL desktop app (Electron + Chromium) under Xvfb.
 * Driven over CDP (renderers) and the Node inspector (native menu clicks). Needs a display.
 * Uses --no-sandbox only because the CI container can't install chrome-sandbox setuid.
 */
import { chromium, type Browser, type Page } from "playwright-core";
import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs"; import http from "node:http"; import os from "node:os"; import path from "node:path";

const ROOT = path.resolve(".");
const ELECTRON = path.resolve("../../node_modules/electron/dist/electron");
const WEB = 8765, CDP = 9333, INSPECT = 9229;
const base = `http://localhost:${WEB}`;
const ud = fs.mkdtempSync(path.join(os.tmpdir(), "nx-e2e-ud-"));
let dlDir = path.join(os.homedir(), "Downloads");

let passed = 0; const failed: string[] = [];
const check = (name: string, ok: boolean, detail = "") => { if (ok) { passed++; console.log(`  ✓ ${name}`); } else { failed.push(name); console.log(`  ✗ ${name} ${detail}`); } };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function until<T>(fn: () => Promise<T | false | null | undefined> | T | false | null | undefined, ms = 10000, step = 150): Promise<T | null> {
  const end = Date.now() + ms;
  while (Date.now() < end) { try { const v = await fn(); if (v) return v as T; } catch { /* retry */ } await sleep(step); }
  return null;
}

/* ---- local web server ---- */
const hits: string[] = [];
const server = http.createServer((req, res) => {
  hits.push(req.url ?? "");
  const u = new URL(req.url ?? "/", base);
  if (u.pathname === "/set") { res.setHeader("Set-Cookie", `sid=${u.searchParams.get("v") ?? "abc"}; Max-Age=3600; Path=/`); res.setHeader("Content-Type", "text/html"); return void res.end("<title>Cookie set</title>ok"); }
  if (u.pathname === "/echo") { res.setHeader("Content-Type", "text/html"); return void res.end(`<title>Echo</title><pre id="c">${req.headers.cookie ?? "(none)"}</pre><pre id="gpc">${req.headers["sec-gpc"] ?? "(none)"}</pre><pre id="ua">${req.headers["user-agent"]}</pre>`); }
  if (u.pathname === "/dl") { res.setHeader("Content-Type", "application/octet-stream"); res.setHeader("Content-Disposition", `attachment; filename="${u.searchParams.get("n") ?? "nx-test.txt"}"`); return void res.end("hello download"); }
  res.setHeader("Content-Type", "text/html"); res.end(`<title>Hello ${u.pathname}</title><h1>Hello</h1>`);
});
await new Promise<void>((r) => server.listen(WEB, "127.0.0.1", r));

/* ---- app lifecycle ---- */
let proc: ChildProcess | null = null; let browser: Browser;
async function launch() {
  proc = spawn(ELECTRON, ["--no-sandbox", "--disable-gpu", `--remote-debugging-port=${CDP}`, `--inspect=${INSPECT}`, path.join(ROOT, "dist/main.cjs")], { env: { ...process.env, NEXORA_USER_DATA: ud }, stdio: "ignore", detached: true });
  const ok = await until(async () => (await fetch(`http://127.0.0.1:${CDP}/json/version`)).ok, 20000, 300);
  if (!ok) throw new Error("app did not start");
  browser = await chromium.connectOverCDP(`http://127.0.0.1:${CDP}`);
  await until(() => chromePages().length > 0, 15000);
}
const pages = (): Page[] => browser.contexts().flatMap((c) => c.pages());
const chromePages = () => pages().filter((p) => p.url() === "nexora://chrome/");
async function mainEval(expr: string) {
  const list = (await (await fetch(`http://127.0.0.1:${INSPECT}/json`)).json()) as { webSocketDebuggerUrl: string }[];
  const ws = new WebSocket(list[0]!.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  const out = await new Promise<any>((resolve) => { ws.onmessage = (m) => resolve(JSON.parse(String(m.data))); ws.send(JSON.stringify({ id: 1, method: "Runtime.evaluate", params: { expression: expr, awaitPromise: true, returnByValue: true } })); });
  ws.close();
  if (out.result?.exceptionDetails) throw new Error(JSON.stringify(out.result.exceptionDetails).slice(0, 300));
  return out.result?.result?.value;
}
const menu = (id: string) => mainEval(`process.mainModule.require('electron').Menu.getApplicationMenu().getMenuItemById(${JSON.stringify(id)}).click()`);
async function quit(graceful = true) {
  if (!proc) return;
  try { browser?.close().catch(() => undefined); } catch { /* */ }
  if (graceful) { try { await mainEval("process.mainModule.require('electron').app.quit()"); } catch { /* */ } }
  await until(() => proc!.exitCode !== null || proc!.signalCode !== null, 8000);
  try { process.kill(-proc.pid!, "SIGKILL"); } catch { /* gone */ }
  proc = null; await sleep(500);
}

/* ---- window helpers ---- */
type St = { tabs: { id: number; title: string; url: string; internal: boolean; active: boolean; pinned: boolean; loading: boolean }[]; activeId: number; private: boolean; profile: { name: string } | null; address: string; notice: string | null; currentBookmarked: boolean };
const state = (c: Page): Promise<St> => c.evaluate(() => (window as any).nexoraChrome.getState());
const act = (c: Page, a: unknown) => c.evaluate((x) => (window as any).nexoraChrome.action(x), a);
async function chromeFor(pred: (s: St) => boolean) { for (const c of chromePages()) { try { if (pred(await state(c))) return c; } catch { /* */ } } return null; }
const personal = () => until(() => chromeFor((s) => !s.private && s.profile?.name === "Personal"));
const findPage = (urlPrefix: string) => pages().find((p) => p.url().startsWith(urlPrefix));
async function go(c: Page, input: string, expectUrl?: string) {
  await act(c, { type: "go", input });
  if (expectUrl) await until(() => pages().some((p) => p.url().startsWith(expectUrl)), 8000);
  await sleep(250);
}
const bodyText = async (urlPrefix: string, sel = "body") => { const p = await until(() => findPage(urlPrefix)); return p ? (await p.locator(sel).first().innerText({ timeout: 5000 }).catch(() => "")) : ""; };
const invoke = (p: Page, m: string, a?: unknown) => p.evaluate(([m, a]) => (window as any).nexoraInternal.invoke(m, a), [m, a] as const) as Promise<{ ok: boolean; data?: any; error?: string }>;

try {
  console.log("\nStartup");
  await launch();
  let P = (await personal())!;
  check("app starts and shows the toolbar page", !!P);
  let s = await state(P);
  check("first window is the Personal profile with one new-tab page", s.tabs.length === 1 && s.tabs[0]!.internal && !s.private);
  const ntPage = await until(() => findPage("nexora://newtab/"));
  check("new-tab page renders (search box + quick access)", !!ntPage && (await ntPage.locator("#q").count()) === 1 && (await ntPage.locator("text=Gmail").count()) > 0);
  check("new-tab page can't reach the network (CSP / no remote)", !!ntPage && (await ntPage.evaluate(() => fetch("https://example.com").then(() => "reached", () => "blocked"))) === "blocked");

  console.log("\nNavigation");
  await go(P, `${base}/echo`, `${base}/echo`);
  const echo = findPage(`${base}/echo`)!;
  check("typing a URL loads it in a real Chromium tab", !!echo && (await echo.title()) === "Echo");
  s = await state(P);
  check("address bar shows the URL; tab title updates", s.address.startsWith(`${base}/echo`) && s.tabs.some((t) => t.title === "Echo"), JSON.stringify(s.tabs.map((t) => [t.title, t.url])));
  check("web page gets NO privileged APIs (no bridge, no node)", (await echo.evaluate(() => [typeof (window as any).nexoraInternal, typeof (window as any).nexoraChrome, typeof (window as any).require, typeof (window as any).process].join(","))) === "undefined,undefined,undefined,undefined");
  const ua = await bodyText(`${base}/echo`, "#ua");
  check("user agent has no 'Electron' token", !/Electron/i.test(ua) && /Chrome\//.test(ua), ua);
  check("Global Privacy Control header sent by default", (await bodyText(`${base}/echo`, "#gpc")).trim() === "1");

  await go(P, "javascript:alert(1)");
  s = await state(P);
  check("javascript: from the address bar is blocked with a notice", !!s.notice && s.address.startsWith(`${base}/echo`), JSON.stringify([s.notice, s.address]));
  await go(P, "file:///etc/passwd"); s = await state(P);
  check("file:// is blocked", !!s.notice && s.address.startsWith(`${base}/echo`));
  await echo.evaluate(() => { location.href = "nexora://settings/"; }).catch(() => undefined); await sleep(600);
  s = await state(P);
  check("a web page cannot navigate itself to a browser page", s.tabs.find((t) => t.active)!.internal === false && !findPage("nexora://settings/"));

  await go(P, "http://localhost:59999/", "data:text/html");
  const errPage = pages().find((p) => p.url().startsWith("data:text/html"));
  const errText = errPage ? await errPage.locator("body").innerText().catch((e) => "ERR " + e) : "";
  check("unreachable site shows a friendly error page (not a blank tab)", !!errPage && /can.t be reached|refused|unreachable/i.test(errText), JSON.stringify([errText, pages().map((p) => p.url().slice(0, 40))]));
  await act(P, { type: "reload" }); await sleep(500);
  check("Reload on an error page retries the real address", hits.length > 0 && (await state(P)).address.startsWith("http://localhost:59999/"));

  console.log("\nSearch");
  await go(P, "some search terms");
  s = await state(P);
  check("plain text is sent to the default search engine (Google)", s.address.startsWith("https://www.google.com/search?q=some%20search%20terms") || s.tabs.find((t) => t.active)!.url.includes("google.com/search?q=some%20search%20terms"), s.address);

  console.log("\nTabs");
  await go(P, `${base}/a`, `${base}/a`);
  await act(P, { type: "newTab" }); await sleep(500);
  s = await state(P); const n1 = s.tabs.length;
  check("new tab opens and becomes active", s.tabs.find((t) => t.active)!.internal && n1 >= 2);
  await go(P, `${base}/b`, `${base}/b`);
  s = await state(P);
  const ids = s.tabs.map((t) => t.id);
  await act(P, { type: "moveTab", id: ids[ids.length - 1], to: 0 }); await sleep(300);
  check("tabs can be reordered", (await state(P)).tabs[0]!.id === ids[ids.length - 1]);
  await act(P, { type: "activateTab", id: ids[0] }); await sleep(300);
  check("switching tabs changes the active tab", (await state(P)).activeId === ids[0]);
  await act(P, { type: "closeTab", id: ids[0] }); await sleep(400);
  s = await state(P);
  check("closing a tab removes it and activates a neighbour", s.tabs.length === n1 - 1 + 0 && !s.tabs.some((t) => t.id === ids[0]) && s.tabs.some((t) => t.active));
  await menu("reopen-tab"); await sleep(600);
  check("Reopen Closed Tab restores it", (await state(P)).tabs.length === n1);
  await act(P, { type: "back" }); await sleep(200);

  console.log("\nCookies & history (Personal profile)");
  await go(P, `${base}/set?v=personal1`, `${base}/set`); await sleep(300);
  await go(P, `${base}/echo`, `${base}/echo`); await sleep(300);
  check("website cookie works inside the browser", (await bodyText(`${base}/echo`, "#c")).includes("sid=personal1"));
  await go(P, "nexora://history/", "nexora://history/"); await sleep(600);
  const hist = findPage("nexora://history/")!;
  const hl = await invoke(hist, "history:list", {});
  check("normal browsing is recorded in this profile's history", hl.ok && hl.data.entries.some((e: any) => e.url.startsWith(`${base}/echo`)));
  check("only http(s) pages are recorded (no nexora:// or data:)", hl.data.entries.every((e: any) => /^https?:/.test(e.url)));
  const hp = await invoke(hist, "history:list", { search: "personal1" });
  check("history search works", hp.ok && hp.data.entries.length >= 1 && hp.data.entries.every((e: any) => /personal1/i.test(e.url + e.title)));
  const beforeCount = hl.data.entries.length;

  console.log("\nBookmarks");
  await go(P, `${base}/bm`, `${base}/bm`); await sleep(300);
  await act(P, { type: "toggleBookmark" }); await sleep(400);
  check("Ctrl+D action bookmarks the page (star on)", (await state(P)).currentBookmarked);
  const bmPage = await (async () => { await go(P, "nexora://bookmarks/", "nexora://bookmarks/"); await sleep(500); return findPage("nexora://bookmarks/")!; })();
  const bl = await invoke(bmPage, "bookmarks:list", {});
  check("bookmark appears in the manager", bl.ok && bl.data.some((b: any) => b.url === `${base}/bm`));
  const ev = await invoke(bmPage, "bookmarks:add", { title: "x", url: "javascript:alert(1)" });
  check("manager rejects unsafe bookmark URLs", !ev.ok);

  console.log("\nProfiles: isolation");
  await go(P, "nexora://settings/", "nexora://settings/"); await sleep(500);
  const settings = findPage("nexora://settings/")!;
  const cr = await invoke(settings, "profiles:create", { name: "Work" });
  check("create a second profile", cr.ok);
  const dup = await invoke(settings, "profiles:create", { name: "work" });
  check("duplicate profile names are rejected", !dup.ok && /exists/i.test(dup.error ?? ""));
  const op = await invoke(settings, "profiles:open", { id: cr.data.id });
  check("open the Work profile in its own window", op.ok);
  const W = await until(() => chromeFor((st) => st.profile?.name === "Work"));
  check("Work window exists", !!W && chromePages().length === 2);
  if (W) {
    await go(W, `${base}/echo`, `${base}/echo`); await sleep(500);
    const workEchoPage = pages().filter((p) => p.url().startsWith(`${base}/echo`));
    let workCookie = ""; for (const p of workEchoPage) { const t = await p.locator("#c").innerText().catch(() => ""); if (t) workCookie = t; }
    check("Work profile does NOT see Personal's cookie (isolated storage)", workEchoPage.length >= 1 && !workCookie.includes("sid=personal1"), workCookie);
    await go(W, `${base}/set?v=work1`, `${base}/set`); await sleep(300);
    await go(W, `${base}/echo`, `${base}/echo`); await sleep(500);
    const cookies: string[] = []; for (const p of pages().filter((x) => x.url().startsWith(`${base}/echo`))) cookies.push(await p.locator("#c").innerText().catch(() => ""));
    check("Work gets its own cookie and never sees Personal's", cookies.some((c) => c.includes("sid=work1")) && cookies.every((c) => !c.includes("sid=personal1")), JSON.stringify(cookies));
    const wbm = await (async () => { await go(W, "nexora://bookmarks/", "nexora://bookmarks/"); await sleep(600); const ps = pages().filter((p) => p.url().startsWith("nexora://bookmarks/")); return ps; })();
    let leaked = false; for (const p of wbm) { const r = await invoke(p, "bookmarks:list", {}).catch(() => null); const st = r?.ok ? r.data.some((b: any) => b.url === `${base}/bm`) : false; if (st) { const who = await p.evaluate(() => document.body.innerText); if (/Profile: Work/.test(who)) leaked = true; } }
    check("Work profile doesn't see Personal's bookmarks", !leaked);
  }

  console.log("\nPrivate browsing");
  const histBefore = (await invoke(findPage("nexora://history/") ?? hist, "history:list", {}).catch(() => null))?.data?.entries?.length ?? beforeCount;
  await menu("new-private");
  const PV = await until(() => chromeFor((st) => st.private), 10000);
  check("private window opens with a Private indicator", !!PV && (await PV.locator("#profile").innerText()) === "Private" && (await PV.locator("#infobar").innerText()).includes("deleted when this window closes"));
  if (PV) {
    check("private window has no bookmark star", await PV.locator("#star").isHidden());
    await go(PV, `${base}/echo`, `${base}/echo`); await sleep(500);
    const cand = async () => { const out: string[] = []; for (const p of pages().filter((x) => x.url().startsWith(`${base}/echo`))) out.push(await p.locator("#c").innerText().catch(() => "")); return out; };
    let all = await cand();
    check("private window does NOT inherit Personal's or Work's cookies", all.length >= 1 && all.every((c) => !c.includes("sid=personal1") && !c.includes("sid=work1")) && all.some((c) => c.includes("(none)")), JSON.stringify(all));
    await go(PV, `${base}/set?v=private1`, `${base}/set`); await sleep(300);
    await go(PV, `${base}/private-only-marker`, `${base}/private-only-marker`); await sleep(400);
    await go(PV, `${base}/echo`, `${base}/echo`); await sleep(500);
    all = await cand();
    check("cookies work inside the private session", all.some((c) => c.includes("sid=private1")), JSON.stringify(all));
    const pn = await go(PV, "nexora://history/", "nexora://history/").then(() => sleep(500)).then(() => pages().filter((p) => p.url().startsWith("nexora://history/")));
    let privHist: any = null; for (const p of pn) { const r = await invoke(p, "history:list", {}).catch(() => null); if (r && !r.ok && /private/i.test(r.error ?? "")) privHist = r; }
    check("private window has no history API (it refuses)", !!privHist);
    const dlsP = await go(PV, `${base}/dl?n=private-file.txt`).then(() => sleep(1500));
    const tmpDir = path.join(os.tmpdir(), "nexora-private-downloads");
    const privFiles = fs.existsSync(tmpDir) ? fs.readdirSync(tmpDir).flatMap((d) => fs.readdirSync(path.join(tmpDir, d))) : [];
    const realDl = await mainEval("process.mainModule.require('electron').app.getPath('downloads')");
    check("private downloads go to a temp folder, not Downloads", privFiles.includes("private-file.txt") && !fs.existsSync(path.join(realDl, "private-file.txt")), JSON.stringify(privFiles));
    // Personal history must be unchanged
    const afterHist = await invoke(findPage("nexora://history/") ?? hist, "history:list", {}).catch(() => null);
    const hasMarker = pages().length > 0 && fs.readdirSync(path.join(ud, "nexora", "profiles")).some((d) => { const f = path.join(ud, "nexora", "profiles", d, "history.json"); return fs.existsSync(f) && fs.readFileSync(f, "utf8").includes("private-only-marker"); });
    check("private URLs never reach any profile's history file", !hasMarker && (afterHist?.data?.entries ?? []).every((e: any) => !/private-only-marker/.test(e.url)));
    void histBefore; void dlsP;
  }
  const privPartitionDirs = () => { const d = path.join(ud, "Partitions"); return fs.existsSync(d) ? fs.readdirSync(d).filter((x) => x.includes("private")) : []; };
  check("private session wrote nothing to the on-disk Partitions folder", privPartitionDirs().length === 0, JSON.stringify(privPartitionDirs()));
  await menu("close-private");
  await until(async () => !(await chromeFor((st) => st.private)), 8000);
  await sleep(1500);
  check("Close All Private Windows closes them", !(await chromeFor((st) => st.private)));
  const tmpDir2 = path.join(os.tmpdir(), "nexora-private-downloads");
  const leftover = fs.existsSync(tmpDir2) ? fs.readdirSync(tmpDir2).flatMap((d) => fs.readdirSync(path.join(tmpDir2, d))) : [];
  check("private temp downloads are deleted on close", !leftover.includes("private-file.txt"), JSON.stringify(leftover));
  await menu("new-private");
  const PV2 = await until(() => chromeFor((st) => st.private), 10000);
  if (PV2) {
    await go(PV2, `${base}/echo`, `${base}/echo`); await sleep(500);
    const got: string[] = []; for (const p of pages().filter((x) => x.url().startsWith(`${base}/echo`))) got.push(await p.locator("#c").innerText().catch(() => ""));
    check("a NEW private window starts clean (previous private cookie is gone)", got.length >= 1 && got.every((c) => !c.includes("sid=private1")), JSON.stringify(got));
  }
  await menu("close-private"); await sleep(1000);

  console.log("\nDownloads (normal)");
  dlDir = await mainEval("process.mainModule.require('electron').app.getPath('downloads')");
  fs.rmSync(path.join(dlDir, "nx-test.txt"), { force: true }); fs.rmSync(path.join(dlDir, "nx-test (1).txt"), { force: true }); fs.rmSync(path.join(dlDir, "private-file.txt"), { force: true });
  P = (await personal())!;
  await go(P, `${base}/dl`); await sleep(1800);
  const dlInfo = await (async () => { await go(P, "nexora://downloads/", "nexora://downloads/"); await sleep(500); const r = await invoke(findPage("nexora://downloads/")!, "downloads:list", {}); return JSON.stringify(r.data?.items?.map((d: any) => [d.filename, d.path, d.state])); })();
  check("download saves to the Downloads folder", fs.existsSync(path.join(dlDir, "nx-test.txt")) && fs.readFileSync(path.join(dlDir, "nx-test.txt"), "utf8") === "hello download", dlInfo + " dlDir=" + dlDir);
  await go(P, "nexora://downloads/", "nexora://downloads/"); await sleep(600);
  const dp = findPage("nexora://downloads/")!;
  const dls = await invoke(dp, "downloads:list", {});
  check("download manager lists it as completed", dls.ok && dls.data.items.some((d: any) => d.filename === "nx-test.txt" && d.state === "completed"));
  await go(P, `${base}/dl?n=..%2F..%2Fevil.txt`); await sleep(1500);
  check("path-traversal filenames are neutralised", !fs.existsSync(path.join(dlDir, "..", "evil.txt")) && !fs.existsSync(path.join(dlDir, "..", "..", "evil.txt")));

  console.log("\nPersistence across restart");
  await go(P, "nexora://settings/", "nexora://settings/"); await sleep(500);
  const rp = await invoke(findPage("nexora://settings/")!, "settings:updatePrefs", { restoreTabs: true });
  check("enable 'restore tabs'", rp.ok);
  await go(P, `${base}/restore-me`, `${base}/restore-me`); await sleep(1200);
  await quit(true);
  await launch();
  await sleep(1500);
  const last = (await until(() => chromePages()[0]))!;
  check("app reopens the last-used profile (Work) on launch", (await state(last)).profile?.name === "Work");
  await go(last, "nexora://settings/", "nexora://settings/"); await sleep(600);
  await invoke(findPage("nexora://settings/")!, "profiles:open", { id: "personal" });
  P = (await personal())!;
  await sleep(2500);
  s = await state(P);
  check("tabs restored after restart when the option is on", s.tabs.some((t) => t.url.startsWith(`${base}/restore-me`)), JSON.stringify(s.tabs.map((t) => t.url)));
  await go(P, `${base}/echo`, `${base}/echo`); await sleep(500);
  const back = (await Promise.all(pages().filter((x) => x.url().startsWith(`${base}/echo`)).map((p) => p.locator("#c").innerText().catch(() => "")))).join("|");
  check("Personal's login cookie survived the restart", back.includes("sid=personal1"), back);
  const histAfter = await (async () => { await go(P, "nexora://history/", "nexora://history/"); await sleep(600); return invoke(findPage("nexora://history/")!, "history:list", {}); })();
  check("history survived the restart", histAfter.ok && histAfter.data.entries.length > 0);
  const clr = await invoke(findPage("nexora://history/")!, "history:clear", { period: "all" });
  const hl2 = await invoke(findPage("nexora://history/")!, "history:list", {});
  check("history can be cleared", clr.ok && hl2.data.entries.length === 0);
  const off = await invoke(findPage("nexora://history/")!, "settings:updatePrefs", { recordHistory: false });
  await sleep(200);
  await go(P, `${base}/not-recorded`, `${base}/not-recorded`); await sleep(500);
  await go(P, "nexora://history/", "nexora://history/"); await sleep(600);
  const hl3 = await invoke(findPage("nexora://history/")!, "history:list", {});
  check("turning history off stops recording", off.ok && hl3.data.entries.every((e: any) => !/not-recorded/.test(e.url)) && hl3.data.enabled === false);
} catch (e) {
  console.log("\nCRASH:", e instanceof Error ? e.stack : e);
  failed.push("script crashed");
} finally {
  await quit(false).catch(() => undefined);
  server.close();
  fs.rmSync(ud, { recursive: true, force: true });
}
console.log(`\n${passed} passed, ${failed.length} failed`);
if (failed.length) { console.log("Failed:\n - " + failed.join("\n - ")); process.exit(1); }
process.exit(0);
