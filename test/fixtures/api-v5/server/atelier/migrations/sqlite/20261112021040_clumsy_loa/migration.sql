CREATE TABLE `atelier_c_products` (
	`_id` text PRIMARY KEY,
	`_version` integer NOT NULL,
	`_created_at` text NOT NULL,
	`_updated_at` text NOT NULL,
	`_created_by` text,
	`_locale` text DEFAULT 'en' NOT NULL,
	`_group` text,
	`title` text,
	`subtitle` text,
	`sku` text
);
--> statement-breakpoint
CREATE TABLE `atelier_p_products` (
	`_id` text PRIMARY KEY,
	`_version` integer NOT NULL,
	`_created_at` text NOT NULL,
	`_updated_at` text NOT NULL,
	`_created_by` text,
	`_locale` text DEFAULT 'en' NOT NULL,
	`_group` text,
	`title` text,
	`subtitle` text,
	`sku` text
);
--> statement-breakpoint
CREATE INDEX `atelier_c_products__group_idx` ON `atelier_c_products` (`_group`);--> statement-breakpoint
CREATE INDEX `atelier_p_products__group_idx` ON `atelier_p_products` (`_group`);
