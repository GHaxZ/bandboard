import { sqliteTable, text, integer, real, primaryKey, uniqueIndex, index } from 'drizzle-orm/sqlite-core';
import { relations, sql } from 'drizzle-orm';
import type { Role, ProgressStatus } from '@/lib/constants';

// ---------------------------------------------------------------------------
// songs
// ---------------------------------------------------------------------------
export const songs = sqliteTable(
  'songs',
  {
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
  },
  (table) => [
    // Race-proof duplicate guard behind the findDuplicate() pre-check
    // (TOCTOU fix): same lower(title)+lower(artist)+song_type is impossible.
    uniqueIndex('songs_title_artist_type_unique').on(
      sql`lower(${table.title})`,
      sql`lower(${table.artist})`,
      table.songType
    ),
  ]
);

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
  (table) => [
    index('role_groups_song_id_idx').on(table.songId),
    index('role_groups_backing_custom_track_id_idx').on(table.backingCustomTrackId),
    index('role_groups_tab_custom_track_id_idx').on(table.tabCustomTrackId),
  ]
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
// rehearsals — `manual` (classic setlist) or `vote` (song vote that converts
// into a normal rehearsal once voting ends). Vote columns are null for manual.
// finalizedAt is set when the top-N voted songs are written into
// rehearsal_songs; from then on a vote rehearsal IS a manual rehearsal.
// ---------------------------------------------------------------------------
export const rehearsals = sqliteTable('rehearsals', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  date: integer('date').notNull(), // Unix-ms
  notes: text('notes'),
  type: text('type').$type<'manual' | 'vote'>().notNull().default('manual'),
  votingEndsAt: integer('voting_ends_at'), // Unix-ms
  songSelectionCount: integer('song_selection_count'),
  finalizedAt: integer('finalized_at'),
});

// ---------------------------------------------------------------------------
// rehearsalVotes — one toggle-vote per user per nominated song
// ---------------------------------------------------------------------------
export const rehearsalVotes = sqliteTable(
  'rehearsal_votes',
  {
    id: text('id').primaryKey(),
    rehearsalId: text('rehearsal_id')
      .notNull()
      .references(() => rehearsals.id, { onDelete: 'cascade' }),
    songId: text('song_id')
      .notNull()
      .references(() => songs.id, { onDelete: 'cascade' }),
    // No FK, mirrors userSongProgress.userUuid convention.
    userUuid: text('user_uuid').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (table) => [
    uniqueIndex('rehearsal_votes_unique').on(table.rehearsalId, table.songId, table.userUuid),
  ]
);

// ---------------------------------------------------------------------------
// rehearsalSongComments — flat per-song discussion thread during a vote
// ---------------------------------------------------------------------------
export const rehearsalSongComments = sqliteTable(
  'rehearsal_song_comments',
  {
    id: text('id').primaryKey(),
    rehearsalId: text('rehearsal_id')
      .notNull()
      .references(() => rehearsals.id, { onDelete: 'cascade' }),
    songId: text('song_id')
      .notNull()
      .references(() => songs.id, { onDelete: 'cascade' }),
    userUuid: text('user_uuid').notNull(),
    body: text('body').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (table) => [
    index('rehearsal_song_comments_rehearsal_song_idx').on(table.rehearsalId, table.songId),
  ]
);

// ---------------------------------------------------------------------------
// commentReads — per-user "seen" watermark per voted song. Written only when
// that song's comment popup is opened; drives the red dot + "New messages"
// divider.
// ---------------------------------------------------------------------------
export const commentReads = sqliteTable(
  'comment_reads',
  {
    userUuid: text('user_uuid').notNull(),
    rehearsalId: text('rehearsal_id')
      .notNull()
      .references(() => rehearsals.id, { onDelete: 'cascade' }),
    songId: text('song_id')
      .notNull()
      .references(() => songs.id, { onDelete: 'cascade' }),
    lastReadAt: integer('last_read_at').notNull(),
  },
  (table) => [primaryKey({ columns: [table.userUuid, table.rehearsalId, table.songId] })]
);

// ---------------------------------------------------------------------------
// rehearsalSongs — ordered junction. Doubles as the candidate list while a
// vote rehearsal is open: addedBy/addedAt record the nominator (null when the
// row came from a manual setlist edit).
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
    addedBy: text('added_by'),
    addedAt: integer('added_at'),
  },
  (table) => [
    primaryKey({ columns: [table.rehearsalId, table.songId] }),
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
  // ponytail: dead since the cookie migration (lib/device-media.ts); kept to
  // avoid a migration — drop when convenient.
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
    // ponytail: integer percent (50–200), unlike userSettings.playbackSpeed REAL
    // multiplier (0.5–2.0). Unifying means a data migration; not worth it yet.
    speed: integer('speed').notNull().default(100),
    notes: text('notes'),
    scratchpadNotes: text('scratchpad_notes'),
    practiceMarkers: text('practice_markers'), // JSON Record<string, number[]> keyed by roleGroupId/role; '__legacy__' = pre-split flat list
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
  ]
);

// ---------------------------------------------------------------------------
// users — real accounts. `id` reuses the anonymous device UUID so existing
// user_settings / user_song_progress rows stay valid when a device registers
// (no data migration needed).
// ---------------------------------------------------------------------------
export const users = sqliteTable(
  'users',
  {
    id: text('id').primaryKey(),
    username: text('username').notNull(),
    passwordHash: text('password_hash').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (table) => [uniqueIndex('users_username_unique').on(sql`lower(${table.username})`)]
);

export const sessions = sqliteTable(
  'sessions',
  {
    token: text('token').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: integer('created_at').notNull(),
  },
  (table) => [index('sessions_user_id_idx').on(table.userId)]
);

// ---------------------------------------------------------------------------
// loginFailures — persistent brute-force counters (survive restarts)
// ---------------------------------------------------------------------------
export const loginFailures = sqliteTable('login_failures', {
  key: text('key').primaryKey(), // "device:<uuid>" or "ip:<addr>"
  count: integer('count').notNull(),
  lastAt: integer('last_at').notNull(),
});

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
  votes: many(rehearsalVotes),
  comments: many(rehearsalSongComments),
}));

export const rehearsalVotesRelations = relations(rehearsalVotes, ({ one }) => ({
  rehearsal: one(rehearsals, {
    fields: [rehearsalVotes.rehearsalId],
    references: [rehearsals.id],
  }),
  song: one(songs, {
    fields: [rehearsalVotes.songId],
    references: [songs.id],
  }),
}));

export const rehearsalSongCommentsRelations = relations(rehearsalSongComments, ({ one }) => ({
  rehearsal: one(rehearsals, {
    fields: [rehearsalSongComments.rehearsalId],
    references: [rehearsals.id],
  }),
  song: one(songs, {
    fields: [rehearsalSongComments.songId],
    references: [songs.id],
  }),
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
