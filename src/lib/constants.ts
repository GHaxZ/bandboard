// ---------------------------------------------------------------------------
// Instrument roles — single source of truth (PLAN §8.2)
// ---------------------------------------------------------------------------
export const INSTRUMENT_ROLES = [
  'Guitar',
  'Bass',
  'Drums',
  'Vocals',
  'Piano/Keyboard',
  'Other',
] as const;
export type Role = (typeof INSTRUMENT_ROLES)[number];

/** Short label used in compact UIs (e.g. autoplay instrument tabs). */
export const ROLE_LABEL: Record<Role, string> = {
  Guitar: 'Guitar',
  Bass: 'Bass',
  Drums: 'Drums',
  Vocals: 'Vocals',
  'Piano/Keyboard': 'Keys',
  Other: 'Other',
};

// ---------------------------------------------------------------------------
// Progress statuses — single source of truth (PLAN §8.1)
// Emerald/Purple SWAPPED per user request:
//   Ready to Play = Emerald, Mastered = Purple
// ---------------------------------------------------------------------------
export type ProgressStatus =
  | 'not_started'
  | 'learning'
  | 'ready_to_play'
  | 'mastered';

export const PROGRESS_STATUSES = [
  {
    id: 'not_started' as ProgressStatus,
    label: 'Not Learned',
    dot: 'bg-red-500',
    text: 'text-red-400',
    soft: 'bg-red-950/40',
    border: 'border-red-900',
  },
  {
    id: 'learning' as ProgressStatus,
    label: 'Learning',
    dot: 'bg-sky-500',
    text: 'text-sky-400',
    soft: 'bg-sky-950/40',
    border: 'border-sky-800',
  },
  {
    id: 'ready_to_play' as ProgressStatus,
    label: 'Ready to Play',
    dot: 'bg-emerald-500',
    text: 'text-emerald-400',
    soft: 'bg-emerald-950/40',
    border: 'border-emerald-800',
  },
  {
    id: 'mastered' as ProgressStatus,
    label: 'Mastered',
    dot: 'bg-purple-500',
    text: 'text-purple-400',
    soft: 'bg-purple-950/40',
    border: 'border-purple-800',
  },
];

export const PROGRESS_STATUS_ORDER: ProgressStatus[] = PROGRESS_STATUSES.map(
  (s) => s.id
);

export function progressStatusMeta(id: string) {
  return (
    PROGRESS_STATUSES.find((s) => s.id === id) ?? PROGRESS_STATUSES[0]
  );
}

// ---------------------------------------------------------------------------
// Magic numbers (PLAN §8)
// ---------------------------------------------------------------------------
export const AUTOPLAY_TIMEOUT_MIN = 1;
export const AUTOPLAY_TIMEOUT_MAX = 60;
export const AUTOPLAY_TIMEOUT_DEFAULT = 5;

export const MAX_MARKERS = 9;

export const SPEED_MIN = 50;
export const SPEED_MAX = 200;
export const SPEED_DEFAULT = 100;

export const YT_SYNC_DRIFT_MS = 150; // re-align inactive player beyond this drift
export const YT_SYNC_INTERVAL_MS = 500;
export const SEEK_STEP_S = 5;
export const SEEK_DEBOUNCE_MS = 800;

export const NO_VIDEO_SKIP_MS = 4000;

/** Sentinel stored in roleGroups.backingTrackLink / tabVideoLink when a search
 *  returned no results, so lazyLoadTrackMedia doesn't re-search. */
export const NO_VIDEO_SENTINEL = 'none';

// ---------------------------------------------------------------------------
// Custom tracks — uploads, alignment, DAW view (PLAN §22.1)
// ---------------------------------------------------------------------------
export const ALLOWED_UPLOAD_MIMES = [
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/x-wav',
  'audio/wave',
  'audio/ogg',
  'audio/flac',
  'audio/x-flac',
  'audio/mp4',
  'audio/m4a',
  'audio/x-m4a',
  'audio/aac',
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'video/x-matroska',
];

export const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;

export const MULTITRACK_DRIFT_MS = 200;

export const DAW_PX_PER_SEC_DEFAULT = 50;
export const DAW_PX_PER_SEC_MIN = 10;
export const DAW_PX_PER_SEC_MAX = 200;

export const ROLE_COLORS: Record<Role, string> = {
  Guitar: 'bg-[#5b80a5]',
  Bass: 'bg-[#4ea388]',
  Drums: 'bg-[#cf73b5]',
  Vocals: 'bg-[#cf9c73]',
  'Piano/Keyboard': 'bg-[#73a2cf]',
  Other: 'bg-[#9ebbcf]',
};
