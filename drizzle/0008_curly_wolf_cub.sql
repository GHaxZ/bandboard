CREATE TABLE `comment_reads` (
	`user_uuid` text NOT NULL,
	`rehearsal_id` text NOT NULL,
	`song_id` text NOT NULL,
	`last_read_at` integer NOT NULL,
	PRIMARY KEY(`user_uuid`, `rehearsal_id`, `song_id`),
	FOREIGN KEY (`rehearsal_id`) REFERENCES `rehearsals`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`song_id`) REFERENCES `songs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `rehearsal_song_comments` (
	`id` text PRIMARY KEY NOT NULL,
	`rehearsal_id` text NOT NULL,
	`song_id` text NOT NULL,
	`user_uuid` text NOT NULL,
	`body` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`rehearsal_id`) REFERENCES `rehearsals`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`song_id`) REFERENCES `songs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `rehearsal_song_comments_rehearsal_song_idx` ON `rehearsal_song_comments` (`rehearsal_id`,`song_id`);--> statement-breakpoint
CREATE TABLE `rehearsal_votes` (
	`id` text PRIMARY KEY NOT NULL,
	`rehearsal_id` text NOT NULL,
	`song_id` text NOT NULL,
	`user_uuid` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`rehearsal_id`) REFERENCES `rehearsals`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`song_id`) REFERENCES `songs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `rehearsal_votes_unique` ON `rehearsal_votes` (`rehearsal_id`,`song_id`,`user_uuid`);--> statement-breakpoint
CREATE INDEX `rehearsal_votes_rehearsal_id_idx` ON `rehearsal_votes` (`rehearsal_id`);--> statement-breakpoint
ALTER TABLE `rehearsals` ADD `type` text DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE `rehearsals` ADD `voting_ends_at` integer;--> statement-breakpoint
ALTER TABLE `rehearsals` ADD `song_selection_count` integer;--> statement-breakpoint
ALTER TABLE `rehearsals` ADD `finalized_at` integer;