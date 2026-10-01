CREATE TABLE `payslip_pengiriman` (
	`id` text PRIMARY KEY NOT NULL,
	`trainer_id` text NOT NULL,
	`trainer_nama` text NOT NULL,
	`email` text,
	`periode` text NOT NULL,
	`payslip_ids` text NOT NULL,
	`status` text DEFAULT 'menunggu' NOT NULL,
	`error` text,
	`created_at` text DEFAULT (current_timestamp),
	`completed_at` text,
	FOREIGN KEY (`trainer_id`) REFERENCES `trainer`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
ALTER TABLE `payslip` ADD `dikirim_at` text;