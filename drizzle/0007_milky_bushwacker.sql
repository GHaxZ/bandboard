CREATE TABLE `login_failures` (
	`key` text PRIMARY KEY NOT NULL,
	`count` integer NOT NULL,
	`last_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `songs_title_artist_type_unique` ON `songs` (lower("title"),lower("artist"),`song_type`);