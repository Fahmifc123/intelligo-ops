CREATE TABLE `fee_rule` (
	`id` text PRIMARY KEY NOT NULL,
	`kelas_id` text NOT NULL,
	`rate_per_sesi` real NOT NULL,
	`skema` text DEFAULT 'flat' NOT NULL,
	`created_at` text DEFAULT (current_timestamp),
	FOREIGN KEY (`kelas_id`) REFERENCES `kelas`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `kelas` (
	`id` text PRIMARY KEY NOT NULL,
	`nama` text NOT NULL,
	`tipe` text NOT NULL,
	`trainer_id` text NOT NULL,
	`tanggal_mulai` text,
	`created_at` text DEFAULT (current_timestamp),
	FOREIGN KEY (`trainer_id`) REFERENCES `trainer`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `payment` (
	`id` text PRIMARY KEY NOT NULL,
	`trainer_id` text NOT NULL,
	`periode` text NOT NULL,
	`jumlah_sesi` integer DEFAULT 0 NOT NULL,
	`total_fee` real DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`tanggal_estimasi` text,
	`created_at` text DEFAULT (current_timestamp),
	FOREIGN KEY (`trainer_id`) REFERENCES `trainer`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `sesi` (
	`id` text PRIMARY KEY NOT NULL,
	`kelas_id` text NOT NULL,
	`pertemuan_ke` integer NOT NULL,
	`tanggal` text,
	`materi` text,
	`status` text DEFAULT 'belum' NOT NULL,
	`link_record` text,
	`created_at` text DEFAULT (current_timestamp),
	FOREIGN KEY (`kelas_id`) REFERENCES `kelas`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `trainer` (
	`id` text PRIMARY KEY NOT NULL,
	`nama` text NOT NULL,
	`email` text,
	`bank_account` text,
	`created_at` text DEFAULT (current_timestamp)
);
