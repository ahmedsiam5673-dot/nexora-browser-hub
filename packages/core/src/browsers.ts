/**
 * Honest browser catalog. A website cannot switch its own engine or launch native
 * browsers, so every entry declares exactly what choosing it does.
 *
 *  - "embedded"  : only inside the NEXORA desktop app (real Chromium via Electron)
 *  - "web"       : stays in the current tab of the user's existing browser
 *  - "external"  : a separate third-party browser; we only link to its official download page
 *
 * Brand names are used nominatively to identify the product. No third-party logos are
 * bundled: cards use a neutral monogram until trademark permission/brand assets are obtained.
 */
export type BrowserMode = "embedded" | "web" | "external";

export interface BrowserOption {
  id: string;
  name: string;
  mode: BrowserMode;
  description: string;
  engine: "Chromium" | "Gecko" | "WebKit" | "Your current browser";
  downloadUrl?: string;
  platforms: ReadonlyArray<"windows" | "macos" | "linux" | "ios" | "android" | "any">;
  /** Plain-language limitation shown on the card. */
  limitation: string;
}

export const BROWSER_OPTIONS: readonly BrowserOption[] = [
  {
    id: "nexora-desktop",
    name: "NEXORA Desktop Browser",
    mode: "embedded",
    description: "Real tabs, isolated profiles, private sessions and downloads, powered by Chromium.",
    engine: "Chromium",
    platforms: ["windows", "macos", "linux"],
    limitation: "Desktop app only. Install and open it on your computer; it can't run inside a web page.",
  },
  {
    id: "nexora-web",
    name: "NEXORA Web Mode",
    mode: "web",
    description: "Use the dashboard, search, bookmarks and quick links right here in your current browser.",
    engine: "Your current browser",
    platforms: ["any"],
    limitation: "Sites open in your browser's own tabs. Many sites block embedding, so there is no in-page browsing.",
  },
  {
    id: "chrome",
    name: "Google Chrome",
    mode: "external",
    description: "External browser. We link to the official download; we cannot launch or control it.",
    engine: "Chromium",
    downloadUrl: "https://www.google.com/chrome/",
    platforms: ["windows", "macos", "linux", "ios", "android"],
    limitation: "Separate app. Your NEXORA preferences are not applied inside it.",
  },
  {
    id: "firefox",
    name: "Mozilla Firefox",
    mode: "external",
    description: "External browser using the Gecko engine. NEXORA Desktop does not embed Firefox.",
    engine: "Gecko",
    downloadUrl: "https://www.mozilla.org/firefox/new/",
    platforms: ["windows", "macos", "linux", "ios", "android"],
    limitation: "Separate app. Native Firefox integration is not available; the desktop app uses Chromium.",
  },
  {
    id: "edge",
    name: "Microsoft Edge",
    mode: "external",
    description: "External browser based on Chromium.",
    engine: "Chromium",
    downloadUrl: "https://www.microsoft.com/edge/download",
    platforms: ["windows", "macos", "linux", "ios", "android"],
    limitation: "Separate app. Your NEXORA preferences are not applied inside it.",
  },
  {
    id: "brave",
    name: "Brave Browser",
    mode: "external",
    description: "External privacy-focused browser based on Chromium.",
    engine: "Chromium",
    downloadUrl: "https://brave.com/download/",
    platforms: ["windows", "macos", "linux", "ios", "android"],
    limitation: "Separate app. Your NEXORA preferences are not applied inside it.",
  },
  {
    id: "opera",
    name: "Opera",
    mode: "external",
    description: "External browser based on Chromium.",
    engine: "Chromium",
    downloadUrl: "https://www.opera.com/download",
    platforms: ["windows", "macos", "linux", "ios", "android"],
    limitation: "Separate app. Your NEXORA preferences are not applied inside it.",
  },
  {
    id: "safari",
    name: "Safari",
    mode: "external",
    description: "Apple's built-in browser (WebKit). Available only on Apple devices.",
    engine: "WebKit",
    platforms: ["macos", "ios"],
    limitation: "Already installed on Apple devices; there is no download for other systems. Preferences are not applied inside it.",
  },
] as const;

export type Platform = "windows" | "macos" | "linux" | "ios" | "android" | "unknown";

export function detectPlatform(userAgent: string): Platform {
  const ua = userAgent.toLowerCase();
  if (/iphone|ipad|ipod/.test(ua)) return "ios";
  if (/android/.test(ua)) return "android";
  if (/windows/.test(ua)) return "windows";
  if (/mac os x|macintosh/.test(ua)) return "macos";
  if (/linux|x11|cros/.test(ua)) return "linux";
  return "unknown";
}

export type Availability =
  | { status: "available"; label: string }
  | { status: "unavailable"; label: string };

export function availabilityFor(option: BrowserOption, platform: Platform): Availability {
  if (option.platforms.includes("any")) return { status: "available", label: "Available" };
  if (platform === "unknown") return { status: "available", label: "Check your device" };
  if (option.platforms.includes(platform)) {
    if (option.id === "nexora-desktop") return { status: "available", label: "Desktop app (build from source)" };
    return { status: "available", label: "Available on your device" };
  }
  return { status: "unavailable", label: "Not available on your device" };
}

export function getBrowserOption(id: string): BrowserOption | undefined {
  return BROWSER_OPTIONS.find((b) => b.id === id);
}

export function isBrowserOptionId(id: unknown): id is string {
  return typeof id === "string" && BROWSER_OPTIONS.some((b) => b.id === id);
}
