ALTER TABLE `kelas` ADD `navigator_sheet_id` text;--> statement-breakpoint
ALTER TABLE `kelas` ADD `navigator_last_synced_at` text;--> statement-breakpoint
ALTER TABLE `sesi` ADD `source` text DEFAULT 'manual' NOT NULL;