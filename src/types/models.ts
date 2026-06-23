export interface Track {
  id: string;
  roleGroupId: string;
  instrumentName: string;
  role: string;
  details: string | null;
  tuning: string;
  tabLink: string;
}

export interface RoleGroup {
  id: string;
  songId: string;
  role: string;
  backingTrackLink: string | null;
  tabVideoLink: string | null;
  tracks: Track[];
}

export interface Song {
  id: string;
  title: string;
  artist: string;
  songsterrId: number | null;
  albumArt: string | null;
  lyrics?: string | null;
  createdAt: number;
  roleGroups: RoleGroup[];
}

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
  rehearsalSongs: {
    song: Song;
  }[];
}

export interface RehearsalDetails {
  id: string;
  title: string;
  date: number;
  notes: string | null;
  rehearsalSongs: RehearsalSong[];
}

export interface UserProgress {
  status: string;
  speed: number;
  notes: string | null;
  practiceMarkers?: string | null;
  backingStartOffset?: number | null;
  tabStartOffset?: number | null;
}

export type ProgressMap = Record<string, UserProgress>;
