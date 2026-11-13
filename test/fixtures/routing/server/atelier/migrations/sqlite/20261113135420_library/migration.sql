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
CREATE TABLE `atelier_c_atelier_patterns` (
	`_id` text PRIMARY KEY,
	`_version` integer NOT NULL,
	`_created_at` text NOT NULL,
	`_updated_at` text NOT NULL,
	`_created_by` text,
	`title` text,
	`description` text,
	`blocks` text
);
--> statement-breakpoint
CREATE TABLE `atelier_p_atelier_patterns` (
	`_id` text PRIMARY KEY,
	`_version` integer NOT NULL,
	`_created_at` text NOT NULL,
	`_updated_at` text NOT NULL,
	`_created_by` text,
	`title` text,
	`description` text,
	`blocks` text
);
