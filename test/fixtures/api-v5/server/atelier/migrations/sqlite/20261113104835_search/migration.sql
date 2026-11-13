CREATE TABLE `atelier_c_notes` (
	`_id` text PRIMARY KEY,
	`_version` integer NOT NULL,
	`_created_at` text NOT NULL,
	`_updated_at` text NOT NULL,
	`_created_by` text,
	`title` text,
	`slug` text,
	`body` text
);
--> statement-breakpoint
CREATE TABLE `atelier_p_notes` (
	`_id` text PRIMARY KEY,
	`_version` integer NOT NULL,
	`_created_at` text NOT NULL,
	`_updated_at` text NOT NULL,
	`_created_by` text,
	`title` text,
	`slug` text,
	`body` text
);
--> statement-breakpoint
-- atelier:data search index
CREATE VIRTUAL TABLE IF NOT EXISTS atelier_search USING fts5(key UNINDEXED, type UNINDEXED, entry UNINDEXED, locale UNINDEXED, a, b, c, tokenize = 'unicode61 remove_diacritics 2');
