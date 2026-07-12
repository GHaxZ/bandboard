CREATE TABLE `rehearsal_songs` (
	`rehearsal_id` text NOT NULL,
	`song_id` text NOT NULL,
	`sort_order` integer NOT NULL,
	PRIMARY KEY(`rehearsal_id`, `song_id`),
	FOREIGN KEY (`rehearsal_id`) REFERENCES `rehearsals`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`song_id`) REFERENCES `songs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `rehearsal_songs_rehearsal_id_idx` ON `rehearsal_songs` (`rehearsal_id`);--> statement-breakpoint
CREATE INDEX `rehearsal_songs_song_id_idx` ON `rehearsal_songs` (`song_id`);--> statement-breakpoint
CREATE TABLE `rehearsals` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`date` integer NOT NULL,
	`notes` text
);
--> statement-breakpoint
CREATE TABLE `role_groups` (
	`id` text PRIMARY KEY NOT NULL,
	`song_id` text NOT NULL,
	`role` text NOT NULL,
	`backing_track_link` text,
	`tab_video_link` text,
	FOREIGN KEY (`song_id`) REFERENCES `songs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `role_groups_song_id_idx` ON `role_groups` (`song_id`);--> statement-breakpoint
CREATE TABLE `songs` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`artist` text NOT NULL,
	`songsterr_id` integer,
	`album_art` text,
	`lyrics_url` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `tracks` (
	`id` text PRIMARY KEY NOT NULL,
	`role_group_id` text NOT NULL,
	`instrument_name` text NOT NULL,
	`details` text,
	`tuning` text NOT NULL,
	`tab_link` text NOT NULL,
	FOREIGN KEY (`role_group_id`) REFERENCES `role_groups`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `tracks_role_group_id_idx` ON `tracks` (`role_group_id`);--> statement-breakpoint
CREATE TABLE `user_settings` (
	`user_uuid` text PRIMARY KEY NOT NULL,
	`preferred_instrument` text DEFAULT 'Guitar' NOT NULL,
	`autoplay_enabled` integer DEFAULT true NOT NULL,
	`autoplay_timeout` integer DEFAULT 5 NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `user_song_progress` (
	`id` text PRIMARY KEY NOT NULL,
	`user_uuid` text NOT NULL,
	`song_id` text NOT NULL,
	`status` text DEFAULT 'not_started' NOT NULL,
	`speed` integer DEFAULT 100 NOT NULL,
	`notes` text,
	`practice_markers` text,
	`backing_start_offset` real,
	`tab_start_offset` real,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`song_id`) REFERENCES `songs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_song_unique_idx` ON `user_song_progress` (`user_uuid`,`song_id`);--> statement-breakpoint
CREATE INDEX `user_song_progress_user_uuid_idx` ON `user_song_progress` (`user_uuid`);