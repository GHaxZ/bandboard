import { sqliteTable, text, integer, real, primaryKey, uniqueIndex, index } from 'drizzle-orm/sqlite-core';
import { relations } from 'drizzle-orm';
import type { Role, ProgressStatus } from '@/lib/constants';

// ---------------------------------------------------------------------------
// songs
// ---------------------------------------------------------------------------
export const songs = sqliteTable('songs', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  artist: text('artist').notNull(),
  songsterrId: integer('songsterr_id'),
  albumArt: text('album_art'),
  lyricsUrl: text('lyrics_url'),
  songType: text('song_type').$type<'cover' | 'original'>().notNull().default('cover'),
  tunings: text('tunings'),
  coverArtStoredName: text('cover_art_stored_name'),
  createdAt: integer('created_at').notNull(),
});

// ---------------------------------------------------------------------------
// roleGroups — one instrument role within a song, owns backing/tab YT links
// ---------------------------------------------------------------------------
export const roleGroups = sqliteTable(
  'role_groups',
  {
    id: text('id').primaryKey(),
    songId: text('song_id')
      .notNull()
      .references(() => songs.id, { onDelete: 'cascade' }),
    role: text('role').$type<Role>().notNull(), // Role union
    backingTrackLink: text('backing_track_link'),
    tabVideoLink: text('tab_video_link'),
    backingCustomTrackId: text('backing_custom_track_id').references(() => customTracks.id, { onDelete: 'set null' }),
    tabCustomTrackId: text('tab_custom_track_id').references(() => customTracks.id, { onDelete: 'set null' }),
  },
  (table) => [index('role_groups_song_id_idx').on(table.songId)]
);

// ---------------------------------------------------------------------------
// tracks — one Songsterr instrument line within a role group
// ---------------------------------------------------------------------------
export const tracks = sqliteTable(
  'tracks',
  {
    id: text('id').primaryKey(),
    roleGroupId: text('role_group_id')
      .notNull()
      .references(() => roleGroups.id, { onDelete: 'cascade' }),
    instrumentName: text('instrument_name').notNull(),
    details: text('details'),
    tuning: text('tuning').notNull(),
    tabLink: text('tab_link').notNull(),
  },
  (table) => [index('tracks_role_group_id_idx').on(table.roleGroupId)]
);

// ---------------------------------------------------------------------------
// customTracks — user-uploaded audio/video stems for a song, aligned on a
// shared timeline. startOffset (seconds) is the only sync knob and is shared
// across all users (set once in Track Studio).
// ---------------------------------------------------------------------------
export const customTracks = sqliteTable(
  'custom_tracks',
  {
    id: text('id').primaryKey(),
    songId: text('song_id')
      .notNull()
      .references(() => songs.id, { onDelete: 'cascade' }),
    role: text('role').$type<Role>().notNull(),
    label: text('label').notNull(),
    fileName: text('file_name').notNull(),
    storedName: text('stored_name').notNull(),
    mimeType: text('mime_type').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    duration: real('duration'),
    startOffset: real('start_offset').notNull().default(0),
    isVideo: integer('is_video', { mode: 'boolean' }).notNull().default(false),
    createdAt: integer('created_at').notNull(),
  },
  (table) => [index('custom_tracks_song_id_idx').on(table.songId)]
);

// ---------------------------------------------------------------------------
// rehearsals
// ---------------------------------------------------------------------------
export const rehearsals = sqliteTable('rehearsals', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  date: integer('date').notNull(), // Unix-ms
  notes: text('notes'),
});

// ---------------------------------------------------------------------------
// rehearsalSongs — ordered junction
// ---------------------------------------------------------------------------
export const rehearsalSongs = sqliteTable(
  'rehearsal_songs',
  {
    rehearsalId: text('rehearsal_id')
      .notNull()
      .references(() => rehearsals.id, { onDelete: 'cascade' }),
    songId: text('song_id')
      .notNull()
      .references(() => songs.id, { onDelete: 'cascade' }),
    sortOrder: integer('sort_order').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.rehearsalId, table.songId] }),
    index('rehearsal_songs_rehearsal_id_idx').on(table.rehearsalId),
    index('rehearsal_songs_song_id_idx').on(table.songId),
  ]
);

