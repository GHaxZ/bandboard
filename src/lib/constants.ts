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
// Song types — cover vs original
// ---------------------------------------------------------------------------
export type SongType = 'cover' | 'original';

export const SONG_TYPE_LABEL: Record<SongType, string> = {
  cover: 'Cover',
  original: 'Original',
};

export const SONG_TYPE_BADGE: Record<SongType, { text: string; soft: string; border: string }> = {
  cover: {
    text: 'text-sky-700 dark:text-sky-400',
    soft: 'bg-sky-500/10 dark:bg-sky-950/40',
    border: 'border-sky-600/30 dark:border-sky-800',
  },
  original: {
    text: 'text-amber-700 dark:text-amber-400',
    soft: 'bg-amber-500/10 dark:bg-amber-950/40',
    border: 'border-amber-600/30 dark:border-amber-800',
  },
};

// ---------------------------------------------------------------------------
// Rehearsal types — manual session vs song vote (mirrors SONG_TYPE_BADGE)
// ---------------------------------------------------------------------------
export type RehearsalType = 'manual' | 'vote';

export const REHEARSAL_TYPE_LABEL: Record<RehearsalType, string> = {
  manual: 'Session',
  vote: 'Vote',
};

export const REHEARSAL_TYPE_BADGE: Record<
  RehearsalType,
  { text: string; soft: string; border: string }
> = {
  manual: {
    text: 'text-teal-700 dark:text-teal-400',
    soft: 'bg-teal-500/10 dark:bg-teal-950/40',
    border: 'border-teal-600/30 dark:border-teal-800',
  },
  vote: {
    text: 'text-violet-700 dark:text-violet-400',
    soft: 'bg-violet-500/10 dark:bg-violet-950/40',
    border: 'border-violet-600/30 dark:border-violet-800',
  },
};

/** Minimum songs a vote promotes into the final setlist (no upper cap —
 *  bounded in practice by the number of candidates). */
export const VOTE_SELECTION_MIN = 1;

export const MAX_COMMENT_LENGTH = 1000;

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
    text: 'text-red-700 dark:text-red-400',
    soft: 'bg-red-500/10 dark:bg-red-950/40',
    border: 'border-red-600/30 dark:border-red-900',
  },
  {
    id: 'learning' as ProgressStatus,
    label: 'Learning',
    dot: 'bg-sky-500',
    text: 'text-sky-700 dark:text-sky-400',
    soft: 'bg-sky-500/10 dark:bg-sky-950/40',
    border: 'border-sky-600/30 dark:border-sky-800',
  },
  {
    id: 'ready_to_play' as ProgressStatus,
    label: 'Ready to Play',
    dot: 'bg-emerald-500',
    text: 'text-emerald-700 dark:text-emerald-400',
    soft: 'bg-emerald-500/10 dark:bg-emerald-950/40',
    border: 'border-emerald-600/30 dark:border-emerald-800',
  },
  {
    id: 'mastered' as ProgressStatus,
    label: 'Mastered',
    dot: 'bg-purple-500',
    text: 'text-purple-700 dark:text-purple-400',
    soft: 'bg-purple-500/10 dark:bg-purple-950/40',
    border: 'border-purple-600/30 dark:border-purple-800',
  },
];

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
  'audio/vnd.wave',
  'audio/ogg',
  'audio/flac',
  'audio/x-flac',
  'audio/mp4',
  'audio/m4a',
  'audio/x-m4a',
  'audio/aac',
  'audio/aiff',
  'audio/x-aiff',
  'audio/opus',
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'video/x-matroska',
];

// ponytail: uploads buffer fully in RAM (route.ts arrayBuffer()); 250MB peaks
// are fine on LAN hardware. Switch to streamed writes if RAM becomes an issue.
export const MAX_UPLOAD_BYTES = 250 * 1024 * 1024;

/** File-picker accept value. Extensions listed explicitly because OS pickers
 *  don't map every allowed MIME under audio/* (e.g. .aiff), which hides files
 *  the server would happily accept. */
export const UPLOAD_ACCEPT = [
  'audio/*',
  'video/*',
  '.mp3', '.wav', '.aif', '.aiff', '.opus', '.flac', '.ogg',
  '.m4a', '.aac', '.mp4', '.webm', '.mov', '.mkv',
].join(',');

/** Unified upload limits for stems, cover art, and the proxy cap. */
export const UPLOAD_LIMITS = {
  stem: MAX_UPLOAD_BYTES,
  coverArt: 5 * 1024 * 1024,
  proxyCap: '250mb',
} as const;

export const MULTITRACK_DRIFT_MS = 200;

export const DAW_PX_PER_SEC_DEFAULT = 50;
export const DAW_PX_PER_SEC_MIN = 10;
export const DAW_PX_PER_SEC_MAX = 200;

export const ROLE_COLORS: Record<Role, string> = {
  Guitar: 'bg-role-guitar',
  Bass: 'bg-role-bass',
  Drums: 'bg-role-drums',
  Vocals: 'bg-role-vocals',
  'Piano/Keyboard': 'bg-role-keys',
  Other: 'bg-role-other',
};

// ---------------------------------------------------------------------------
// Auth cookies — single source of truth for names/lifetime (proxy.ts and
// actions/auth.ts must stay in sync; import from here).
// ---------------------------------------------------------------------------
export const TEN_YEARS = 60 * 60 * 24 * 365 * 10;
/** Anonymous pre-registration identity. Registration adopts it as users.id. */
export const UID_COOKIE = 'bandboard_uid';
/** Session token → sessions table row. */
export const SESSION_COOKIE = 'bandboard_session';

// ---------------------------------------------------------------------------
// Rate limiting — single source of truth (LAN-generous; tune if exposed)
// ---------------------------------------------------------------------------
export const RATE_LIMITS = {
  /** Stem + cover-art uploads per user. */
  uploads: { max: 20, windowMs: 10 * 60 * 1000 },
  /** YouTube scrape / metadata enrichment actions per user. */
  scrape: { max: 20, windowMs: 60 * 1000 },
  /** Registration attempts per device. */
  register: { max: 5, windowMs: 10 * 60 * 1000 },
} as const;

export const MAX_LOGIN_FAILURES = 5; // per device (unchanged behavior)
export const MAX_IP_LOGIN_FAILURES = 30; // per IP, catches cookie rotation

// ---------------------------------------------------------------------------
// Browser playback probe — non-blocking warning at file pick time.
// canPlayType reports '' for containers it actually plays via sniffing
// (.mov/h264, wav aliases), so map accepted mimes to canonical probes first.
// ponytail: unmapped types (mkv, ogg on Safari) intentionally warn everywhere.
// ---------------------------------------------------------------------------
const CANPLAY_ALIAS: Record<string, string> = {
  'audio/mp3': 'audio/mpeg',
  'audio/x-wav': 'audio/wav',
  'audio/wave': 'audio/wav',
  'audio/vnd.wave': 'audio/wav',
  'audio/x-flac': 'audio/flac',
  'audio/m4a': 'audio/mp4',
  'audio/x-m4a': 'audio/mp4',
  'audio/x-aiff': 'audio/aiff',
  'video/quicktime': 'video/mp4',
};

export function browserCanPlay(mime: string): boolean {
  if (typeof window === 'undefined') return true;
  const el = document.createElement(mime.startsWith('video/') ? 'video' : 'audio');
  return el.canPlayType(CANPLAY_ALIAS[mime] ?? mime) !== '';
}
export const LOGIN_FAILURE_WINDOW_MS = 5 * 60 * 1000;
