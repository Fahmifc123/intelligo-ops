CREATE TABLE `karyawan` (
	`id` text PRIMARY KEY NOT NULL,
	`nama` text NOT NULL,
	`posisi` text NOT NULL,
	`bank_name` text,
	`bank_account_number` text,
	`bank_account_name` text,
	`created_at` text DEFAULT (current_timestamp)
);
--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_payslip` (
	`id` text PRIMARY KEY NOT NULL,
	`tipe` text DEFAULT 'trainer' NOT NULL,
	`trainer_id` text,
	`karyawan_id` text,
	`nominal` real,
	`periode` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`catatan` text,
	`created_at` text DEFAULT (current_timestamp),
	`finalized_at` text,
	`paid_at` text,
	`jadwal_pembayaran` text,
	FOREIGN KEY (`trainer_id`) REFERENCES `trainer`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`karyawan_id`) REFERENCES `karyawan`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_payslip`("id", "tipe", "trainer_id", "karyawan_id", "nominal", "periode", "status", "catatan", "created_at", "finalized_at", "paid_at", "jadwal_pembayaran") SELECT "id", 'trainer', "trainer_id", NULL, NULL, "periode", "status", "catatan", "created_at", "finalized_at", "paid_at", "jadwal_pembayaran" FROM `payslip`;--> statement-breakpoint
DROP TABLE `payslip`;--> statement-breakpoint
ALTER TABLE `__new_payslip` RENAME TO `payslip`;--> statement-breakpoint
PRAGMA foreign_keys=ON;