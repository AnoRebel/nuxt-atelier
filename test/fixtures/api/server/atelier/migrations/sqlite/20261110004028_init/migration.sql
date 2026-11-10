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
CREATE TABLE `atelier_c_articles` (
	`_id` text PRIMARY KEY,
	`_version` integer NOT NULL,
	`_created_at` text NOT NULL,
	`_updated_at` text NOT NULL,
	`_created_by` text,
	`title` text,
	`slug` text,
	`category` text,
	`views` integer,
	`tags` text,
	`internalNotes` text
);
--> statement-breakpoint
CREATE TABLE `atelier_p_articles` (
	`_id` text PRIMARY KEY,
	`_version` integer NOT NULL,
	`_created_at` text NOT NULL,
	`_updated_at` text NOT NULL,
	`_created_by` text,
	`title` text,
	`slug` text,
	`category` text,
	`views` integer,
	`tags` text,
	`internalNotes` text
);
--> statement-breakpoint
CREATE TABLE `atelier_c_authors` (
	`_id` text PRIMARY KEY,
	`_version` integer NOT NULL,
	`_created_at` text NOT NULL,
	`_updated_at` text NOT NULL,
	`_created_by` text,
	`name` text,
	`email` text
);
--> statement-breakpoint
CREATE TABLE `atelier_p_authors` (
	`_id` text PRIMARY KEY,
	`_version` integer NOT NULL,
	`_created_at` text NOT NULL,
	`_updated_at` text NOT NULL,
	`_created_by` text,
	`name` text,
	`email` text
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
CREATE INDEX `atelier_passkeys_user_idx` ON `atelier_passkeys` (`user_id`);--> statement-breakpoint
CREATE INDEX `atelier_jobs_due_idx` ON `atelier_jobs` (`status`,`run_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `atelier_jobs_key_idx` ON `atelier_jobs` (`key`);--> statement-breakpoint
CREATE INDEX `atelier_media_folder_idx` ON `atelier_media` (`folder`);--> statement-breakpoint
CREATE INDEX `atelier_media_created_idx` ON `atelier_media` (`_created_at`);--> statement-breakpoint
CREATE INDEX `atelier_webhook_deliveries_webhook_idx` ON `atelier_webhook_deliveries` (`webhook_id`,`at`);--> statement-breakpoint
CREATE UNIQUE INDEX `atelier_redirects_source_idx` ON `atelier_redirects` (`source`);--> statement-breakpoint
CREATE INDEX `atelier_relations_target_idx` ON `atelier_relations` (`target`,`target_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `atelier_c_articles_slug_unique` ON `atelier_c_articles` (`slug`);--> statement-breakpoint
CREATE UNIQUE INDEX `atelier_p_articles_slug_unique` ON `atelier_p_articles` (`slug`);--> statement-breakpoint
CREATE INDEX `atelier_p_relations_target_idx` ON `atelier_p_relations` (`target`,`target_id`);--> statement-breakpoint
CREATE INDEX `atelier_routes_source_idx` ON `atelier_routes` (`source`,`source_id`);--> statement-breakpoint
CREATE INDEX `atelier_p_routes_source_idx` ON `atelier_p_routes` (`source`,`source_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `atelier_revisions_source_version_idx` ON `atelier_revisions` (`source`,`source_id`,`_version`);--> statement-breakpoint
CREATE UNIQUE INDEX `atelier_users_email_idx` ON `atelier_users` (`email`);--> statement-breakpoint
CREATE INDEX `atelier_sessions_user_idx` ON `atelier_sessions` (`user_id`);--> statement-breakpoint
CREATE INDEX `atelier_audit_at_idx` ON `atelier_audit` (`at`);--> statement-breakpoint
CREATE INDEX `atelier_audit_actor_idx` ON `atelier_audit` (`actor_id`);
