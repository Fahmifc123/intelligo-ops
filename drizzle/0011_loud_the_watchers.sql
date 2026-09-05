ALTER TABLE `payslip` ADD `tipe` text DEFAULT 'trainer' NOT NULL;--> statement-breakpoint
ALTER TABLE `payslip` ADD `nominal` real;--> statement-breakpoint
ALTER TABLE `trainer` ADD `tipe` text DEFAULT 'trainer' NOT NULL;--> statement-breakpoint
ALTER TABLE `trainer` ADD `posisi` text;