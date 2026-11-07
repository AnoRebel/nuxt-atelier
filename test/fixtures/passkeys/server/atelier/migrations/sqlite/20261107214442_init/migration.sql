CREATE TABLE `atelier_singletons` (
	`name` text PRIMARY KEY,
	`data` text NOT NULL,
	`_version` integer NOT NULL,
	`_updated_at` text NOT NULL
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
CREATE TABLE `atelier_revisions` (
	`_id` text PRIMARY KEY,
	`source` text NOT NULL,
	`source_id` text NOT NULL,
	`_version` integer NOT NULL,
	`data` text NOT NULL,
	`_created_at` text NOT NULL,
	`author_id` text
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
CREATE TABLE `atelier_routes` (
	`path` text PRIMARY KEY,
	`source` text NOT NULL,
	`source_id` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `atelier_relations_target_idx` ON `atelier_relations` (`target`,`target_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `atelier_revisions_source_version_idx` ON `atelier_revisions` (`source`,`source_id`,`_version`);--> statement-breakpoint
CREATE UNIQUE INDEX `atelier_users_email_idx` ON `atelier_users` (`email`);--> statement-breakpoint
CREATE INDEX `atelier_sessions_user_idx` ON `atelier_sessions` (`user_id`);--> statement-breakpoint
CREATE INDEX `atelier_passkeys_user_idx` ON `atelier_passkeys` (`user_id`);--> statement-breakpoint
CREATE INDEX `atelier_routes_source_idx` ON `atelier_routes` (`source`,`source_id`);
