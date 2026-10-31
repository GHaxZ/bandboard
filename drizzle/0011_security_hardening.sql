CREATE TABLE `rate_limits` (
	`key` text PRIMARY KEY NOT NULL,
	`count` integer NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `rate_limits_expiry_idx` ON `rate_limits` (`expires_at`);--> statement-breakpoint
CREATE TABLE `resource_leases` (
	`id` text PRIMARY KEY NOT NULL,
	`resource` text NOT NULL,
	`owner` text NOT NULL,
	`weight` integer DEFAULT 0 NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `resource_leases_resource_idx` ON `resource_leases` (`resource`);--> statement-breakpoint
CREATE INDEX `resource_leases_expiry_idx` ON `resource_leases` (`expires_at`);--> statement-breakpoint
CREATE TABLE `stored_files` (
	`name` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `stored_files_owner_idx` ON `stored_files` (`owner`);--> statement-breakpoint
-- Revoke legacy raw bearer sessions before changing the session format.
DELETE FROM `sessions`;--> statement-breakpoint
ALTER TABLE `sessions` ADD `last_seen_at` integer NOT NULL;--> statement-breakpoint
CREATE INDEX `sessions_last_seen_idx` ON `sessions` (`last_seen_at`);--> statement-breakpoint
ALTER TABLE `users` ADD `role` text DEFAULT 'member' NOT NULL;
--> statement-breakpoint
-- Bootstrap one organizer deterministically; subsequent promotion is explicit.
UPDATE users SET role = 'admin' WHERE id = (SELECT id FROM users ORDER BY created_at, id LIMIT 1);
--> statement-breakpoint
INSERT INTO stored_files (name, owner, size_bytes, created_at)
SELECT stored_name, 'legacy', size_bytes, created_at FROM custom_tracks;
--> statement-breakpoint
-- Legacy image sizes are unknown. Reserve the maximum allowed size conservatively.
INSERT OR IGNORE INTO stored_files (name, owner, size_bytes, created_at)
SELECT cover_art_stored_name, 'legacy', 5242880, created_at FROM songs WHERE cover_art_stored_name IS NOT NULL;
--> statement-breakpoint
DELETE FROM login_failures;
