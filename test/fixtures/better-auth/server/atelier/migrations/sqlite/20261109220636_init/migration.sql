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
CREATE TABLE `atelier_ba_users` (
	`id` text PRIMARY KEY,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`emailVerified` integer NOT NULL,
	`image` text,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	`role` text
);
--> statement-breakpoint
CREATE TABLE `atelier_ba_sessions` (
	`id` text PRIMARY KEY,
	`expiresAt` integer NOT NULL,
	`token` text NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	`ipAddress` text,
	`userAgent` text,
	`userId` text NOT NULL,
	CONSTRAINT `fk_atelier_ba_sessions_userId_atelier_ba_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `atelier_ba_users`(`id`) ON DELETE CASCADE
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
CREATE TABLE `atelier_ba_accounts` (
	`id` text PRIMARY KEY,
	`accountId` text NOT NULL,
	`providerId` text NOT NULL,
	`userId` text NOT NULL,
	`accessToken` text,
	`refreshToken` text,
	`idToken` text,
	`accessTokenExpiresAt` integer,
	`refreshTokenExpiresAt` integer,
	`scope` text,
	`password` text,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	CONSTRAINT `fk_atelier_ba_accounts_userId_atelier_ba_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `atelier_ba_users`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `atelier_ba_verifications` (
	`id` text PRIMARY KEY,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`expiresAt` integer NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL
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
CREATE INDEX `atelier_webhook_deliveries_webhook_idx` ON `atelier_webhook_deliveries` (`webhook_id`,`at`);--> statement-breakpoint
CREATE UNIQUE INDEX `atelier_redirects_source_idx` ON `atelier_redirects` (`source`);--> statement-breakpoint
CREATE UNIQUE INDEX `atelier_ba_users_email_unique` ON `atelier_ba_users` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `atelier_ba_sessions_token_unique` ON `atelier_ba_sessions` (`token`);--> statement-breakpoint
CREATE INDEX `atelier_ba_sessions_userId_idx` ON `atelier_ba_sessions` (`userId`);--> statement-breakpoint
CREATE INDEX `atelier_relations_target_idx` ON `atelier_relations` (`target`,`target_id`);--> statement-breakpoint
CREATE INDEX `atelier_ba_accounts_userId_idx` ON `atelier_ba_accounts` (`userId`);--> statement-breakpoint
CREATE INDEX `atelier_ba_verifications_identifier_idx` ON `atelier_ba_verifications` (`identifier`);--> statement-breakpoint
CREATE INDEX `atelier_p_relations_target_idx` ON `atelier_p_relations` (`target`,`target_id`);--> statement-breakpoint
CREATE INDEX `atelier_routes_source_idx` ON `atelier_routes` (`source`,`source_id`);--> statement-breakpoint
CREATE INDEX `atelier_p_routes_source_idx` ON `atelier_p_routes` (`source`,`source_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `atelier_revisions_source_version_idx` ON `atelier_revisions` (`source`,`source_id`,`_version`);--> statement-breakpoint
CREATE UNIQUE INDEX `atelier_users_email_idx` ON `atelier_users` (`email`);--> statement-breakpoint
CREATE INDEX `atelier_sessions_user_idx` ON `atelier_sessions` (`user_id`);--> statement-breakpoint
CREATE INDEX `atelier_audit_at_idx` ON `atelier_audit` (`at`);--> statement-breakpoint
CREATE INDEX `atelier_audit_actor_idx` ON `atelier_audit` (`actor_id`);