// ---------------------------------------------------------------------------
// userSettings — one row per device UUID
// ---------------------------------------------------------------------------
export const userSettings = sqliteTable('user_settings', {
  userUuid: text('user_uuid').primaryKey(),
  preferredInstrument: text('preferred_instrument').notNull().default('Guitar'),
  autoplayEnabled: integer('autoplay_enabled', { mode: 'boolean' }).notNull().default(true),
  autoplayTimeout: integer('autoplay_timeout').notNull().default(5),
  volume: integer('volume').notNull().default(100),
  playbackSpeed: real('playback_speed').notNull().default(1.0),
  updatedAt: integer('updated_at').notNull(),
});

// ---------------------------------------------------------------------------
// userSongProgress — one row per user × song (lazy-created on first save)
// ---------------------------------------------------------------------------
export const userSongProgress = sqliteTable(
  'user_song_progress',
  {
    id: text('id').primaryKey(),
    userUuid: text('user_uuid').notNull(),
    songId: text('song_id')
      .notNull()
      .references(() => songs.id, { onDelete: 'cascade' }),
    status: text('status').$type<ProgressStatus>().notNull().default('not_started'), // ProgressStatus
    speed: integer('speed').notNull().default(100),
    notes: text('notes'),
    scratchpadNotes: text('scratchpad_notes'),
    practiceMarkers: text('practice_markers'), // JSON number[]
    // Per-role-group offsets: { [roleGroupId]: { backing, tab } }. The two
    // legacy columns below remain as the fallback source for offsets saved
    // before the per-instrument split (read into '__legacy__' at_query time).
    offsets: text('offsets'),
    backingStartOffset: real('backing_start_offset'),
    tabStartOffset: real('tab_start_offset'),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => [
    uniqueIndex('user_song_unique_idx').on(table.userUuid, table.songId),
    index('user_song_progress_user_uuid_idx').on(table.userUuid),
  ]
);

// ---------------------------------------------------------------------------
// Relations
// ---------------------------------------------------------------------------
export const songsRelations = relations(songs, ({ many }) => ({
  roleGroups: many(roleGroups),
  rehearsalSongs: many(rehearsalSongs),
  userProgress: many(userSongProgress),
  customTracks: many(customTracks),
}));

export const roleGroupsRelations = relations(roleGroups, ({ one, many }) => ({
  song: one(songs, {
    fields: [roleGroups.songId],
    references: [songs.id],
  }),
  tracks: many(tracks),
  backingCustomTrack: one(customTracks, {
    fields: [roleGroups.backingCustomTrackId],
    references: [customTracks.id],
    relationName: 'backingRoleGroups',
  }),
  tabCustomTrack: one(customTracks, {
    fields: [roleGroups.tabCustomTrackId],
    references: [customTracks.id],
    relationName: 'tabRoleGroups',
  }),
}));

export const tracksRelations = relations(tracks, ({ one }) => ({
  roleGroup: one(roleGroups, {
    fields: [tracks.roleGroupId],
    references: [roleGroups.id],
  }),
}));

export const customTracksRelations = relations(customTracks, ({ one, many }) => ({
  song: one(songs, {
    fields: [customTracks.songId],
    references: [songs.id],
  }),
  backingRoleGroups: many(roleGroups, { relationName: 'backingRoleGroups' }),
  tabRoleGroups: many(roleGroups, { relationName: 'tabRoleGroups' }),
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

export const userSongProgressRelations = relations(userSongProgress, ({ one }) => ({
  song: one(songs, {
    fields: [userSongProgress.songId],
    references: [songs.id],
  }),
}));
