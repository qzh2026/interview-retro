CREATE TABLE `sync_changes` (
	`seq` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`change_id` text NOT NULL,
	`user_id` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`op` text NOT NULL,
	`payload` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sync_changes_change_id_unique` ON `sync_changes` (`change_id`);--> statement-breakpoint
CREATE INDEX `sync_changes_user_seq_idx` ON `sync_changes` (`user_id`,`seq`);--> statement-breakpoint
CREATE TABLE `tombstones` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`deleted_at` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tombstones_user_entity_unique` ON `tombstones` (`user_id`,`entity_type`,`entity_id`);