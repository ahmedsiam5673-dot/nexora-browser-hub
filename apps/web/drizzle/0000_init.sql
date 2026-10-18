CREATE TABLE "bookmark_folders" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"profile_id" text,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bookmarks" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"profile_id" text,
	"title" text NOT NULL,
	"url" text NOT NULL,
	"folder_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "browser_profiles" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"profile_name" text NOT NULL,
	"profile_type" text DEFAULT 'normal' NOT NULL,
	"profile_settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "browsing_history" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"profile_id" text NOT NULL,
	"title" text NOT NULL,
	"url" text NOT NULL,
	"visited_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_preferences" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"browser_experience" text DEFAULT 'nexora-web' NOT NULL,
	"theme" text DEFAULT 'system' NOT NULL,
	"default_search_engine" text DEFAULT 'google' NOT NULL,
	"homepage_url" text DEFAULT 'https://www.google.com/' NOT NULL,
	"privacy_preferences" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"onboarding_completed" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_preferences_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"authentication_provider" text NOT NULL,
	"provider_user_id" text NOT NULL,
	"display_name" text,
	"email" text NOT NULL,
	"avatar_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bookmark_folders" ADD CONSTRAINT "bookmark_folders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookmark_folders" ADD CONSTRAINT "bookmark_folders_profile_id_browser_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."browser_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookmarks" ADD CONSTRAINT "bookmarks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookmarks" ADD CONSTRAINT "bookmarks_profile_id_browser_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."browser_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookmarks" ADD CONSTRAINT "bookmarks_folder_id_bookmark_folders_id_fk" FOREIGN KEY ("folder_id") REFERENCES "public"."bookmark_folders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "browser_profiles" ADD CONSTRAINT "browser_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "browsing_history" ADD CONSTRAINT "browsing_history_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "browsing_history" ADD CONSTRAINT "browsing_history_profile_id_browser_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."browser_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "folders_user_profile_idx" ON "bookmark_folders" USING btree ("user_id","profile_id");--> statement-breakpoint
CREATE INDEX "bookmarks_user_profile_idx" ON "bookmarks" USING btree ("user_id","profile_id");--> statement-breakpoint
CREATE INDEX "bookmarks_user_created_idx" ON "bookmarks" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "profiles_user_name" ON "browser_profiles" USING btree ("user_id","profile_name");--> statement-breakpoint
CREATE INDEX "profiles_user_idx" ON "browser_profiles" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "history_user_profile_visited_idx" ON "browsing_history" USING btree ("user_id","profile_id","visited_at");--> statement-breakpoint
CREATE UNIQUE INDEX "users_provider_uid" ON "users" USING btree ("authentication_provider","provider_user_id");--> statement-breakpoint
CREATE INDEX "users_email_idx" ON "users" USING btree ("email");