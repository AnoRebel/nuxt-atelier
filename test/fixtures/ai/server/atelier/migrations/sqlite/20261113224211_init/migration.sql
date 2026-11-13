CREATE TABLE `atelier_singletons` (
	`name` text PRIMARY KEY,
	`data` text NOT NULL,
	`_version` integer NOT NULL,
	`_updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `atelier_p_singletons` (
	`name` text PRIMARY KEY,
	`data` text NOT NULL,
	`_version` integer NOT NULL,
	`_updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `atelier_tokens` (
	`_id` text PRIMARY KEY,
	`name` text NOT NULL,
	`hash` text NOT NULL,
	`permissions` text NOT NULL,
	`expires_at` text,
	`created_by` text NOT NULL,
	`_created_at` text NOT NULL,
	`last_used_at` text,
	`revoked_at` text
);
--> statement-breakpoint
CREATE TABLE `atelier_rate_limits` (
	`key` text PRIMARY KEY,
	`count` integer NOT NULL,
	`reset_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `atelier_roles` (
	`name` text PRIMARY KEY,
	`definition` text NOT NULL,
	`_updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `atelier_settings` (
	`key` text PRIMARY KEY,
	`value` text NOT NULL,
	`_updated_at` text NOT NULL,
	`_updated_by` text
);
--> statement-breakpoint
CREATE TABLE `atelier_locks` (
	`key` text PRIMARY KEY,
	`type` text NOT NULL,
	`entry` text NOT NULL,
	`user_id` text NOT NULL,
	`acquired_at` text NOT NULL,
	`expires_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `atelier_presence` (
	`key` text PRIMARY KEY,
	`type` text NOT NULL,
	`entry` text NOT NULL,
	`user_id` text NOT NULL,
	`seen_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `atelier_comments` (
	`_id` text PRIMARY KEY,
	`type` text NOT NULL,
	`entry` text NOT NULL,
	`block` text,
	`thread` text,
	`author` text NOT NULL,
	`body` text NOT NULL,
	`mentions` text NOT NULL,
	`resolved_at` text,
	`resolved_by` text,
	`_created_at` text NOT NULL,
	`_updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `atelier_notifications` (
	`_id` text PRIMARY KEY,
	`user_id` text NOT NULL,
	`kind` text NOT NULL,
	`data` text NOT NULL,
	`read_at` text,
	`_created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `atelier_form_submissions` (
	`_id` text PRIMARY KEY,
	`form` text NOT NULL,
	`form_version` integer NOT NULL,
	`locale` text NOT NULL,
	`data` text NOT NULL,
	`emails` text NOT NULL,
	`_created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `atelier_passkeys` (
	`_id` text PRIMARY KEY,
	`user_id` text NOT NULL,
	`public_key` text NOT NULL,
	`counter` integer NOT NULL,
	`transports` text,
	`name` text,
	`_created_at` text NOT NULL,
	`last_used_at` text
);
--> statement-breakpoint
CREATE TABLE `atelier_relations` (
	`source` text NOT NULL,
	`source_id` text NOT NULL,
	`field` text NOT NULL,
	`position` integer NOT NULL,
	`target` text NOT NULL,
	`target_id` text NOT NULL,
	CONSTRAINT `atelier_relations_pk` PRIMARY KEY(`source`, `source_id`, `field`, `position`)
);
--> statement-breakpoint
CREATE TABLE `atelier_jobs` (
	`_id` text PRIMARY KEY,
	`name` text NOT NULL,
	`key` text,
	`payload` text NOT NULL,
	`status` text NOT NULL,
	`run_at` text NOT NULL,
	`attempts` integer NOT NULL,
	`max_attempts` integer NOT NULL,
	`locked_until` text,
	`last_error` text,
	`_created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `atelier_media` (
	`_id` text PRIMARY KEY,
	`key` text NOT NULL,
	`filename` text NOT NULL,
	`mime` text NOT NULL,
	`size` integer NOT NULL,
	`width` integer,
	`height` integer,
	`title` text,
	`alt` text,
	`caption` text,
	`credits` text,
	`folder` text NOT NULL,
	`tags` text NOT NULL,
	`focal` text,
	`private` integer NOT NULL,
	`_created_by` text,
	`_created_at` text NOT NULL,
	`_updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `atelier_media_uploads` (
	`_id` text PRIMARY KEY,
	`filename` text NOT NULL,
	`folder` text NOT NULL,
	`private` integer NOT NULL,
	`size` integer NOT NULL,
	`received` integer NOT NULL,
	`parts` text NOT NULL,
	`created_by` text,
	`_created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `atelier_webhooks` (
	`_id` text PRIMARY KEY,
	`url` text NOT NULL,
	`events` text NOT NULL,
	`types` text,
	`secret` text NOT NULL,
	`active` integer NOT NULL,
	`created_by` text NOT NULL,
	`_created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `atelier_webhook_deliveries` (
	`_id` text PRIMARY KEY,
	`webhook_id` text NOT NULL,
	`message_id` text NOT NULL,
	`event` text NOT NULL,
	`attempt` integer NOT NULL,
	`status` integer,
	`error` text,
	`duration_ms` integer NOT NULL,
	`at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `atelier_redirects` (
	`_id` text PRIMARY KEY,
	`source` text NOT NULL,
	`target` text NOT NULL,
	`status` integer NOT NULL,
	`auto` integer NOT NULL,
	`_created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `atelier_ai_usage` (
	`id` text PRIMARY KEY,
	`user_id` text NOT NULL,
	`action` text NOT NULL,
	`content_type` text,
	`site` text NOT NULL,
	`input_tokens` integer NOT NULL,
	`output_tokens` integer NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `atelier_c_posts` (
	`_id` text PRIMARY KEY,
	`_version` integer NOT NULL,
	`_created_at` text NOT NULL,
	`_updated_at` text NOT NULL,
	`_created_by` text,
	`title` text,
	`body` text,
	`notes` text,
	`seo` text
);
--> statement-breakpoint
CREATE TABLE `atelier_p_posts` (
	`_id` text PRIMARY KEY,
	`_version` integer NOT NULL,
	`_created_at` text NOT NULL,
	`_updated_at` text NOT NULL,
	`_created_by` text,
	`title` text,
	`body` text,
	`notes` text,
	`seo` text
);
--> statement-breakpoint
CREATE TABLE `atelier_c_secrets` (
	`_id` text PRIMARY KEY,
	`_version` integer NOT NULL,
	`_created_at` text NOT NULL,
	`_updated_at` text NOT NULL,
	`_created_by` text,
	`value` text
);
--> statement-breakpoint
CREATE TABLE `atelier_p_relations` (
	`source` text NOT NULL,
	`source_id` text NOT NULL,
	`field` text NOT NULL,
	`position` integer NOT NULL,
	`target` text NOT NULL,
	`target_id` text NOT NULL,
	CONSTRAINT `atelier_p_relations_pk` PRIMARY KEY(`source`, `source_id`, `field`, `position`)
);
--> statement-breakpoint
CREATE TABLE `atelier_p_secrets` (
	`_id` text PRIMARY KEY,
	`_version` integer NOT NULL,
	`_created_at` text NOT NULL,
	`_updated_at` text NOT NULL,
	`_created_by` text,
	`value` text
);
--> statement-breakpoint
CREATE TABLE `atelier_c_atelier_forms` (
	`_id` text PRIMARY KEY,
	`_version` integer NOT NULL,
	`_created_at` text NOT NULL,
	`_updated_at` text NOT NULL,
	`_created_by` text,
	`title` text,
	`fields` text,
	`submitLabel` text,
	`success` text,
	`notify` text,
	`confirmation` text,
	`retentionDays` integer
);
--> statement-breakpoint
CREATE TABLE `atelier_p_atelier_forms` (
	`_id` text PRIMARY KEY,
	`_version` integer NOT NULL,
	`_created_at` text NOT NULL,
	`_updated_at` text NOT NULL,
	`_created_by` text,
	`title` text,
	`fields` text,
	`submitLabel` text,
	`success` text,
	`notify` text,
	`confirmation` text,
	`retentionDays` integer
);
--> statement-breakpoint
CREATE TABLE `atelier_c_atelier_templates` (
	`_id` text PRIMARY KEY,
	`_version` integer NOT NULL,
	`_created_at` text NOT NULL,
	`_updated_at` text NOT NULL,
	`_created_by` text,
	`title` text,
	`description` text,
	`type` text,
	`data` text
);
--> statement-breakpoint
CREATE TABLE `atelier_p_atelier_templates` (
	`_id` text PRIMARY KEY,
	`_version` integer NOT NULL,
	`_created_at` text NOT NULL,
	`_updated_at` text NOT NULL,
	`_created_by` text,
	`title` text,
	`description` text,
	`type` text,
	`data` text
);
--> statement-breakpoint
CREATE TABLE `atelier_routes` (
	`path` text NOT NULL,
	`locale` text NOT NULL,
	`source` text NOT NULL,
	`source_id` text NOT NULL,
	CONSTRAINT `atelier_routes_pk` PRIMARY KEY(`path`, `locale`)
);
--> statement-breakpoint
CREATE TABLE `atelier_p_routes` (
	`path` text NOT NULL,
	`locale` text NOT NULL,
	`source` text NOT NULL,
	`source_id` text NOT NULL,
	CONSTRAINT `atelier_p_routes_pk` PRIMARY KEY(`path`, `locale`)
);
--> statement-breakpoint
CREATE TABLE `atelier_revisions` (
	`_id` text PRIMARY KEY,
	`source` text NOT NULL,
	`source_id` text NOT NULL,
	`_version` integer NOT NULL,
	`data` text NOT NULL,
	`_created_at` text NOT NULL,
	`author_id` text,
	`published` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `atelier_users` (
	`_id` text PRIMARY KEY,
	`email` text NOT NULL,
	`name` text,
	`role` text NOT NULL,
	`password_hash` text,
	`_created_at` text NOT NULL,
	`_updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `atelier_sessions` (
	`_id` text PRIMARY KEY,
	`user_id` text NOT NULL,
	`method` text NOT NULL,
	`_created_at` text NOT NULL,
	`expires_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `atelier_audit` (
	`_id` text PRIMARY KEY,
	`at` text NOT NULL,
	`action` text NOT NULL,
	`actor_id` text,
	`target_type` text,
	`target_id` text,
	`ip` text,
	`details` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `atelier_tokens_hash_idx` ON `atelier_tokens` (`hash`);--> statement-breakpoint
CREATE INDEX `atelier_presence_entry_idx` ON `atelier_presence` (`type`,`entry`);--> statement-breakpoint
CREATE INDEX `atelier_comments_entry_idx` ON `atelier_comments` (`type`,`entry`);--> statement-breakpoint
CREATE INDEX `atelier_comments_thread_idx` ON `atelier_comments` (`thread`);--> statement-breakpoint
CREATE INDEX `atelier_notifications_user_idx` ON `atelier_notifications` (`user_id`,`_created_at`);--> statement-breakpoint
CREATE INDEX `atelier_form_submissions_form_idx` ON `atelier_form_submissions` (`form`,`_created_at`);--> statement-breakpoint
CREATE INDEX `atelier_passkeys_user_idx` ON `atelier_passkeys` (`user_id`);--> statement-breakpoint
CREATE INDEX `atelier_relations_target_idx` ON `atelier_relations` (`target`,`target_id`);--> statement-breakpoint
CREATE INDEX `atelier_jobs_due_idx` ON `atelier_jobs` (`status`,`run_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `atelier_jobs_key_idx` ON `atelier_jobs` (`key`);--> statement-breakpoint
CREATE INDEX `atelier_media_folder_idx` ON `atelier_media` (`folder`);--> statement-breakpoint
CREATE INDEX `atelier_media_created_idx` ON `atelier_media` (`_created_at`);--> statement-breakpoint
CREATE INDEX `atelier_webhook_deliveries_webhook_idx` ON `atelier_webhook_deliveries` (`webhook_id`,`at`);--> statement-breakpoint
CREATE UNIQUE INDEX `atelier_redirects_source_idx` ON `atelier_redirects` (`source`);--> statement-breakpoint
CREATE INDEX `atelier_ai_usage_user_id_idx` ON `atelier_ai_usage` (`user_id`);--> statement-breakpoint
CREATE INDEX `atelier_ai_usage_created_at_idx` ON `atelier_ai_usage` (`created_at`);--> statement-breakpoint
CREATE INDEX `atelier_p_relations_target_idx` ON `atelier_p_relations` (`target`,`target_id`);--> statement-breakpoint
CREATE INDEX `atelier_routes_source_idx` ON `atelier_routes` (`source`,`source_id`);--> statement-breakpoint
CREATE INDEX `atelier_p_routes_source_idx` ON `atelier_p_routes` (`source`,`source_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `atelier_revisions_source_version_idx` ON `atelier_revisions` (`source`,`source_id`,`_version`);--> statement-breakpoint
CREATE UNIQUE INDEX `atelier_users_email_idx` ON `atelier_users` (`email`);--> statement-breakpoint
CREATE INDEX `atelier_sessions_user_idx` ON `atelier_sessions` (`user_id`);--> statement-breakpoint
CREATE INDEX `atelier_audit_at_idx` ON `atelier_audit` (`at`);--> statement-breakpoint
CREATE INDEX `atelier_audit_actor_idx` ON `atelier_audit` (`actor_id`);
--> statement-breakpoint
-- atelier:data search index
CREATE VIRTUAL TABLE IF NOT EXISTS atelier_search USING fts5(key UNINDEXED, type UNINDEXED, entry UNINDEXED, locale UNINDEXED, a, b, c, tokenize = 'unicode61 remove_diacritics 2');
