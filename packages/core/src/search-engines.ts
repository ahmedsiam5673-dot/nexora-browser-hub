export type SearchEngineId = "google" | "bing" | "duckduckgo" | "brave" | "ecosia";

export interface SearchEngine {
  id: SearchEngineId;
  name: string;
  /** `%s` is replaced with the URL-encoded query. */
  template: string;
  homepage: string;
}

export const SEARCH_ENGINES: Record<SearchEngineId, SearchEngine> = {
  google: { id: "google", name: "Google", template: "https://www.google.com/search?q=%s", homepage: "https://www.google.com/" },
  bing: { id: "bing", name: "Bing", template: "https://www.bing.com/search?q=%s", homepage: "https://www.bing.com/" },
  duckduckgo: { id: "duckduckgo", name: "DuckDuckGo", template: "https://duckduckgo.com/?q=%s", homepage: "https://duckduckgo.com/" },
  brave: { id: "brave", name: "Brave Search", template: "https://search.brave.com/search?q=%s", homepage: "https://search.brave.com/" },
  ecosia: { id: "ecosia", name: "Ecosia", template: "https://www.ecosia.org/search?q=%s", homepage: "https://www.ecosia.org/" },
};

export const DEFAULT_SEARCH_ENGINE: SearchEngineId = "google";

export function isSearchEngineId(v: unknown): v is SearchEngineId {
  return typeof v === "string" && Object.prototype.hasOwnProperty.call(SEARCH_ENGINES, v);
}

export function buildSearchUrl(engine: SearchEngineId, query: string): string {
  return SEARCH_ENGINES[engine].template.replace("%s", encodeURIComponent(query.trim()));
}
