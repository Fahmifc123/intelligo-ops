CREATE TABLE `payslip` (
	`id` text PRIMARY KEY NOT NULL,
	`trainer_id` text NOT NULL,
	`periode` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`catatan` text,
	`created_at` text DEFAULT (current_timestamp),
	`finalized_at` text,
	FOREIGN KEY (`trainer_id`) REFERENCES `trainer`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `payslip_item` (
	`id` text PRIMARY KEY NOT NULL,
	`payslip_id` text NOT NULL,
	`sesi_id` text NOT NULL,
	`rate_per_sesi` real NOT NULL,
	`created_at` text DEFAULT (current_timestamp),
	FOREIGN KEY (`payslip_id`) REFERENCES `payslip`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`sesi_id`) REFERENCES `sesi`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
-- Satu sesi cuma boleh nempel ke satu payslip. Kalau payslip dihapus,
-- item-nya ikut kehapus (lihat handler DELETE /api/payslip/[id]), jadi
-- sesi otomatis "lepas" dan bisa dicentang lagi ke payslip lain.
CREATE UNIQUE INDEX `payslip_item_sesi_id_unique` ON `payslip_item` (`sesi_id`);
