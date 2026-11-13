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
CREATE INDEX `atelier_form_submissions_form_idx` ON `atelier_form_submissions` (`form`,`_created_at`);
