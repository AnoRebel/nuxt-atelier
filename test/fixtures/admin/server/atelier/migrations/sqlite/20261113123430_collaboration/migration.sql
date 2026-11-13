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
CREATE INDEX `atelier_presence_entry_idx` ON `atelier_presence` (`type`,`entry`);--> statement-breakpoint
CREATE INDEX `atelier_comments_entry_idx` ON `atelier_comments` (`type`,`entry`);--> statement-breakpoint
CREATE INDEX `atelier_comments_thread_idx` ON `atelier_comments` (`thread`);--> statement-breakpoint
CREATE INDEX `atelier_notifications_user_idx` ON `atelier_notifications` (`user_id`,`_created_at`);
