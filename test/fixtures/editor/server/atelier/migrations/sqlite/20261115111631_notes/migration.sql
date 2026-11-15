CREATE TABLE `atelier_c_notes` (
	`_id` text PRIMARY KEY,
	`_version` integer NOT NULL,
	`_created_at` text NOT NULL,
	`_updated_at` text NOT NULL,
	`_created_by` text,
	`_locale` text DEFAULT 'en' NOT NULL,
	`_group` text,
	`title` text
);
--> statement-breakpoint
CREATE TABLE `atelier_p_notes` (
	`_id` text PRIMARY KEY,
	`_version` integer NOT NULL,
	`_created_at` text NOT NULL,
	`_updated_at` text NOT NULL,
	`_created_by` text,
	`_locale` text DEFAULT 'en' NOT NULL,
	`_group` text,
	`title` text
);
--> statement-breakpoint
CREATE INDEX `atelier_c_notes__group_idx` ON `atelier_c_notes` (`_group`);--> statement-breakpoint
CREATE INDEX `atelier_p_notes__group_idx` ON `atelier_p_notes` (`_group`);
