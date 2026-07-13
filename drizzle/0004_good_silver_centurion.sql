ALTER TABLE `role_groups` ADD `backing_custom_track_id` text REFERENCES custom_tracks(id);--> statement-breakpoint
ALTER TABLE `role_groups` ADD `tab_custom_track_id` text REFERENCES custom_tracks(id);--> statement-breakpoint
ALTER TABLE `songs` ADD `song_type` text DEFAULT 'cover' NOT NULL;--> statement-breakpoint
ALTER TABLE `songs` ADD `tunings` text;--> statement-breakpoint
ALTER TABLE `songs` ADD `cover_art_stored_name` text;--> statement-breakpoint
ALTER TABLE `user_song_progress` ADD `scratchpad_notes` text;