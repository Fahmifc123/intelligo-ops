ALTER TABLE `fee_rule` ADD `trainer_id` text REFERENCES trainer(id);--> statement-breakpoint
ALTER TABLE `sesi` ADD `trainer_id` text REFERENCES trainer(id);