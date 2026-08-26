DROP INDEX `rehearsal_songs_rehearsal_id_idx`;--> statement-breakpoint
DROP INDEX `rehearsal_votes_rehearsal_id_idx`;--> statement-breakpoint
DROP INDEX `user_song_progress_user_uuid_idx`;--> statement-breakpoint
CREATE INDEX `role_groups_backing_custom_track_id_idx` ON `role_groups` (`backing_custom_track_id`);--> statement-breakpoint
CREATE INDEX `role_groups_tab_custom_track_id_idx` ON `role_groups` (`tab_custom_track_id`);