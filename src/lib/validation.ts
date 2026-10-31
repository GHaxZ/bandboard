import {
  AUTOPLAY_TIMEOUT_MIN,
  AUTOPLAY_TIMEOUT_MAX,
  SPEED_MIN,
  SPEED_MAX,
  MAX_MARKERS,
  PROGRESS_STATUSES,
  VOTE_SELECTION_MIN,
  INSTRUMENT_ROLES, INPUT_LIMITS,
} from './constants';

// ---------------------------------------------------------------------------
// Clamp helpers
// ---------------------------------------------------------------------------
export function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export function clampVolume(v: number): number {
  return clamp(Math.round(v), 0, 100);
}

export function clampPlaybackSpeed(v: number): number {
  return clamp(v, SPEED_MIN / 100, SPEED_MAX / 100);
}

export function clampAutoplayTimeout(v: number): number {
  return clamp(Math.round(v), AUTOPLAY_TIMEOUT_MIN, AUTOPLAY_TIMEOUT_MAX);
}

// ---------------------------------------------------------------------------
// Validators — return null on success, error string on failure
// ---------------------------------------------------------------------------
export function validateUserSettings(s: Record<string, unknown>): string | null {
  if (s.preferredInstrument !== undefined && !(INSTRUMENT_ROLES as readonly unknown[]).includes(s.preferredInstrument)) {
    return 'Invalid preferred instrument';
  }
  if (s.autoplayEnabled !== undefined && typeof s.autoplayEnabled !== 'boolean') {
    return 'autoplayEnabled must be a boolean';
  }
  if (s.volume !== undefined && (typeof s.volume !== 'number' || !Number.isFinite(s.volume))) {
    return 'volume must be a number';
  }
  if (s.playbackSpeed !== undefined && (typeof s.playbackSpeed !== 'number' || !Number.isFinite(s.playbackSpeed))) {
    return 'playbackSpeed must be a number';
  }
  if (s.autoplayTimeout !== undefined && (typeof s.autoplayTimeout !== 'number' || !Number.isFinite(s.autoplayTimeout))) {
    return 'autoplayTimeout must be a number';
  }
  return null;
}

export function validateSongProgress(p: Record<string, unknown>): string | null {
  if (!boundedText(p.notes, INPUT_LIMITS.notes, true)) return 'Notes are too long';
  if (p.status !== undefined) {
    const valid = PROGRESS_STATUSES.map((s) => s.id);
    if (!(valid as string[]).includes(p.status as string)) return `status must be one of: ${valid.join(', ')}`;
  }
  if (p.speed !== undefined && (typeof p.speed !== 'number' || !Number.isFinite(p.speed) || p.speed < SPEED_MIN || p.speed > SPEED_MAX)) {
    return `speed must be between ${SPEED_MIN} and ${SPEED_MAX}`;
  }
  return null;
}

export function validatePracticeMarkers(markers: unknown): string | null {
  if (!Array.isArray(markers)) return 'markers must be an array';
  if (markers.length > MAX_MARKERS) return `at most ${MAX_MARKERS} markers allowed`;
  if (!markers.every((m) => typeof m === 'number' && Number.isFinite(m))) {
    return 'each marker must be a finite number';
  }
  return null;
}

export function validateStartOffsets(o: Record<string, unknown>): string | null {
  if (o.backing !== undefined && (typeof o.backing !== 'number' || !Number.isFinite(o.backing))) {
    return 'backing offset must be a finite number';
  }
  if (o.tab !== undefined && (typeof o.tab !== 'number' || !Number.isFinite(o.tab))) {
    return 'tab offset must be a finite number';
  }
  return null;
}

export function validateRehearsal(
  r: Record<string, unknown>,
  opts?: { /** Exemption for editing a row whose stored end is already past. */
    allowPastVotingEnd?: boolean }
): string | null {
  if (!boundedText(r.title, INPUT_LIMITS.title, true) || !boundedText(r.notes, INPUT_LIMITS.notes, true)) return 'Title or notes are too long';
  if (r.type !== undefined && r.type !== 'manual' && r.type !== 'vote') {
    return 'Invalid rehearsal type';
  }
  if (r.title !== undefined && (typeof r.title !== 'string' || !r.title.trim())) {
    return 'title is required';
  }
  if (r.date !== undefined && (typeof r.date !== 'number' || !Number.isSafeInteger(r.date) || Math.abs(r.date) > 8.64e15)) {
    return 'date must be an integer (Unix ms)';
  }
  if (r.type === 'vote') {
    if (typeof r.votingEndsAt !== 'number' || !Number.isSafeInteger(r.votingEndsAt)) {
      return 'votingEndsAt must be an integer (Unix ms)';
    }
    if (
      typeof r.songSelectionCount !== 'number' ||
      !Number.isInteger(r.songSelectionCount) ||
      (r.songSelectionCount < VOTE_SELECTION_MIN || r.songSelectionCount > INPUT_LIMITS.librarySongs)
    ) {
      return `songSelectionCount must be an integer of at least ${VOTE_SELECTION_MIN}`;
    }
  }
  if (
    r.type === 'vote' &&
    typeof r.date === 'number' &&
    typeof r.votingEndsAt === 'number' &&
    r.votingEndsAt > r.date
  ) {
    return 'Voting must end before the rehearsal starts';
  }
  if (
    !opts?.allowPastVotingEnd &&
    r.type === 'vote' &&
    typeof r.votingEndsAt === 'number' &&
    r.votingEndsAt <= Date.now()
  ) {
    return 'Voting end must be in the future';
  }
  return null;
}

export function boundedText(value: unknown, max: number, optional = false): boolean {
  return optional && (value === null || value === undefined) || typeof value === 'string' && value.length <= max;
}
export function validMapKey(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= INPUT_LIMITS.mapKey &&
    !['__proto__', 'prototype', 'constructor'].includes(value);
}
export function boundedMap(map: object, key: string): boolean {
  return Object.hasOwn(map, key) || Object.keys(map).length < INPUT_LIMITS.mapKeys;
}
export function validTunings(value: unknown): boolean {
  if (value === null) return true;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return Object.entries(value).length <= INPUT_LIMITS.mapKeys && Object.entries(value).every(([k, v]) =>
    validMapKey(k) && boundedText(v, INPUT_LIMITS.tuning));
}
