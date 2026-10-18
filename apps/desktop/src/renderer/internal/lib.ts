export interface InternalBridge {
  invoke<T = unknown>(method: string, args?: unknown): Promise<{ ok: boolean; data?: T; error?: string }>;
  onEvent(cb: (e: { topic: string }) => void): void;
}
export const bridge = (window as unknown as { nexoraInternal: InternalBridge }).nexoraInternal;

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, props: Record<string, unknown> = {}, ...kids: (Node | string | null | undefined)[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === "class") el.className = String(v);
    else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
    else if (k in el && k !== "list") (el as unknown as Record<string, unknown>)[k] = v;
    else el.setAttribute(k, String(v));
  }
  for (const kid of kids) if (kid !== null && kid !== undefined) el.append(kid);
  return el;
}

export async function init(): Promise<{ theme: "light" | "dark"; private: boolean; profile: { id: string; name: string } | null; versions: { app: string; electron: string; chromium: string } }> {
  const r = await bridge.invoke<{ theme: "light" | "dark"; private: boolean; profile: { id: string; name: string } | null; versions: { app: string; electron: string; chromium: string } }>("page:init");
  const d = r.data ?? { theme: "light" as const, private: false, profile: null, versions: { app: "?", electron: "?", chromium: "?" } };
  document.documentElement.dataset.theme = d.theme;
  document.documentElement.dataset.private = String(d.private);
  return d;
}

export const root = () => document.getElementById("root") as HTMLElement;

export function banner(kind: "err" | "ok", text: string): HTMLElement {
  return h("p", { class: `msg ${kind}`, role: kind === "err" ? "alert" : "status" }, text);
}

export function skeleton(n = 4): HTMLElement[] { return Array.from({ length: n }, () => h("div", { class: "skel", "aria-hidden": "true" })); }

export function fmtBytes(n: number): string {
  if (!n || n < 0) return "—";
  const u = ["B", "KB", "MB", "GB", "TB"]; let i = 0, v = n;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)} ${u[i]}`;
}
export const fmtTime = (ts: number) => new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
export const fmtDay = (ts: number) => new Date(ts).toLocaleDateString([], { weekday: "long", year: "numeric", month: "long", day: "numeric" });

/** Subscribe to main-process change notifications for a topic, with a tiny debounce. */
export function onChange(topic: string, fn: () => void) {
  let t: ReturnType<typeof setTimeout> | undefined;
  bridge.onEvent((e) => { if (e.topic === topic) { clearTimeout(t); t = setTimeout(fn, 80); } });
}

/** Native <dialog>-based confirmation (focus trap + Esc handled by the platform). */
export function confirmDialog(title: string, body: string, confirmLabel: string): Promise<boolean> {
  return new Promise((resolve) => {
    const dlg = h("dialog", { "aria-labelledby": "dlg-title" },
      h("h2", { id: "dlg-title" }, title), h("p", { class: "muted" }, body),
      h("div", { class: "row", style: "justify-content:flex-end;margin-top:16px" },
        h("button", { onClick: () => dlg.close("no") }, "Cancel"),
        h("button", { class: "danger", onClick: () => dlg.close("yes") }, confirmLabel)));
    dlg.addEventListener("close", () => { resolve(dlg.returnValue === "yes"); dlg.remove(); });
    document.body.append(dlg);
    dlg.showModal();
  });
}
