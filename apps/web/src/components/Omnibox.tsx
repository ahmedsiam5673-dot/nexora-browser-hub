"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { resolveOmnibox, SEARCH_ENGINES, type SearchEngineId } from "@nexora/core";

const RECENT_KEY = "nexora.recent.v1";
const MAX_RECENT = 8;

interface Recent { label: string; url: string }

function loadRecent(): Recent[] {
  try {
    const v = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]") as Recent[];
    return Array.isArray(v) ? v.filter((r) => typeof r?.url === "string" && typeof r?.label === "string").slice(0, MAX_RECENT) : [];
  } catch { return []; }
}

function openInNewTab(url: string) {
  // Anchor click keeps the user gesture and (unlike window.open + noopener) reliably opens the tab.
  const a = document.createElement("a");
  a.href = url; a.target = "_blank"; a.rel = "noopener noreferrer";
  document.body.appendChild(a); a.click(); a.remove();
}

/**
 * Combined address + search bar for the web dashboard.
 * Honest scope: results open in a new tab of the user's own browser. No proxying, no iframes.
 * mode="private": nothing is written to localStorage or the server; the in-memory list clears on exit.
 */
export function Omnibox({ engine, homepage, mode = "normal" }: { engine: SearchEngineId; homepage: string; mode?: "normal" | "private" }) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [recent, setRecent] = useState<Recent[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const priv = mode === "private";

  useEffect(() => { if (!priv) setRecent(loadRecent()); }, [priv]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const typing = t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable);
      if (e.key === "/" && !typing && !e.metaKey && !e.ctrlKey) { e.preventDefault(); inputRef.current?.focus(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Private workspace: drop temporary state when the page is hidden or closed.
  useEffect(() => {
    if (!priv) return;
    const clear = () => { setRecent([]); setValue(""); };
    window.addEventListener("pagehide", clear);
    return () => { window.removeEventListener("pagehide", clear); clear(); };
  }, [priv]);

  const go = useCallback((text: string) => {
    const r = resolveOmnibox(text, engine);
    if (r.kind === "invalid") {
      setError(r.reason === "empty" ? "Type a web address or something to search for." : "Only http and https addresses can be opened. Other kinds of links are blocked for your safety.");
      return;
    }
    setError(null);
    openInNewTab(r.url);
    const item = { label: r.kind === "search" ? `Search: ${r.query}` : new URL(r.url).hostname, url: r.url };
    setRecent((prev) => {
      const next = [item, ...prev.filter((p) => p.url !== item.url)].slice(0, MAX_RECENT);
      if (!priv) { try { localStorage.setItem(RECENT_KEY, JSON.stringify(next)); } catch { /* storage unavailable */ } }
      return next;
    });
  }, [engine, priv]);

  const clearRecent = () => {
    setRecent([]);
    try { localStorage.removeItem(RECENT_KEY); } catch { /* ignore */ }
  };

  return (
    <div className="space-y-3">
      <form
        role="search"
        onSubmit={(e) => { e.preventDefault(); go(value); }}
        className="flex items-center gap-2 rounded-2xl border border-line bg-surface p-2 shadow-sm focus-within:border-brand"
      >
        <label htmlFor={`omnibox-${mode}`} className="sr-only">Search {SEARCH_ENGINES[engine].name} or enter a web address</label>
        <input
          id={`omnibox-${mode}`} ref={inputRef} value={value} onChange={(e) => { setValue(e.target.value); if (error) setError(null); }}
          onKeyDown={(e) => { if (e.key === "Escape") { setValue(""); setError(null); } }}
          placeholder={`Search ${SEARCH_ENGINES[engine].name} or enter a web address   ( / to focus )`}
          autoComplete="off" autoCapitalize="off" spellCheck={false} inputMode="url" enterKeyHint="go"
          aria-invalid={error ? true : undefined} aria-describedby={error ? "omnibox-error" : undefined}
          className="min-h-11 min-w-0 flex-1 bg-transparent px-3 text-base outline-none placeholder:text-muted"
        />
        {value && <button type="button" className="btn-ghost min-h-9 px-3" onClick={() => { setValue(""); setError(null); inputRef.current?.focus(); }} aria-label="Clear">✕</button>}
        <button type="button" className="btn-ghost hidden min-h-9 px-3 sm:inline-flex" onClick={() => go(homepage)}>Home</button>
        <button type="submit" className="btn-primary min-h-9">Go</button>
      </form>
      {error && <p id="omnibox-error" role="alert" className="rounded-xl bg-danger-bg px-3 py-2 text-sm text-danger">{error}</p>}
      <p className="text-xs text-muted">Opens in a new tab of this browser. Web pages can&apos;t offer their own back, forward or reload; use your browser&apos;s. Suggestions are off, so nothing you type is sent anywhere until you press Go.</p>

      {recent.length > 0 && (
        <section aria-label={priv ? "This private session" : "Recent on this device"} className="space-y-1">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">{priv ? "This session (cleared when you exit)" : "Recent on this device"}</h2>
            <button type="button" onClick={clearRecent} className="text-xs text-muted underline hover:text-ink">Clear</button>
          </div>
          <ul className="flex flex-wrap gap-2">
            {recent.map((r) => (
              <li key={r.url}><button type="button" className="badge max-w-56 truncate hover:text-ink" onClick={() => go(r.url)} title={r.url}>{r.label}</button></li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
