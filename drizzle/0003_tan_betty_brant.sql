CREATE TABLE `custom_tracks` (
	`id` text PRIMARY KEY NOT NULL,
	`song_id` text NOT NULL,
	`role` text NOT NULL,
	`label` text NOT NULL,
	`file_name` text NOT NULL,
	`stored_name` text NOT NULL,
	`mime_type` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`duration` real,
	`start_offset` real DEFAULT 0 NOT NULL,
	`is_video` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`song_id`) REFERENCES `songs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `custom_tracks_song_id_idx` ON `custom_tracks` (`song_id`);