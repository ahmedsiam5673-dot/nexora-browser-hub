export interface PrivacyPreferences {
  /** Record normal-mode browsing history (desktop). */
  recordHistory: boolean;
  /** Restore previous tabs after restart (desktop, normal profiles only). */
  restoreTabs: boolean;
  /** Ask where to save each download (desktop). */
  askDownloadLocation: boolean;
  /** Send "Do Not Track"-style Global Privacy Control signal (desktop). */
  sendGlobalPrivacyControl: boolean;
}

export const DEFAULT_PRIVACY: PrivacyPreferences = {
  recordHistory: true,
  restoreTabs: false,
  askDownloadLocation: false,
  sendGlobalPrivacyControl: true,
};

export function parsePrivacy(v: unknown): PrivacyPreferences {
  const o = (typeof v === "object" && v !== null ? v : {}) as Record<string, unknown>;
  const pick = (k: keyof PrivacyPreferences) => (typeof o[k] === "boolean" ? (o[k] as boolean) : DEFAULT_PRIVACY[k]);
  return {
    recordHistory: pick("recordHistory"),
    restoreTabs: pick("restoreTabs"),
    askDownloadLocation: pick("askDownloadLocation"),
    sendGlobalPrivacyControl: pick("sendGlobalPrivacyControl"),
  };
}

export const THEMES = ["system", "light", "dark"] as const;
export type Theme = (typeof THEMES)[number];
export function isTheme(v: unknown): v is Theme {
  return typeof v === "string" && (THEMES as readonly string[]).includes(v);
}

export const QUICK_LINKS = [
  { name: "Gmail", url: "https://mail.google.com/" },
  { name: "Google Search", url: "https://www.google.com/" },
  { name: "Google Drive", url: "https://drive.google.com/" },
  { name: "YouTube", url: "https://www.youtube.com/" },
  { name: "Google Maps", url: "https://maps.google.com/" },
  { name: "Wikipedia", url: "https://www.wikipedia.org/" },
] as const;
