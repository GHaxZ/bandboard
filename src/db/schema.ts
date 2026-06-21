import { sqliteTable, text, integer, primaryKey, real } from 'drizzle-orm/sqlite-core';
import { relations } from 'drizzle-orm';

export const songs = sqliteTable('songs', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  artist: text('artist').notNull(),
  songsterrId: integer('songsterr_id'),
  albumArt: text('album_art'),
  lyrics: text('lyrics'),
  createdAt: integer('created_at').notNull(),
});

export const roleGroups = sqliteTable('role_groups', {
  id: text('id').primaryKey(),
  songId: text('song_id').notNull().references(() => songs.id, { onDelete: 'cascade' }),
  role: text('role').notNull(), // 'Guitar' | 'Bass' | 'Drums' | 'Vocals' | 'Piano/Keyboard' | 'Other'
  backingTrackLink: text('backing_track_link'),
  tabVideoLink: text('tab_video_link'),
  backingStartOffset: real('backing_start_offset'), // Deprecated (offsets are now private to userSongProgress)
  tabStartOffset: real('tab_start_offset'), // Deprecated (offsets are now private to userSongProgress)
});

export const tracks = sqliteTable('tracks', {
  id: text('id').primaryKey(),
  roleGroupId: text('role_group_id').notNull().references(() => roleGroups.id, { onDelete: 'cascade' }),
  instrumentName: text('instrument_name').notNull(),
  role: text('role').notNull(), // 'Guitar' | 'Bass' | 'Drums' | 'Vocals' | 'Other'
  details: text('details'),
  tuning: text('tuning').notNull(),
  tabLink: text('tab_link').notNull(),
});

export const rehearsals = sqliteTable('rehearsals', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  date: integer('date').notNull(), // Unix timestamp (ms)
  notes: text('notes'),
});

export const rehearsalSongs = sqliteTable('rehearsal_songs', {
  rehearsalId: text('rehearsal_id').notNull().references(() => rehearsals.id, { onDelete: 'cascade' }),
  songId: text('song_id').notNull().references(() => songs.id, { onDelete: 'cascade' }),
  sortOrder: integer('sort_order').notNull(),
}, (table) => [
  primaryKey({ columns: [table.rehearsalId, table.songId] })
]);

// Drizzle Relations
export const songsRelations = relations(songs, ({ many }) => ({
  roleGroups: many(roleGroups),
  rehearsalSongs: many(rehearsalSongs),
  userProgress: many(userSongProgress),
}));

export const roleGroupsRelations = relations(roleGroups, ({ one, many }) => ({
  song: one(songs, {
    fields: [roleGroups.songId],
    references: [songs.id],
  }),
  tracks: many(tracks),
}));

export const tracksRelations = relations(tracks, ({ one }) => ({
  roleGroup: one(roleGroups, {
    fields: [tracks.roleGroupId],
    references: [roleGroups.id],
  }),
}));

export const rehearsalsRelations = relations(rehearsals, ({ many }) => ({
  rehearsalSongs: many(rehearsalSongs),
}));

export const rehearsalSongsRelations = relations(rehearsalSongs, ({ one }) => ({
  rehearsal: one(rehearsals, {
    fields: [rehearsalSongs.rehearsalId],
    references: [rehearsals.id],
  }),
  song: one(songs, {
    fields: [rehearsalSongs.songId],
    references: [songs.id],
  }),
}));

export const userSettings = sqliteTable('user_settings', {
  userUuid: text('user_uuid').primaryKey(),
  preferredInstrument: text('preferred_instrument').notNull().default('Guitar'),
  theme: text('theme').notNull().default('dark'),
  updatedAt: integer('updated_at').notNull(),
});

export const userSongProgress = sqliteTable('user_song_progress', {
  id: text('id').primaryKey(),
  userUuid: text('user_uuid').notNull(),
  songId: text('song_id').notNull().references(() => songs.id, { onDelete: 'cascade' }),
  status: text('status').notNull().default('learning'), // 'learning' | 'mastered' | 'not_started'
  speed: integer('speed').notNull().default(100),
  notes: text('notes'),
  practiceMarkers: text('practice_markers'),
  backingStartOffset: real('backing_start_offset'),
  tabStartOffset: real('tab_start_offset'),
  updatedAt: integer('updated_at').notNull(),
});

export const userSongProgressRelations = relations(userSongProgress, ({ one }) => ({
  song: one(songs, {
    fields: [userSongProgress.songId],
    references: [songs.id],
  }),
}));

