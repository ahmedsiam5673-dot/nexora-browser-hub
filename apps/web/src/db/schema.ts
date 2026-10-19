import { relations, sql } from "drizzle-orm";
import {
  boolean, index, jsonb, pgTable, text, timestamp, uniqueIndex,
} from "drizzle-orm/pg-core";

const id = () => text("id").primaryKey().$defaultFn(() => crypto.randomUUID());
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const users = pgTable(
  "users",
  {
    id: id(),
    authenticationProvider: text("authentication_provider").notNull(),
    providerUserId: text("provider_user_id").notNull(),
    displayName: text("display_name"),
    email: text("email").notNull(),
    avatarUrl: text("avatar_url"),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("users_provider_uid").on(t.authenticationProvider, t.providerUserId),
    index("users_email_idx").on(t.email),
  ],
);

export const userPreferences = pgTable("user_preferences", {
  id: id(),
  userId: text("user_id").notNull().unique().references(() => users.id, { onDelete: "cascade" }),
  browserExperience: text("browser_experience").notNull().default("nexora-web"),
  theme: text("theme").notNull().default("system"),
  defaultSearchEngine: text("default_search_engine").notNull().default("google"),
  homepageUrl: text("homepage_url").notNull().default("https://www.google.com/"),
  privacyPreferences: jsonb("privacy_preferences").notNull().default(sql`'{}'::jsonb`),
  onboardingCompleted: boolean("onboarding_completed").notNull().default(false),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const browserProfiles = pgTable(
  "browser_profiles",
  {
    id: id(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    profileName: text("profile_name").notNull(),
    /** Always "normal". Private sessions are temporary and are never stored server-side. */
    profileType: text("profile_type").notNull().default("normal"),
    profileSettings: jsonb("profile_settings").notNull().default(sql`'{}'::jsonb`),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("profiles_user_name").on(t.userId, t.profileName),
    index("profiles_user_idx").on(t.userId),
  ],
);

export const bookmarkFolders = pgTable(
  "bookmark_folders",
  {
    id: id(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    profileId: text("profile_id").references(() => browserProfiles.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("folders_user_profile_idx").on(t.userId, t.profileId)],
);

export const bookmarks = pgTable(
  "bookmarks",
  {
    id: id(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    profileId: text("profile_id").references(() => browserProfiles.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    url: text("url").notNull(),
    folderId: text("folder_id").references(() => bookmarkFolders.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [
    index("bookmarks_user_profile_idx").on(t.userId, t.profileId),
    index("bookmarks_user_created_idx").on(t.userId, t.createdAt),
  ],
);

/** Normal-mode history only (written by the desktop app). Private navigation is never stored. */
export const browsingHistory = pgTable(
  "browsing_history",
  {
    id: id(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    profileId: text("profile_id").notNull().references(() => browserProfiles.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    url: text("url").notNull(),
    visitedAt: timestamp("visited_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("history_user_profile_visited_idx").on(t.userId, t.profileId, t.visitedAt)],
);

export const usersRelations = relations(users, ({ one, many }) => ({
  preferences: one(userPreferences),
  profiles: many(browserProfiles),
  bookmarks: many(bookmarks),
}));
