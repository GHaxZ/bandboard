-- Corrective migration: 0004 created role_groups.backing_custom_track_id /
-- tab_custom_track_id as bare REFERENCES (NO ACTION), but schema.ts declares
-- ON DELETE SET NULL, so deleting a bound custom track threw an FK error.
-- SQLite can't alter FK actions -> rebuild the table. tracks is rebuilt
-- without its FK first so DROP role_groups can't cascade into it, then
-- restored with its FK.
CREATE TABLE `tracks_tmp` (
	`id` text PRIMARY KEY NOT NULL,
	`role_group_id` text NOT NULL,
	`instrument_name` text NOT NULL,
	`details` text,
	`tuning` text NOT NULL,
	`tab_link` text NOT NULL
);
--> statement-breakpoint
INSERT INTO `tracks_tmp` SELECT `id`, `role_group_id`, `instrument_name`, `details`, `tuning`, `tab_link` FROM `tracks`;--> statement-breakpoint
DROP TABLE `tracks`;--> statement-breakpoint
ALTER TABLE `tracks_tmp` RENAME TO `tracks`;--> statement-breakpoint
CREATE TABLE `role_groups_tmp` (
	`id` text PRIMARY KEY NOT NULL,
	`song_id` text NOT NULL,
	`role` text NOT NULL,
	`backing_track_link` text,
	`tab_video_link` text,
	`backing_custom_track_id` text,
	`tab_custom_track_id` text,
	FOREIGN KEY (`song_id`) REFERENCES `songs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`backing_custom_track_id`) REFERENCES `custom_tracks`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`tab_custom_track_id`) REFERENCES `custom_tracks`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `role_groups_tmp` SELECT `id`, `song_id`, `role`, `backing_track_link`, `tab_video_link`, `backing_custom_track_id`, `tab_custom_track_id` FROM `role_groups`;--> statement-breakpoint
DROP TABLE `role_groups`;--> statement-breakpoint
ALTER TABLE `role_groups_tmp` RENAME TO `role_groups`;--> statement-breakpoint
CREATE INDEX `role_groups_song_id_idx` ON `role_groups` (`song_id`);--> statement-breakpoint
CREATE TABLE `tracks_final` (
	`id` text PRIMARY KEY NOT NULL,
	`role_group_id` text NOT NULL,
	`instrument_name` text NOT NULL,
	`details` text,
	`tuning` text NOT NULL,
	`tab_link` text NOT NULL,
	FOREIGN KEY (`role_group_id`) REFERENCES `role_groups`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `tracks_final` SELECT `id`, `role_group_id`, `instrument_name`, `details`, `tuning`, `tab_link` FROM `tracks`;--> statement-breakpoint
DROP TABLE `tracks`;--> statement-breakpoint
ALTER TABLE `tracks_final` RENAME TO `tracks`;--> statement-breakpoint
CREATE INDEX `tracks_role_group_id_idx` ON `tracks` (`role_group_id`);
