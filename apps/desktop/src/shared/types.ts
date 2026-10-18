import type { SearchEngineId, PrivacyPreferences } from "@nexora/core";

export interface ProfileSettings {
  homepage: string;
  searchEngine: SearchEngineId;
  theme: "system" | "light" | "dark";
}

export interface ProfileMeta {
  id: string;
  name: string;
  createdAt: number;
  settings: ProfileSettings;
}

export interface BookmarkFolder { id: string; name: string; createdAt: number }
export interface Bookmark { id: string; title: string; url: string; folderId: string | null; createdAt: number }
export interface HistoryEntry { id: string; title: string; url: string; visitedAt: number }

export type DownloadState = "progressing" | "completed" | "cancelled" | "interrupted";
export interface DownloadRecord {
  id: string;
  filename: string;
  /** Hostname only; full URLs can contain tokens. */
  source: string;
  path: string;
  state: DownloadState;
  receivedBytes: number;
  totalBytes: number;
  startedAt: number;
  error?: string;
  private: boolean;
  /** Private downloads live in a temp folder and are deleted on close unless kept. */
  kept?: boolean;
}

export type GlobalPrefs = PrivacyPreferences;

export interface TabState {
  id: number;
  title: string;
  url: string;
  favicon: string | null;
  loading: boolean;
  pinned: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  internal: boolean;
  active: boolean;
}

export interface WindowState {
  tabs: TabState[];
  activeId: number;
  private: boolean;
  profile: { id: string; name: string } | null;
  bookmarksBar: { id: string; title: string; url: string }[];
  currentBookmarked: boolean;
  theme: "light" | "dark";
  /** Text the omnibox should show for the active tab (empty for internal pages). */
  address: string;
}
