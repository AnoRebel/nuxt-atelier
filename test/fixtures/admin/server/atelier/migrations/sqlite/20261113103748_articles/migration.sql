CREATE TABLE `atelier_c_articles` (
	`_id` text PRIMARY KEY,
	`_version` integer NOT NULL,
	`_created_at` text NOT NULL,
	`_updated_at` text NOT NULL,
	`_created_by` text,
	`title` text,
	`slug` text,
	`excerpt` text,
	`seo` text
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
	`excerpt` text,
	`seo` text
);
