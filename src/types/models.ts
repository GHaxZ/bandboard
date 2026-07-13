import type { Role, ProgressStatus, SongType } from '@/lib/constants';

// ---------------------------------------------------------------------------
// Plain serializable shapes matching Drizzle rows (with nested relations).
// Server components pass these to client components as props.
// ---------------------------------------------------------------------------

export interface Track {
  id: string;
  roleGroupId: string;
  instrumentName: string;
  details: string | null;
  tuning: string;
  tabLink: string;
}

export interface CustomTrack {
  id: string;
  songId: string;
  role: Role;
  label: string;
  fileName: string;
  storedName: string;
  mimeType: string;
  sizeBytes: number;
  duration: number | null;
  startOffset: number;
  isVideo: boolean;
  createdAt: number;
}

export interface RoleGroup {
  id: string;
  songId: string;
  role: Role;
  backingTrackLink: string | null;
  tabVideoLink: string | null;
  backingCustomTrackId: string | null;
  tabCustomTrackId: string | null;
  tracks: Track[];
}

export interface Song {
  id: string;
  title: string;
  artist: string;
  songsterrId: number | null;
  albumArt: string | null;
  lyricsUrl: string | null;
  songType: SongType;
  tunings: Record<string, string> | null;
  coverArtStoredName: string | null;
  createdAt: number;
  roleGroups: RoleGroup[];
  customTracks?: CustomTrack[];
}

// Discriminated union describing what plays as the "backing track" for a song
// during practice or setlist autoplay. Phase 0 only declares the shape; later
// phases populate it.
export type BackingMedia =
  | { kind: 'youtube'; videoId: string; offset: number }
  | { kind: 'custom-file'; customTrackId: string; offset: number }
  | { kind: 'multistem'; tracks: CustomTrack[]; mutedRole: Role }
  | { kind: 'none' };

export interface RehearsalSong {
  rehearsalId: string;
  songId: string;
  sortOrder: number;
  song: Song;
}

export interface Rehearsal {
  id: string;
  title: string;
  date: number;
  notes: string | null;
  rehearsalSongs: { song: Song }[];
}

export interface RehearsalDetails {
  id: string;
  title: string;
  date: number;
  notes: string | null;
  rehearsalSongs: RehearsalSong[];
}

// ---------------------------------------------------------------------------
// Per-user progress (plain serializable). Missing rows are represented as
// defaults in the app layer, not stored.
// ---------------------------------------------------------------------------
export interface RoleGroupOffsets {
  backing: number;
  tab: number;
}

export interface UserProgress {
  status: ProgressStatus;
  speed: number;
  notes: string | null;
  scratchpadNotes: string | null;
  practiceMarkers: number[] | null;
  // Keyed by role group id. The '__legacy__' key holds pre-split offsets
  // migrated from the old per-song columns; used as a fallback for role
  // groups without their own entry.
  offsets: Record<string, RoleGroupOffsets>;
}

export type ProgressMap = Record<string, UserProgress>;

export const DEFAULT_PROGRESS: UserProgress = {
  status: 'not_started',
  speed: 100,
  notes: null,
  scratchpadNotes: null,
  practiceMarkers: null,
  offsets: {},
};

const ZERO_OFFSETS: RoleGroupOffsets = { backing: 0, tab: 0 };

/**
 * Resolve the saved sync offsets for a given role group (by id) from a
 * `UserProgress` row. Falls back to the pre-split `__legacy__` entry, then to
 * zeros. Keeps the per-instrument offset lookups in one place.
 */
export function resolveOffsets(
  progress: UserProgress | undefined | null,
  roleGroupId: string | null | undefined
): RoleGroupOffsets {
  if (!progress || !progress.offsets) return ZERO_OFFSETS;
  if (roleGroupId && progress.offsets[roleGroupId]) return progress.offsets[roleGroupId];
  return progress.offsets['__legacy__'] ?? ZERO_OFFSETS;
}

export interface UserSettings {
  preferredInstrument: Role;
  autoplayEnabled: boolean;
  autoplayTimeout: number;
  volume: number;
  playbackSpeed: number;
}

export const DEFAULT_USER_SETTINGS: UserSettings = {
  preferredInstrument: 'Guitar',
  autoplayEnabled: true,
  autoplayTimeout: 5,
  volume: 100,
  playbackSpeed: 1.0,
};
