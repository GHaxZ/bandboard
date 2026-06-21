import { sqliteTable, text, integer, primaryKey } from 'drizzle-orm/sqlite-core';
import { relations } from 'drizzle-orm';

export const songs = sqliteTable('songs', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  artist: text('artist').notNull(),
  songsterrId: integer('songsterr_id'),
  createdAt: integer('created_at').notNull(),
});

export const tracks = sqliteTable('tracks', {
  id: text('id').primaryKey(),
  songId: text('song_id').notNull().references(() => songs.id, { onDelete: 'cascade' }),
  instrumentName: text('instrument_name').notNull(),
  role: text('role').notNull(), // 'Guitar' | 'Bass' | 'Drums' | 'Vocals' | 'Other'
  details: text('details'),
  tuning: text('tuning').notNull(),
  tabLink: text('tab_link').notNull(),
  backingTrackLink: text('backing_track_link'),
  tabVideoLink: text('tab_video_link'),
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
  tracks: many(tracks),
  rehearsalSongs: many(rehearsalSongs),
}));

export const tracksRelations = relations(tracks, ({ one }) => ({
  song: one(songs, {
    fields: [tracks.songId],
    references: [songs.id],
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
