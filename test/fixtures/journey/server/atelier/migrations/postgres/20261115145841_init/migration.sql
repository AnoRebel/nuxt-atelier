CREATE TABLE "atelier_singletons" (
	"name" varchar(64) PRIMARY KEY,
	"data" jsonb NOT NULL,
	"_version" integer NOT NULL,
	"_updated_at" varchar(24) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "atelier_p_singletons" (
	"name" varchar(64) PRIMARY KEY,
	"data" jsonb NOT NULL,
	"_version" integer NOT NULL,
	"_updated_at" varchar(24) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "atelier_tokens" (
	"_id" varchar(36) PRIMARY KEY,
	"name" varchar(255) NOT NULL,
	"hash" varchar(64) NOT NULL,
	"permissions" jsonb NOT NULL,
	"expires_at" varchar(24),
	"created_by" varchar(36) NOT NULL,
	"_created_at" varchar(24) NOT NULL,
	"last_used_at" varchar(24),
	"revoked_at" varchar(24)
);
--> statement-breakpoint
CREATE TABLE "atelier_rate_limits" (
	"key" varchar(64) PRIMARY KEY,
	"count" integer NOT NULL,
	"reset_at" varchar(24) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "atelier_roles" (
	"name" varchar(64) PRIMARY KEY,
	"definition" jsonb NOT NULL,
	"_updated_at" varchar(24) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "atelier_settings" (
	"key" varchar(64) PRIMARY KEY,
	"value" jsonb NOT NULL,
	"_updated_at" varchar(24) NOT NULL,
	"_updated_by" varchar(36)
);
--> statement-breakpoint
CREATE TABLE "atelier_locks" (
	"key" varchar(160) PRIMARY KEY,
	"type" varchar(64) NOT NULL,
	"entry" varchar(64) NOT NULL,
	"user_id" varchar(36) NOT NULL,
	"acquired_at" varchar(24) NOT NULL,
	"expires_at" varchar(24) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "atelier_presence" (
	"key" varchar(200) PRIMARY KEY,
	"type" varchar(64) NOT NULL,
	"entry" varchar(64) NOT NULL,
	"user_id" varchar(36) NOT NULL,
	"seen_at" varchar(24) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "atelier_comments" (
	"_id" varchar(36) PRIMARY KEY,
	"type" varchar(64) NOT NULL,
	"entry" varchar(64) NOT NULL,
	"block" varchar(36),
	"thread" varchar(36),
	"author" varchar(36) NOT NULL,
	"body" text NOT NULL,
	"mentions" jsonb NOT NULL,
	"resolved_at" varchar(24),
	"resolved_by" varchar(36),
	"_created_at" varchar(24) NOT NULL,
	"_updated_at" varchar(24) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "atelier_notifications" (
	"_id" varchar(36) PRIMARY KEY,
	"user_id" varchar(36) NOT NULL,
	"kind" varchar(32) NOT NULL,
	"data" jsonb NOT NULL,
	"read_at" varchar(24),
	"_created_at" varchar(24) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "atelier_form_submissions" (
	"_id" varchar(36) PRIMARY KEY,
	"form" varchar(36) NOT NULL,
	"form_version" integer NOT NULL,
	"locale" varchar(35) NOT NULL,
	"data" jsonb NOT NULL,
	"emails" varchar(1024) NOT NULL,
	"_created_at" varchar(24) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "atelier_passkeys" (
	"_id" varchar(255) PRIMARY KEY,
	"user_id" varchar(36) NOT NULL,
	"public_key" text NOT NULL,
	"counter" bigint NOT NULL,
	"transports" jsonb,
	"name" varchar(255),
	"_created_at" varchar(24) NOT NULL,
	"last_used_at" varchar(24)
);
--> statement-breakpoint
CREATE TABLE "atelier_relations" (
	"source" varchar(64),
	"source_id" varchar(64),
	"field" varchar(255),
	"position" integer,
	"target" varchar(64) NOT NULL,
	"target_id" varchar(36) NOT NULL,
	CONSTRAINT "atelier_relations_pkey" PRIMARY KEY("source","source_id","field","position")
);
--> statement-breakpoint
CREATE TABLE "atelier_jobs" (
	"_id" varchar(36) PRIMARY KEY,
	"name" varchar(64) NOT NULL,
	"key" varchar(255),
	"payload" jsonb NOT NULL,
	"status" varchar(16) NOT NULL,
	"run_at" varchar(24) NOT NULL,
	"attempts" integer NOT NULL,
	"max_attempts" integer NOT NULL,
	"locked_until" varchar(24),
	"last_error" text,
	"_created_at" varchar(24) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "atelier_media" (
	"_id" varchar(36) PRIMARY KEY,
	"key" varchar(255) NOT NULL,
	"filename" varchar(255) NOT NULL,
	"mime" varchar(127) NOT NULL,
	"size" bigint NOT NULL,
	"width" integer,
	"height" integer,
	"title" text,
	"alt" jsonb,
	"caption" text,
	"credits" text,
	"folder" varchar(255) NOT NULL,
	"tags" jsonb NOT NULL,
	"focal" jsonb,
	"private" boolean NOT NULL,
	"_created_by" varchar(36),
	"_created_at" varchar(24) NOT NULL,
	"_updated_at" varchar(24) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "atelier_media_uploads" (
	"_id" varchar(36) PRIMARY KEY,
	"filename" varchar(255) NOT NULL,
	"folder" varchar(255) NOT NULL,
	"private" boolean NOT NULL,
	"size" bigint NOT NULL,
	"received" bigint NOT NULL,
	"parts" jsonb NOT NULL,
	"created_by" varchar(36),
	"_created_at" varchar(24) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "atelier_webhooks" (
	"_id" varchar(36) PRIMARY KEY,
	"url" text NOT NULL,
	"events" jsonb NOT NULL,
	"types" jsonb,
	"secret" text NOT NULL,
	"active" boolean NOT NULL,
	"created_by" varchar(36) NOT NULL,
	"_created_at" varchar(24) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "atelier_webhook_deliveries" (
	"_id" varchar(36) PRIMARY KEY,
	"webhook_id" varchar(36) NOT NULL,
	"message_id" varchar(64) NOT NULL,
	"event" varchar(64) NOT NULL,
	"attempt" integer NOT NULL,
	"status" integer,
	"error" text,
	"duration_ms" integer NOT NULL,
	"at" varchar(24) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "atelier_redirects" (
	"_id" varchar(36) PRIMARY KEY,
	"source" varchar(255) NOT NULL,
	"target" text NOT NULL,
	"status" integer NOT NULL,
	"auto" boolean NOT NULL,
	"_created_at" varchar(24) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "atelier_c_pages" (
	"_id" varchar(36) PRIMARY KEY,
	"_version" integer NOT NULL,
	"_created_at" varchar(24) NOT NULL,
	"_updated_at" varchar(24) NOT NULL,
	"_created_by" varchar(36),
	"_locale" varchar(35) DEFAULT 'en' NOT NULL,
	"_group" varchar(36),
	"title" text,
	"slug" text,
	"seo" jsonb,
	"content" jsonb
);
--> statement-breakpoint
CREATE TABLE "atelier_p_pages" (
	"_id" varchar(36) PRIMARY KEY,
	"_version" integer NOT NULL,
	"_created_at" varchar(24) NOT NULL,
	"_updated_at" varchar(24) NOT NULL,
	"_created_by" varchar(36),
	"_locale" varchar(35) DEFAULT 'en' NOT NULL,
	"_group" varchar(36),
	"title" text,
	"slug" text,
	"seo" jsonb,
	"content" jsonb
);
--> statement-breakpoint
CREATE TABLE "atelier_c_atelier_forms" (
	"_id" varchar(36) PRIMARY KEY,
	"_version" integer NOT NULL,
	"_created_at" varchar(24) NOT NULL,
	"_updated_at" varchar(24) NOT NULL,
	"_created_by" varchar(36),
	"title" text,
	"fields" jsonb,
	"submitLabel" text,
	"success" jsonb,
	"notify" jsonb,
	"confirmation" jsonb,
	"retentionDays" bigint
);
--> statement-breakpoint
CREATE TABLE "atelier_p_atelier_forms" (
	"_id" varchar(36) PRIMARY KEY,
	"_version" integer NOT NULL,
	"_created_at" varchar(24) NOT NULL,
	"_updated_at" varchar(24) NOT NULL,
	"_created_by" varchar(36),
	"title" text,
	"fields" jsonb,
	"submitLabel" text,
	"success" jsonb,
	"notify" jsonb,
	"confirmation" jsonb,
	"retentionDays" bigint
);
--> statement-breakpoint
CREATE TABLE "atelier_p_relations" (
	"source" varchar(64),
	"source_id" varchar(64),
	"field" varchar(255),
	"position" integer,
	"target" varchar(64) NOT NULL,
	"target_id" varchar(36) NOT NULL,
	CONSTRAINT "atelier_p_relations_pkey" PRIMARY KEY("source","source_id","field","position")
);
--> statement-breakpoint
CREATE TABLE "atelier_c_atelier_templates" (
	"_id" varchar(36) PRIMARY KEY,
	"_version" integer NOT NULL,
	"_created_at" varchar(24) NOT NULL,
	"_updated_at" varchar(24) NOT NULL,
	"_created_by" varchar(36),
	"title" text,
	"description" text,
	"type" text,
	"data" jsonb
);
--> statement-breakpoint
CREATE TABLE "atelier_p_atelier_templates" (
	"_id" varchar(36) PRIMARY KEY,
	"_version" integer NOT NULL,
	"_created_at" varchar(24) NOT NULL,
	"_updated_at" varchar(24) NOT NULL,
	"_created_by" varchar(36),
	"title" text,
	"description" text,
	"type" text,
	"data" jsonb
);
--> statement-breakpoint
CREATE TABLE "atelier_c_atelier_patterns" (
	"_id" varchar(36) PRIMARY KEY,
	"_version" integer NOT NULL,
	"_created_at" varchar(24) NOT NULL,
	"_updated_at" varchar(24) NOT NULL,
	"_created_by" varchar(36),
	"title" text,
	"description" text,
	"blocks" jsonb
);
--> statement-breakpoint
CREATE TABLE "atelier_p_atelier_patterns" (
	"_id" varchar(36) PRIMARY KEY,
	"_version" integer NOT NULL,
	"_created_at" varchar(24) NOT NULL,
	"_updated_at" varchar(24) NOT NULL,
	"_created_by" varchar(36),
	"title" text,
	"description" text,
	"blocks" jsonb
);
--> statement-breakpoint
CREATE TABLE "atelier_c_atelier_shared_blocks" (
	"_id" varchar(36) PRIMARY KEY,
	"_version" integer NOT NULL,
	"_created_at" varchar(24) NOT NULL,
	"_updated_at" varchar(24) NOT NULL,
	"_created_by" varchar(36),
	"title" text,
	"block" jsonb
);
--> statement-breakpoint
CREATE TABLE "atelier_p_atelier_shared_blocks" (
	"_id" varchar(36) PRIMARY KEY,
	"_version" integer NOT NULL,
	"_created_at" varchar(24) NOT NULL,
	"_updated_at" varchar(24) NOT NULL,
	"_created_by" varchar(36),
	"title" text,
	"block" jsonb
);
--> statement-breakpoint
CREATE TABLE "atelier_routes" (
	"path" varchar(255),
	"locale" varchar(35),
	"source" varchar(64) NOT NULL,
	"source_id" varchar(64) NOT NULL,
	CONSTRAINT "atelier_routes_pkey" PRIMARY KEY("path","locale")
);
--> statement-breakpoint
CREATE TABLE "atelier_p_routes" (
	"path" varchar(255),
	"locale" varchar(35),
	"source" varchar(64) NOT NULL,
	"source_id" varchar(64) NOT NULL,
	CONSTRAINT "atelier_p_routes_pkey" PRIMARY KEY("path","locale")
);
--> statement-breakpoint
CREATE TABLE "atelier_revisions" (
	"_id" varchar(36) PRIMARY KEY,
	"source" varchar(64) NOT NULL,
	"source_id" varchar(64) NOT NULL,
	"_version" integer NOT NULL,
	"data" jsonb NOT NULL,
	"_created_at" varchar(24) NOT NULL,
	"author_id" varchar(36),
	"published" boolean NOT NULL
);
--> statement-breakpoint
CREATE TABLE "atelier_users" (
	"_id" varchar(36) PRIMARY KEY,
	"email" varchar(255) NOT NULL,
	"name" varchar(255),
	"role" varchar(64) NOT NULL,
	"password_hash" varchar(255),
	"_created_at" varchar(24) NOT NULL,
	"_updated_at" varchar(24) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "atelier_sessions" (
	"_id" varchar(64) PRIMARY KEY,
	"user_id" varchar(36) NOT NULL,
	"method" varchar(16) NOT NULL,
	"_created_at" varchar(24) NOT NULL,
	"expires_at" varchar(24) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "atelier_audit" (
	"_id" varchar(36) PRIMARY KEY,
	"at" varchar(24) NOT NULL,
	"action" varchar(64) NOT NULL,
	"actor_id" varchar(36),
	"target_type" varchar(64),
	"target_id" varchar(255),
	"ip" varchar(64),
	"details" jsonb
);
--> statement-breakpoint
CREATE UNIQUE INDEX "atelier_tokens_hash_idx" ON "atelier_tokens" ("hash");--> statement-breakpoint
CREATE INDEX "atelier_presence_entry_idx" ON "atelier_presence" ("type","entry");--> statement-breakpoint
CREATE INDEX "atelier_comments_entry_idx" ON "atelier_comments" ("type","entry");--> statement-breakpoint
CREATE INDEX "atelier_comments_thread_idx" ON "atelier_comments" ("thread");--> statement-breakpoint
CREATE INDEX "atelier_notifications_user_idx" ON "atelier_notifications" ("user_id","_created_at");--> statement-breakpoint
CREATE INDEX "atelier_form_submissions_form_idx" ON "atelier_form_submissions" ("form","_created_at");--> statement-breakpoint
CREATE INDEX "atelier_passkeys_user_idx" ON "atelier_passkeys" ("user_id");--> statement-breakpoint
CREATE INDEX "atelier_relations_target_idx" ON "atelier_relations" ("target","target_id");--> statement-breakpoint
CREATE INDEX "atelier_jobs_due_idx" ON "atelier_jobs" ("status","run_at");--> statement-breakpoint
CREATE UNIQUE INDEX "atelier_jobs_key_idx" ON "atelier_jobs" ("key");--> statement-breakpoint
CREATE INDEX "atelier_media_folder_idx" ON "atelier_media" ("folder");--> statement-breakpoint
CREATE INDEX "atelier_media_created_idx" ON "atelier_media" ("_created_at");--> statement-breakpoint
CREATE INDEX "atelier_webhook_deliveries_webhook_idx" ON "atelier_webhook_deliveries" ("webhook_id","at");--> statement-breakpoint
CREATE UNIQUE INDEX "atelier_redirects_source_idx" ON "atelier_redirects" ("source");--> statement-breakpoint
CREATE INDEX "atelier_c_pages__group_idx" ON "atelier_c_pages" ("_group");--> statement-breakpoint
CREATE INDEX "atelier_p_pages__group_idx" ON "atelier_p_pages" ("_group");--> statement-breakpoint
CREATE INDEX "atelier_p_relations_target_idx" ON "atelier_p_relations" ("target","target_id");--> statement-breakpoint
CREATE INDEX "atelier_routes_source_idx" ON "atelier_routes" ("source","source_id");--> statement-breakpoint
CREATE INDEX "atelier_p_routes_source_idx" ON "atelier_p_routes" ("source","source_id");--> statement-breakpoint
CREATE UNIQUE INDEX "atelier_revisions_source_version_idx" ON "atelier_revisions" ("source","source_id","_version");--> statement-breakpoint
CREATE UNIQUE INDEX "atelier_users_email_idx" ON "atelier_users" ("email");--> statement-breakpoint
CREATE INDEX "atelier_sessions_user_idx" ON "atelier_sessions" ("user_id");--> statement-breakpoint
CREATE INDEX "atelier_audit_at_idx" ON "atelier_audit" ("at");--> statement-breakpoint
CREATE INDEX "atelier_audit_actor_idx" ON "atelier_audit" ("actor_id");
--> statement-breakpoint
-- atelier:data search index
CREATE TABLE IF NOT EXISTS atelier_search (key varchar(255) PRIMARY KEY, type varchar(64) NOT NULL, entry varchar(64) NOT NULL, locale varchar(35) NOT NULL, a text NOT NULL, b text NOT NULL, c text NOT NULL, document tsvector GENERATED ALWAYS AS (setweight(to_tsvector('simple', a), 'A') || setweight(to_tsvector('simple', b), 'B') || setweight(to_tsvector('simple', c), 'C')) STORED);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS atelier_search_document_idx ON atelier_search USING GIN (document);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS atelier_search_entry_idx ON atelier_search (type, entry);
